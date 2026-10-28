/**
 * Detect known UTF-8 / Windows-1252 mojibake and restore the original
 * Unicode character. Ambiguous leftovers are reported, never deleted.
 *
 * Usage:
 *   npm run db:text-corruption -- --dry-run
 *   TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL=true npm run db:text-corruption -- --apply
 *
 * Apply is restricted to loopback DATABASE_URL hosts and requires the explicit
 * local opt-in above. A verified custom-format pg_dump is mandatory first.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';
import { homedir } from 'os';
import { basename, isAbsolute, relative, resolve } from 'path';
import {
  SQL_INDICATOR,
  cleanJson as repairJson,
  hasIndicator as hasCorruptionIndicator,
  repairText,
  type UnresolvedFragment,
} from './text-corruption-repair';

dotenv.config();

export {
  SQL_INDICATOR,
  cleanJson,
  cleanString,
  hasIndicator,
  repairText,
} from './text-corruption-repair';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SAMPLE_LIMIT = 50;
const PREVIEW_CHARS = 100;
const skippedFields = new Set<string>();
const reviewItems: ReviewItem[] = [];
const BACKUP_ROOT =
  process.env['TEXT_CORRUPTION_BACKUP_DIR']?.trim() || resolve(homedir(), 'cureka-db-backups');

type Mode = 'dry-run' | 'apply';
type PgColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
};
type TableSpec = { table: string; requested?: string[]; textColumns?: boolean };
type Candidate = {
  table: string;
  column: string;
  type: string;
  pk: Record<string, unknown>;
  before: unknown;
  after: unknown;
};
type ReviewItem = {
  table: string;
  column: string;
  pk: Record<string, unknown>;
  unresolved: UnresolvedFragment[];
  preview: string;
};
type QueryResult<T> = { rows: T[]; rowCount: number | null };
type PgClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
};
const PgClientCtor = (require('pg') as { Client: new (options: object) => PgClient }).Client;

const TABLE_SPECS: TableSpec[] = [
  { table: 'product_faqs', requested: ['question', 'answer'] },
  {
    table: 'product_variants',
    requested: [
      'faqs',
      'meta_description',
      'meta_title',
      'search_tags',
      'meta_keywords',
      'product_information',
      'display_name',
      'components',
    ],
  },
  { table: 'products', textColumns: true },
  { table: 'blog_posts', textColumns: true },
];

function parseMode(argv: string[]): Mode {
  if (argv.length !== 1 || !['--dry-run', '--apply'].includes(argv[0])) {
    throw new Error('Pass exactly one mode: --dry-run or --apply. No mode defaults to apply.');
  }
  return argv[0] === '--apply' ? 'apply' : 'dry-run';
}

function assertLocalDatabase(): { url: URL; dbName: string } {
  const raw = process.env['DATABASE_URL'];
  if (!raw)
    throw new Error('DATABASE_URL is required (loaded through the project dotenv configuration).');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL.');
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(
      `Refusing non-local database host "${url.hostname}". Use a loopback local DATABASE_URL.`,
    );
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName) throw new Error('DATABASE_URL must identify a local database name.');
  return { url, dbName };
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function recordReviews(
  table: string,
  column: string,
  pk: Record<string, unknown>,
  before: unknown,
  unresolved: UnresolvedFragment[],
): void {
  if (!unresolved.length) return;
  reviewItems.push({
    table,
    column,
    pk,
    unresolved,
    preview: safePreview(before),
  });
}

function isJsonColumn(column: PgColumn): boolean {
  return column.data_type === 'json' || column.data_type === 'jsonb';
}

function isTextColumn(column: PgColumn): boolean {
  return ['text', 'character varying', 'character'].includes(column.data_type);
}

function safePreview(value: unknown): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const oneLine = String(raw ?? '').replace(/[\r\n\t]+/g, ' ');
  return oneLine.length > PREVIEW_CHARS ? `${oneLine.slice(0, PREVIEW_CHARS)}…` : oneLine;
}

function redactPk(pk: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(pk).map(([key, value]) => [
      key,
      /email|phone|password|token/i.test(key) ? '[REDACTED]' : value,
    ]),
  );
}

function backupLocalDatabase(url: URL, dbName: string): string {
  const backupDir = resolve(BACKUP_ROOT);
  const repoRoot = resolve(process.cwd());
  const pathFromRepo = relative(repoRoot, backupDir);
  const configuredRoot = process.env['TEXT_CORRUPTION_BACKUP_DIR']?.trim();
  if (
    (configuredRoot && !isAbsolute(configuredRoot)) ||
    (!pathFromRepo.startsWith('..') && pathFromRepo !== '..')
  ) {
    throw new Error('Backup directory must be an absolute path outside the repository.');
  }
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = resolve(backupDir, `${basename(dbName)}-text-cleanup-${stamp}-${randomUUID()}.dump`);
  if (existsSync(file)) throw new Error('Refusing to overwrite an existing backup file.');
  const env = { ...process.env };
  env['PGHOST'] = url.hostname;
  env['PGPORT'] = url.port || '5432';
  env['PGDATABASE'] = dbName;
  env['PGUSER'] = decodeURIComponent(url.username);
  if (url.password) env['PGPASSWORD'] = decodeURIComponent(url.password);
  const dump = spawnSync('pg_dump', ['--format=custom', `--file=${file}`], {
    env,
    encoding: 'utf8',
  });
  if (dump.status !== 0)
    throw new Error(`pg_dump failed (${dump.status ?? 'signal'}); database was not modified.`);
  const info = statSync(file);
  if (!info.isFile() || info.size === 0)
    throw new Error('Backup is missing or empty; database was not modified.');
  const verify = spawnSync('pg_restore', ['--list', file], { env, encoding: 'utf8' });
  if (verify.status !== 0 || !verify.stdout?.includes('Dumped from database version')) {
    throw new Error(
      'pg_restore could not verify the custom-format backup; database was not modified.',
    );
  }
  console.log(`[backup] verified custom-format backup: ${file} (${info.size} bytes)`);
  return file;
}

async function loadSchema(client: PgClient): Promise<Map<string, PgColumn[]>> {
  const result = await client.query<PgColumn>(
    `SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable
       FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = ANY($1::text[])
      ORDER BY c.table_name, c.ordinal_position`,
    [TABLE_SPECS.map((spec) => spec.table)],
  );
  const columns = new Map<string, PgColumn[]>();
  for (const row of result.rows)
    columns.set(row.table_name, [...(columns.get(row.table_name) ?? []), row]);
  return columns;
}

async function loadPrimaryKeys(client: PgClient, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT a.attname AS column_name
       FROM pg_index i
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN unnest(i.indkey) WITH ORDINALITY k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public' AND t.relname = $1 AND i.indisprimary
      ORDER BY k.ord`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function scanTable(
  client: PgClient,
  spec: TableSpec,
  schema: Map<string, PgColumn[]>,
): Promise<Candidate[]> {
  const actual = schema.get(spec.table);
  if (!actual?.length) {
    console.log(`[schema] public.${spec.table}: table missing; skipped`);
    skippedFields.add(spec.table);
    return [];
  }
  const primaryKeys = await loadPrimaryKeys(client, spec.table);
  if (!primaryKeys.length) {
    console.log(`[schema] public.${spec.table}: primary key missing; skipped`);
    skippedFields.add(`${spec.table}.*`);
    return [];
  }
  const requested = spec.requested ?? actual.map((column) => column.column_name);
  const eligible: PgColumn[] = [];
  for (const name of requested) {
    const column = actual.find((item) => item.column_name === name);
    if (!column) {
      console.log(`[schema] public.${spec.table}.${name}: missing; skipped`);
      skippedFields.add(`${spec.table}.${name}`);
    } else if (!isTextColumn(column) && !isJsonColumn(column)) {
      console.log(
        `[schema] public.${spec.table}.${name}: incompatible type ${column.data_type}; skipped`,
      );
      skippedFields.add(`${spec.table}.${name}`);
    } else {
      eligible.push(column);
      console.log(
        `[schema] public.${spec.table}.${name}: ${column.data_type}, nullable=${column.is_nullable}`,
      );
    }
  }
  if (!eligible.length) return [];

  const selected = [...new Set([...primaryKeys, ...eligible.map((item) => item.column_name)])];
  const predicates = eligible
    .map((column) => `${quoteIdent(column.column_name)}::text ~ $1`)
    .join(' OR ');
  const result = await client.query(
    `SELECT ${selected.map(quoteIdent).join(', ')} FROM public.${quoteIdent(spec.table)} WHERE ${predicates}`,
    [SQL_INDICATOR],
  );
  const candidates: Candidate[] = [];
  for (const row of result.rows as Record<string, unknown>[]) {
    const pk = Object.fromEntries(primaryKeys.map((key) => [key, row[key]]));
    for (const column of eligible) {
      const before = row[column.column_name];
      let after = before;
      let changed = false;
      let unresolved: UnresolvedFragment[] = [];
      if (isJsonColumn(column)) {
        const repaired = repairJson(before);
        after = repaired.value;
        changed = repaired.changed;
        unresolved = repaired.unresolved;
      } else if (typeof before === 'string' && hasCorruptionIndicator(before)) {
        const repaired = repairText(before);
        after = repaired.value;
        changed = repaired.changed;
        unresolved = repaired.unresolved;
      }
      recordReviews(spec.table, column.column_name, pk, before, unresolved);
      if (changed) {
        candidates.push({
          table: spec.table,
          column: column.column_name,
          type: column.data_type,
          pk,
          before,
          after,
        });
      }
    }
  }
  console.log(
    `[scan] public.${spec.table}: ${result.rowCount ?? 0} rows matched SQL indicators; ${candidates.length} field candidates`,
  );
  return candidates;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const { url, dbName } = assertLocalDatabase();
  if (mode === 'apply' && process.env['TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL'] !== 'true') {
    throw new Error(
      'Apply requires TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL=true and a loopback DATABASE_URL.',
    );
  }
  console.log(`[target] local database=${dbName}; mode=${mode}; credentials omitted`);
  if (mode === 'apply') backupLocalDatabase(url, dbName);

  const client = new PgClientCtor({
    connectionString: process.env['DATABASE_URL'],
    ssl: false,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  let inTransaction = false;
  try {
    const identity = await client.query<{ database_name: string; server_address: string | null }>(
      'SELECT current_database() AS database_name, inet_server_addr()::text AS server_address',
    );
    const serverVersion = await client.query<{ server_version: string }>('SHOW server_version');
    if (identity.rows[0]?.database_name !== dbName)
      throw new Error('Connected database identity differs from DATABASE_URL.');
    console.log(
      `[target] PostgreSQL ${serverVersion.rows[0]?.server_version ?? 'version unavailable'}; server address=${identity.rows[0]?.server_address ?? 'local socket'}`,
    );
    reviewItems.length = 0;
    const regexProbe = await client.query<{ sample: string; matches: boolean }>(
      'SELECT sample, sample ~ $1 AS matches FROM unnest($2::text[]) AS samples(sample)',
      [SQL_INDICATOR, ['Ã¢â‚¬â„¢', 'Â°', 'ï¿½', 'ðŸ', 'ordinary text']],
    );
    console.log(`[regex] PostgreSQL pattern probe: ${JSON.stringify(regexProbe.rows)}`);
    if (mode === 'apply') {
      await client.query('BEGIN');
      inTransaction = true;
    } else {
      await client.query('BEGIN READ ONLY');
      inTransaction = true;
    }

    const schema = await loadSchema(client);
    const candidates: Candidate[] = [];
    for (const spec of TABLE_SPECS) candidates.push(...(await scanTable(client, spec, schema)));
    const matchedRows = new Map<string, Set<string>>();
    for (const item of candidates) {
      const key = `${item.table}:${JSON.stringify(item.pk)}`;
      matchedRows.set(key, new Set([...(matchedRows.get(key) ?? []), item.column]));
    }
    console.log(
      `[summary] matched rows=${matchedRows.size}; matched fields=${candidates.length}; review fields=${reviewItems.length}; skipped fields=${skippedFields.size}; failures=0; mode=${mode}`,
    );
    const reportCandidates = mode === 'apply' ? candidates : candidates.slice(0, SAMPLE_LIMIT);
    for (const item of reportCandidates) {
      console.log(
        JSON.stringify({
          action: mode === 'apply' ? 'pending' : 'detected',
          table: `public.${item.table}`,
          column: item.column,
          primaryKey: redactPk(item.pk),
          before: safePreview(item.before),
          after: safePreview(item.after),
        }),
      );
    }
    if (mode === 'dry-run' && candidates.length > SAMPLE_LIMIT)
      console.log(`[report] showing first ${SAMPLE_LIMIT} of ${candidates.length} field samples`);
    const reportReviews = mode === 'apply' ? reviewItems : reviewItems.slice(0, SAMPLE_LIMIT);
    for (const item of reportReviews) {
      console.log(
        JSON.stringify({
          action: 'review',
          table: `public.${item.table}`,
          column: item.column,
          primaryKey: redactPk(item.pk),
          unresolved: item.unresolved,
          preview: item.preview,
        }),
      );
    }
    if (mode === 'dry-run' && reviewItems.length > SAMPLE_LIMIT)
      console.log(`[report] showing first ${SAMPLE_LIMIT} of ${reviewItems.length} review samples`);

    if (mode === 'apply') {
      let updated = 0;
      for (const item of candidates) {
        const pkNames = Object.keys(item.pk);
        const where = pkNames
          .map((key, index) => `${quoteIdent(key)} = $${index + 2}`)
          .join(' AND ');
        const update = await client.query(
          `UPDATE public.${quoteIdent(item.table)} SET ${quoteIdent(item.column)} = $1 WHERE ${where} AND ${quoteIdent(item.column)} IS NOT DISTINCT FROM $${pkNames.length + 2}`,
          [item.after, ...pkNames.map((key) => item.pk[key]), item.before],
        );
        if (update.rowCount !== 1)
          throw new Error(
            `Expected one updated row for public.${item.table}.${item.column}; got ${update.rowCount ?? 0}.`,
          );
        updated += update.rowCount ?? 0;
        console.log(
          JSON.stringify({
            action: 'updated',
            table: `public.${item.table}`,
            column: item.column,
            primaryKey: redactPk(item.pk),
            before: safePreview(item.before),
            after: safePreview(item.after),
          }),
        );
      }
      reviewItems.length = 0;
      const remainingTargetCandidates: Candidate[] = [];
      for (const spec of TABLE_SPECS)
        remainingTargetCandidates.push(...(await scanTable(client, spec, schema)));
      if (remainingTargetCandidates.length)
        throw new Error('Post-update verification failed; rolling back.');
      await client.query('COMMIT');
      inTransaction = false;
      console.log(
        `[summary] updated fields=${updated}; post-update repairable matches=0; review fields=${reviewItems.length}; skipped fields=${skippedFields.size}; failures=0; transaction committed.`,
      );
    } else {
      await client.query('ROLLBACK');
      inTransaction = false;
      console.log('[dry-run] read-only transaction rolled back; no writes performed.');
    }
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const failure = error as { name?: string; message?: string; code?: string };
    const detail = failure?.message || failure?.code || failure?.name || 'unknown error';
    console.error(
      '[text-corruption-cleanup] failed (failures=1):',
      detail,
      failure?.code ? `(code ${failure.code})` : '',
    );
    process.exitCode = 1;
  });
}
