/**
 * Detect known UTF-8 / Windows-1252 mojibake and restore the original
 * Unicode character. Ambiguous leftovers are reported, never deleted.
 *
 * Apply requires explicit target and preview confirmation plus a pre-existing,
 * verified custom-format backup. Remote access has a separate explicit gate.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import { statSync } from 'fs';
import { createHash } from 'crypto';
import { isAbsolute } from 'path';
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
const REMOTE_ALLOWED_HOST = '8.231.74.20';
const REMOTE_CONFIRMATION = 'I_UNDERSTAND_THIS_IS_REMOTE_CUREKA_DATABASE';
const SAMPLE_KEYS_PER_GROUP = 3;
const SAMPLE_LIMIT = 50;
const PREVIEW_CHARS = 100;
const skippedFields = new Set<string>();
const reviewItems: ReviewItem[] = [];

export type Mode = 'dry-run' | 'apply';
type Environment = Record<string, string | undefined>;
type Target = { host: string; dbName: string; local: boolean; url: URL };
type BackupFileInfo = { isFile(): boolean; size: number; mtimeMs: number };
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
type CandidateGroup = { table: string; column: string; candidates: Candidate[] };
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

export function parseMode(argv: string[]): Mode {
  if (argv.length !== 1 || !['--dry-run', '--apply'].includes(argv[0])) {
    throw new Error('Pass exactly one mode: --dry-run or --apply. No mode defaults to apply.');
  }
  return argv[0] === '--apply' ? 'apply' : 'dry-run';
}

export function resolveDatabaseTarget(
  raw: string | undefined,
  mode: Mode,
  env: Environment,
): Target {
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
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName) throw new Error('DATABASE_URL must identify a database name.');
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return { host, dbName, local: true, url };

  if (env['TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE'] !== 'true')
    throw new Error(
      'Remote access is disabled; explicitly set TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE=true.',
    );
  if (env['TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM'] !== REMOTE_CONFIRMATION)
    throw new Error(
      `Remote access requires TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM=${REMOTE_CONFIRMATION}.`,
    );
  if (
    host !== REMOTE_ALLOWED_HOST ||
    env['TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST'] !== REMOTE_ALLOWED_HOST
  )
    throw new Error(`Unexpected remote database host. Expected ${REMOTE_ALLOWED_HOST}.`);
  const expectedDatabase = env['TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE']?.trim();
  if (!expectedDatabase || dbName !== expectedDatabase)
    throw new Error(
      'DATABASE_URL database does not match TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE.',
    );
  if (mode === 'apply' && env['TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL'] === 'true')
    throw new Error('The local apply opt-in cannot authorize remote database changes.');
  return { host, dbName, local: false, url };
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function safePreview(value: unknown): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const oneLine = String(raw ?? '').replace(/[\r\n\t]+/g, ' ');
  return oneLine.length > PREVIEW_CHARS ? `${oneLine.slice(0, PREVIEW_CHARS)}…` : oneLine;
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

export function serializePgColumnValue(value: unknown, columnType: string): unknown {
  if (columnType !== 'json' && columnType !== 'jsonb') return value;
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new Error(`Cannot serialize undefined as PostgreSQL ${columnType}.`);
  return serialized;
}

function redactPk(pk: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(pk).map(([key, value]) => [
      key,
      /email|phone|password|token/i.test(key) ? '[REDACTED]' : value,
    ]),
  );
}

export function validateBackupArtifact(
  path: string | undefined,
  cleanupStartedAt: number,
  expectedDatabase: string,
  verifyList: (backupPath: string) => { status: number | null; stdout?: string | null } = (
    backupPath,
  ) => spawnSync('pg_restore', ['--list', backupPath], { encoding: 'utf8' }),
  getStat: (backupPath: string) => BackupFileInfo = (backupPath) => statSync(backupPath),
): { path: string; size: number; verified: true } {
  if (!path?.trim())
    throw new Error('TEXT_CORRUPTION_CLEANUP_BACKUP_PATH is required for --apply.');
  if (!isAbsolute(path))
    throw new Error('TEXT_CORRUPTION_CLEANUP_BACKUP_PATH must be an absolute path.');
  let info: BackupFileInfo;
  try {
    info = getStat(path);
  } catch {
    throw new Error('Configured backup file is missing or unreadable.');
  }
  if (!info.isFile() || info.size <= 0)
    throw new Error('Configured backup must be a non-empty regular file.');
  if (info.mtimeMs >= cleanupStartedAt)
    throw new Error('Backup must have been created before this cleanup run.');
  const verify = verifyList(path);
  if (
    verify.status !== 0 ||
    !verify.stdout?.includes('Dumped from database version') ||
    !verify.stdout.includes('Format: CUSTOM')
  )
    throw new Error('pg_restore --list did not recognize a valid custom-format backup.');
  const archiveDatabase = verify.stdout.match(/^\s*;\s*dbname:\s*(.*?)\s*$/m)?.[1];
  if (archiveDatabase !== expectedDatabase)
    throw new Error('Backup archive database name does not match the selected cleanup database.');
  return { path, size: info.size, verified: true };
}

export function assertApplyConfirmation(target: Target, previewId: string, env: Environment): void {
  const targetConfirmation = `${target.host}/${target.dbName}`;
  if (env['TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET'] !== targetConfirmation)
    throw new Error(`Apply requires TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET=${targetConfirmation}.`);
  if (env['TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW'] !== previewId)
    throw new Error(`Apply requires TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW=${previewId}.`);
}

export async function runApplyIfAuthorized(
  mode: Mode,
  target: Target,
  previewId: string,
  backup: ReturnType<typeof validateBackupArtifact> | null,
  env: Environment,
  apply: () => Promise<void>,
): Promise<boolean> {
  if (mode !== 'apply') return false;
  if (!backup?.verified)
    throw new Error('A verified pre-existing backup is required before apply.');
  if (target.local && env['TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL'] !== 'true')
    throw new Error('Local apply requires TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL=true.');
  if (
    !target.local &&
    (env['TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE'] !== 'true' ||
      env['TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM'] !== REMOTE_CONFIRMATION ||
      env['TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST'] !== REMOTE_ALLOWED_HOST ||
      env['TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE'] !== target.dbName)
  )
    throw new Error(
      'Remote apply requires the independent remote access gate and matching host/database expectations.',
    );
  assertApplyConfirmation(target, previewId, env);
  await apply();
  return true;
}

export function previewFingerprint(target: Target, candidates: Candidate[]): string {
  const ordered = [...candidates].sort((a, b) =>
    `${a.table}:${JSON.stringify(a.pk)}:${a.column}`.localeCompare(
      `${b.table}:${JSON.stringify(b.pk)}:${b.column}`,
    ),
  );
  const content = {
    host: target.host,
    database: target.dbName,
    candidates: ordered.map((item) => ({
      table: item.table,
      column: item.column,
      pk: item.pk,
      before: item.before,
      after: item.after,
    })),
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export function summarizeCandidates(candidates: Candidate[]): Array<{
  table: string;
  column: string;
  count: number;
  primaryKeys: Record<string, unknown>[];
}> {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.table}.${candidate.column}`;
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => ({
      table: group[0].table,
      column: group[0].column,
      count: group.length,
      primaryKeys: group.slice(0, SAMPLE_KEYS_PER_GROUP).map((item) => redactPk(item.pk)),
    }));
}

export function groupCandidatesForApply(candidates: Candidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const candidate of candidates) {
    const key = `${candidate.table}\u0000${candidate.column}`;
    let group = groups.get(key);
    if (!group) {
      group = { table: candidate.table, column: candidate.column, candidates: [] };
      groups.set(key, group);
    }
    group.candidates.push(candidate);
  }
  return [...groups.values()].sort((a, b) =>
    `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
  );
}

const MAX_BIND_PARAMETERS = 60_000;
const MAX_ROWS_PER_UPDATE = 500;

export async function applyCandidatesBatched(
  client: Pick<PgClient, 'query'>,
  candidates: Candidate[],
): Promise<number> {
  let updated = 0;
  for (const group of groupCandidatesForApply(candidates)) {
    const pkNames = Object.keys(group.candidates[0].pk);
    if (!pkNames.length)
      throw new Error(`Cannot update ${group.table}.${group.column} without a primary key.`);
    if (
      group.candidates.some(
        (item) => Object.keys(item.pk).join('\u0000') !== pkNames.join('\u0000'),
      )
    )
      throw new Error(`Inconsistent primary-key shape for ${group.table}.${group.column}.`);
    const bindCount = pkNames.length + 2;
    const chunkSize = Math.min(
      MAX_ROWS_PER_UPDATE,
      Math.max(1, Math.floor(MAX_BIND_PARAMETERS / bindCount)),
    );

    for (let offset = 0; offset < group.candidates.length; offset += chunkSize) {
      const chunk = group.candidates.slice(offset, offset + chunkSize);
      const parameters: unknown[] = [];
      const predicates = chunk.map((item) => {
        const terms = pkNames.map((key) => {
          parameters.push(item.pk[key]);
          return `${quoteIdent(key)} IS NOT DISTINCT FROM $${parameters.length}`;
        });
        parameters.push(serializePgColumnValue(item.before, item.type));
        const isJson = item.type === 'json' || item.type === 'jsonb';
        terms.push(
          isJson
            ? `${quoteIdent(group.column)}::jsonb IS NOT DISTINCT FROM $${parameters.length}::jsonb`
            : `${quoteIdent(group.column)} IS NOT DISTINCT FROM $${parameters.length}`,
        );
        return `(${terms.join(' AND ')})`;
      });
      const assignments = chunk.map((item, index) => {
        parameters.push(serializePgColumnValue(item.after, item.type));
        const isJson = item.type === 'json' || item.type === 'jsonb';
        return `WHEN ${predicates[index]} THEN $${parameters.length}${isJson ? '::jsonb' : ''}`;
      });
      const update = await client.query(
        `UPDATE public.${quoteIdent(group.table)} SET ${quoteIdent(group.column)} = CASE ${assignments.join(' ')} ELSE ${quoteIdent(group.column)} END WHERE ${predicates.join(' OR ')}`,
        parameters,
      );
      if (update.rowCount !== chunk.length)
        throw new Error(
          `Expected ${chunk.length} updated rows for public.${group.table}.${group.column}; got ${update.rowCount ?? 0}.`,
        );
      updated += update.rowCount;
      console.log(
        `[apply] public.${group.table}.${group.column}: staged ${chunk.length} candidate rows in the open transaction`,
      );
    }
  }
  return updated;
}

export async function runCleanupTransaction<T>(
  client: Pick<PgClient, 'query'>,
  mode: Mode,
  work: () => Promise<T>,
): Promise<T> {
  try {
    await client.query(mode === 'apply' ? 'BEGIN' : 'BEGIN READ ONLY');
    const result = await work();
    if (mode === 'apply') {
      await client.query('COMMIT');
      console.log('[commit] transaction committed');
    } else {
      await client.query('ROLLBACK');
      console.log('[commit] read-only transaction rolled back; no writes performed');
    }
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.log('[commit] transaction rolled back after failure');
    throw error;
  }
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
  columnsToScan?: Set<string>,
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
  const requested = (spec.requested ?? actual.map((column) => column.column_name)).filter(
    (name) => !columnsToScan || columnsToScan.has(name),
  );
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
      if (!columnsToScan) recordReviews(spec.table, column.column_name, pk, before, unresolved);
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
  const target = resolveDatabaseTarget(process.env['DATABASE_URL'], mode, process.env);
  const cleanupStartedAt = Date.now();
  const backup =
    mode === 'apply'
      ? validateBackupArtifact(
          process.env['TEXT_CORRUPTION_CLEANUP_BACKUP_PATH'],
          cleanupStartedAt,
          target.dbName,
        )
      : null;
  if (backup) {
    console.log(
      `[backup] custom-format archive listing verified: ${backup.path} (${backup.size} bytes). This does not prove full restorability.`,
    );
  }
  console.log(
    `[target] host=${target.host}; database=${target.dbName}; mode=${mode}; credentials omitted`,
  );

  const client = new PgClientCtor({
    connectionString: process.env['DATABASE_URL'],
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    const identity = await client.query<{ database_name: string; server_address: string | null }>(
      'SELECT current_database() AS database_name, inet_server_addr()::text AS server_address',
    );
    const serverVersion = await client.query<{ server_version: string }>('SHOW server_version');
    if (identity.rows[0]?.database_name !== target.dbName)
      throw new Error('Connected database identity differs from DATABASE_URL.');
    console.log(
      `[identity] current_database=${identity.rows[0]?.database_name}; PostgreSQL ${serverVersion.rows[0]?.server_version ?? 'version unavailable'}; server address=${identity.rows[0]?.server_address ?? 'local socket'}`,
    );
    reviewItems.length = 0;
    const regexProbe = await client.query<{ sample: string; matches: boolean }>(
      'SELECT sample, sample ~ $1 AS matches FROM unnest($2::text[]) AS samples(sample)',
      [SQL_INDICATOR, ['Ã¢â‚¬â„¢', 'Â°', 'ï¿½', 'ðŸ', 'ordinary text']],
    );
    console.log(`[regex] PostgreSQL pattern probe: ${JSON.stringify(regexProbe.rows)}`);

    let updated = 0;
    let candidateCount = 0;
    await runCleanupTransaction(client, mode, async () => {
      const schema = await loadSchema(client);
      const candidates: Candidate[] = [];
      for (const spec of TABLE_SPECS) candidates.push(...(await scanTable(client, spec, schema)));
      candidateCount = candidates.length;
      const previewId = previewFingerprint(target, candidates);
      const matchedRows = new Map<string, Set<string>>();
      for (const item of candidates) {
        const key = `${item.table}:${JSON.stringify(item.pk)}`;
        const columns = matchedRows.get(key);
        if (columns) columns.add(item.column);
        else matchedRows.set(key, new Set([item.column]));
      }
      console.log(
        `[summary] matched rows=${matchedRows.size}; matched fields=${candidates.length}; review fields=${reviewItems.length}; skipped fields=${skippedFields.size}; failures=0; mode=${mode}`,
      );
      console.log(`[preview] id=${previewId}`);
      for (const group of summarizeCandidates(candidates))
        console.log(`[preview] ${JSON.stringify(group)}`);
      console.log(
        '[preview] Group samples show primary-key references only. Limited before/after field samples follow.',
      );

      const reportCandidates = candidates.slice(0, SAMPLE_LIMIT);
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
      if (candidates.length > SAMPLE_LIMIT)
        console.log(`[report] showing first ${SAMPLE_LIMIT} of ${candidates.length} field samples`);
      const reportReviews = reviewItems.slice(0, SAMPLE_LIMIT);
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
      if (reviewItems.length > SAMPLE_LIMIT)
        console.log(`[report] showing first ${SAMPLE_LIMIT} of ${reviewItems.length} review samples`);

      if (mode === 'apply') {
        await runApplyIfAuthorized(mode, target, previewId, backup, process.env, async () => {
          updated = await applyCandidatesBatched(client, candidates);
          const remainingTargetCandidates: Candidate[] = [];
          const affected = new Map<string, Set<string>>();
          for (const item of candidates) {
            const columns = affected.get(item.table);
            if (columns) columns.add(item.column);
            else affected.set(item.table, new Set([item.column]));
          }
          for (const spec of TABLE_SPECS) {
            const columns = affected.get(spec.table);
            if (columns?.size)
              remainingTargetCandidates.push(...(await scanTable(client, spec, schema, columns)));
          }
          if (remainingTargetCandidates.length)
            throw new Error('Post-update verification failed; rolling back.');
        });
      }
    });
    if (mode === 'apply') {
      reviewItems.length = 0;
      const schema = await loadSchema(client);
      const remaining: Candidate[] = [];
      for (const spec of TABLE_SPECS) remaining.push(...(await scanTable(client, spec, schema)));
      const remainingRepairable = remaining.length;
      console.log(
        `[summary] updated fields=${updated}; post-commit repairable matches=${remainingRepairable}; review fields=${reviewItems.length}; skipped fields=${skippedFields.size}; failures=${remainingRepairable === 0 ? 0 : 1}.`,
      );
      if (remainingRepairable !== 0) {
        throw new Error(
          `Post-commit verification found ${remainingRepairable} remaining repairable field(s).`,
        );
      }
    }
    console.log(`[summary] final candidate field count=${candidateCount}; transaction complete.`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const failure = error as { name?: string; message?: string; code?: string };
    const detail = (failure?.message || failure?.code || failure?.name || 'unknown error').replace(
      /postgres(?:ql)?:\/\/\S+/gi,
      '[DATABASE_URL_REDACTED]',
    );
    console.error(
      '[text-corruption-cleanup] failed (failures=1):',
      detail,
      failure?.code ? `(code ${failure.code})` : '',
    );
    process.exitCode = 1;
  });
}
