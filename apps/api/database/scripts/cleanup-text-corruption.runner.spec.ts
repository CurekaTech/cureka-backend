import {
  cleanJson,
  cleanString,
  applyCandidatesBatched,
  groupCandidatesForApply,
  hasIndicator,
  INDICATOR_PATTERN,
  parseMode,
  previewFingerprint,
  resolveDatabaseTarget,
  runCleanupTransaction,
  runApplyIfAuthorized,
  serializePgColumnValue,
  summarizeCandidates,
  validateBackupArtifact,
} from './cleanup-text-corruption.runner';

const REMOTE_DATABASE_URL = 'postgresql://test-user@8.231.74.20:5432/cureka_cleanup_test';
const REMOTE_CONFIRMATION = 'I_UNDERSTAND_THIS_IS_REMOTE_CUREKA_DATABASE';
const remoteEnv = {
  TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE: 'true',
  TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM: REMOTE_CONFIRMATION,
  TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST: '8.231.74.20',
  TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE: 'cureka_cleanup_test',
};
const backup = { path: '/backup.dump', size: 123, verified: true as const };

describe('text corruption cleanup helpers', () => {
  it('detects and cleans each supported indicator, including accented Ã followed by é', () => {
    const indicators = [
      '\u00e2\u20ac\u2122',
      '\u00e2\u20ac\u0153',
      '\u00e2\u20ac',
      '\u00c3a',
      '\u00c3\u00e9',
      '\u00ef\u00bf\u00bd',
      '\u00f0\u0178',
    ];
    for (const indicator of indicators) {
      expect(new RegExp(INDICATOR_PATTERN, 'u').test(indicator)).toBe(true);
      expect(hasIndicator(`text ${indicator} tail`)).toBe(true);
      expect(cleanString(`text ${indicator} tail`)).toBe('text  tail');
    }
  });

  it('does not flag ordinary ASCII, valid accented text, or unrelated emoji', () => {
    for (const text of ['ordinary text', 'café', 'naïve', '東京', '😀']) {
      expect(new RegExp(INDICATOR_PATTERN, 'u').test(text)).toBe(false);
      expect(hasIndicator(text)).toBe(false);
      expect(cleanString(text)).toBe(text);
    }
  });

  it('serializes JSON and JSONB values as JSON text for node-postgres parameters', () => {
    const jsonRootString = '\u00e9 cleaned string';
    const jsonObject = { list: [1, true, null, { nested: 'text' }] };
    expect(serializePgColumnValue(jsonRootString, 'json')).toBe(JSON.stringify(jsonRootString));
    expect(serializePgColumnValue(jsonObject, 'jsonb')).toBe(JSON.stringify(jsonObject));
    expect(serializePgColumnValue([1, true, null], 'jsonb')).toBe('[1,true,null]');
    expect(serializePgColumnValue(42, 'json')).toBe('42');
    expect(serializePgColumnValue(false, 'jsonb')).toBe('false');
    expect(serializePgColumnValue(null, 'json')).toBe('null');
    expect(serializePgColumnValue('plain text', 'text')).toBe('plain text');
    expect(() => serializePgColumnValue(undefined, 'json')).toThrow(/undefined/);
  });

  it('groups only candidate-bearing table/column pairs for apply', () => {
    const candidates = [
      {
        table: 'products',
        column: 'description',
        type: 'text',
        pk: { id: '1' },
        before: 'aâ€™',
        after: 'a',
      },
      {
        table: 'products',
        column: 'description',
        type: 'text',
        pk: { id: '2' },
        before: 'bâ€™',
        after: 'b',
      },
      {
        table: 'blog_posts',
        column: 'title',
        type: 'text',
        pk: { id: '3' },
        before: 'câ€™',
        after: 'c',
      },
    ];
    expect(
      groupCandidatesForApply(candidates).map(({ table, column, candidates: rows }) => [
        table,
        column,
        rows.length,
      ]),
    ).toEqual([
      ['blog_posts', 'title', 1],
      ['products', 'description', 2],
    ]);
  });

  it('uses one parameterized guarded update per affected table/column group and skips empty input', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 2 }),
    };
    await expect(applyCandidatesBatched(client, [])).resolves.toBe(0);
    expect(client.query).not.toHaveBeenCalled();

    const candidates = [
      {
        table: 'products',
        column: 'description',
        type: 'text',
        pk: { id: '1' },
        before: 'aâ€™',
        after: 'a',
      },
      {
        table: 'products',
        column: 'description',
        type: 'text',
        pk: { id: '2' },
        before: 'bâ€™',
        after: 'b',
      },
      {
        table: 'blog_posts',
        column: 'title',
        type: 'text',
        pk: { id: '3' },
        before: 'câ€™',
        after: 'c',
      },
    ];
    await expect(applyCandidatesBatched(client, candidates)).resolves.toBe(3);
    expect(client.query).toHaveBeenCalledTimes(2);
    const [sql, values] = client.query.mock.calls[1];
    expect(sql).toContain('UPDATE public."products"');
    expect(sql).toContain('"id" IS NOT DISTINCT FROM $1');
    expect(sql).toContain('"description" IS NOT DISTINCT FROM $2');
    expect(sql).toContain('WHERE');
    expect(values).toEqual(['1', 'aâ€™', '2', 'bâ€™', 'a', 'b']);
    expect(sql).not.toContain('aâ€™');
  });

  it('binds JSON and JSONB before/after values as valid serialized JSON', async () => {
    const beforeObject = { nested: ['bad \u00c3\u00e9', 2, false, null] };
    const afterObject = { nested: ['bad ', 2, false, null] };
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 2 }),
    };
    const candidates = [
      {
        table: 'blog_posts',
        column: 'settings',
        type: 'json',
        pk: { id: 'json-row' },
        before: 'bad \u00e2\u20ac\u2122',
        after: 'bad ',
      },
      {
        table: 'products',
        column: 'settings',
        type: 'jsonb',
        pk: { id: 'jsonb-row' },
        before: beforeObject,
        after: afterObject,
      },
      {
        table: 'products',
        column: 'settings',
        type: 'jsonb',
        pk: { id: 'json-string-row' },
        before: '\u00c3\u00e9',
        after: '',
      },
    ];
    await expect(applyCandidatesBatched(client, candidates)).resolves.toBe(3);
    expect(client.query).toHaveBeenCalledTimes(2);
    const [jsonSql, jsonValues] = client.query.mock.calls[0];
    expect(jsonSql).toContain('UPDATE public."blog_posts"');
    expect(jsonSql).toContain('"settings"::jsonb IS NOT DISTINCT FROM $2::jsonb');
    expect(jsonValues).toEqual([
      'json-row',
      JSON.stringify('bad \u00e2\u20ac\u2122'),
      JSON.stringify('bad '),
    ]);
    const [sql, values] = client.query.mock.calls[1];
    expect(sql).toContain('"settings" IS NOT DISTINCT FROM');
    expect(values).toEqual([
      'jsonb-row',
      JSON.stringify(beforeObject),
      'json-string-row',
      JSON.stringify('\u00c3\u00e9'),
      JSON.stringify(afterObject),
      JSON.stringify(''),
    ]);
  });

  it('preserves nested JSON types while cleaning nested strings only', () => {
    const input = {
      nested: { text: 'bad \u00c3\u00e9', number: 12, bool: true, nil: null },
      list: ['\u00e2\u20ac\u2122', 4, false, null, ['caf\u00e9']],
    };
    const result = cleanJson(input);
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      nested: { text: 'bad ', number: 12, bool: true, nil: null },
      list: ['', 4, false, null, ['caf\u00e9']],
    });
  });

  it('preserves JSON object keys named __proto__ during recursive cleanup', () => {
    const input = JSON.parse('{"__proto__":{"text":"bad \\u00c3\\u00e9"}}');
    const result = cleanJson(input);
    expect(result.changed).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result.value, '__proto__')).toBe(true);
    expect(JSON.stringify(result.value)).toBe('{"__proto__":{"text":"bad "}}');
  });

  it('rolls back the transaction when update or post-update verification throws', async () => {
    for (const failurePhase of ['update', 'verification']) {
      const calls: string[] = [];
      const client = {
        query: jest.fn(async (sql: string) => {
          calls.push(sql);
          if (failurePhase === 'update' && sql === 'UPDATE test') throw new Error('update failed');
          if (failurePhase === 'verification' && sql === 'SELECT verification')
            throw new Error('verification failed');
          return { rows: [], rowCount: sql === 'UPDATE test' ? 1 : null };
        }),
      };
      const work = async () => {
        await client.query('UPDATE test');
        if (failurePhase === 'verification') await client.query('SELECT verification');
      };
      await expect(runCleanupTransaction(client, 'apply', work)).rejects.toThrow(
        failurePhase === 'update' ? 'update failed' : 'verification failed',
      );
      expect(calls).toEqual(
        failurePhase === 'update'
          ? ['BEGIN', 'UPDATE test', 'ROLLBACK']
          : ['BEGIN', 'UPDATE test', 'SELECT verification', 'ROLLBACK'],
      );
    }
  });

  it('commits before transaction success is observable to the caller', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: null }) };
    const completion = jest.fn();
    await runCleanupTransaction(client, 'apply', async () => undefined);
    completion();
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(completion).toHaveBeenCalledTimes(1);
  });

  it('fails the batch if a candidate became stale or was not uniquely updated', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    await expect(
      applyCandidatesBatched(client, [
        {
          table: 'products',
          column: 'description',
          type: 'text',
          pk: { id: '1' },
          before: 'aâ€™',
          after: 'a',
        },
      ]),
    ).rejects.toThrow(/Expected 1 updated rows/);
  });

  it('detects and removes only the configured indicator fragments', () => {
    const original = 'Meniâ€™s hair Ãa care ï¿½';
    expect(hasIndicator(original)).toBe(true);
    expect(cleanString(original)).toBe('Menis hair  care ');
    expect(cleanString('plain text 😀')).toBe('plain text 😀');
  });

  it('recursively cleans JSON string values while preserving keys and non-string values', () => {
    const input = {
      'safeâ€™key': 'value â€œoneâ€',
      list: ['ok', 'Ãa'],
      count: 3,
      enabled: false,
      nil: null,
    };
    const result = cleanJson(input);
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      'safeâ€™key': 'value one',
      list: ['ok', ''],
      count: 3,
      enabled: false,
      nil: null,
    });
  });

  it('keeps an already clean JSON value unchanged', () => {
    const input = { key: ['normal', 1, null] };
    expect(cleanJson(input)).toEqual({ value: input, changed: false });
  });

  it('summarizes grouped candidates with no more than three primary-key samples', () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      table: 'products',
      column: 'description',
      type: 'text',
      pk: { id: `row-${index}` },
      before: 'corrupt',
      after: 'clean',
    }));
    expect(summarizeCandidates(candidates)).toEqual([
      {
        table: 'products',
        column: 'description',
        count: 5,
        primaryKeys: [{ id: 'row-0' }, { id: 'row-1' }, { id: 'row-2' }],
      },
    ]);
  });

  it('generates a stable preview fingerprint independent of candidate order', () => {
    const target = resolveDatabaseTarget('postgresql://user@localhost/local_db', 'dry-run', {});
    const first = {
      table: 'products',
      column: 'description',
      type: 'text',
      pk: { id: 'a' },
      before: 'bad \u00c3\u00a9',
      after: 'bad ',
    };
    const second = { ...first, pk: { id: 'b' } };
    expect(previewFingerprint(target, [first, second])).toBe(
      previewFingerprint(target, [second, first]),
    );
    expect(previewFingerprint(target, [first])).not.toBe(previewFingerprint(target, [second]));
  });
});

describe('cleanup database target safety', () => {
  it('requires exactly one explicit mode', () => {
    expect(() => parseMode([])).toThrow(/exactly one mode/);
    expect(() => parseMode(['--other'])).toThrow(/exactly one mode/);
    expect(parseMode(['--dry-run'])).toBe('dry-run');
    expect(parseMode(['--apply'])).toBe('apply');
  });

  it('allows a local target without enabling remote access', () => {
    const target = resolveDatabaseTarget(
      'postgresql://test-user@localhost:5432/local_db',
      'dry-run',
      {},
    );
    expect(target).toMatchObject({ host: 'localhost', dbName: 'local_db', local: true });
  });

  it('disables remote access by default', () => {
    expect(() => resolveDatabaseTarget(REMOTE_DATABASE_URL, 'dry-run', {})).toThrow(
      /Remote access is disabled/,
    );
  });

  it('rejects an incorrect remote confirmation', () => {
    expect(() =>
      resolveDatabaseTarget(REMOTE_DATABASE_URL, 'dry-run', {
        ...remoteEnv,
        TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM: 'yes',
      }),
    ).toThrow(/REMOTE_CONFIRM/);
  });

  it('rejects unexpected remote hosts and database names', () => {
    expect(() =>
      resolveDatabaseTarget(
        REMOTE_DATABASE_URL.replace('8.231.74.20', '8.231.74.21'),
        'dry-run',
        remoteEnv,
      ),
    ).toThrow(/Unexpected remote database host/);
    expect(() =>
      resolveDatabaseTarget(REMOTE_DATABASE_URL, 'dry-run', {
        ...remoteEnv,
        TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE: 'other_database',
      }),
    ).toThrow(/does not match/);
  });

  it('does not allow the local apply opt-in to authorize a remote target', () => {
    expect(() =>
      resolveDatabaseTarget(REMOTE_DATABASE_URL, 'apply', {
        ...remoteEnv,
        TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL: 'true',
      }),
    ).toThrow(/cannot authorize remote/);
  });
});

describe('backup and apply safeguards', () => {
  const oldRegularFile = () => ({ isFile: () => true, size: 1024, mtimeMs: 100 });

  it('requires a backup path and rejects missing, empty, recent, or invalid backups', () => {
    const validListing = () => ({
      status: 0,
      stdout: '; Format: CUSTOM\n; dbname: cleanup_db\n; Dumped from database version 18.4',
    });
    expect(() =>
      validateBackupArtifact(undefined, 200, 'cleanup_db', validListing, oldRegularFile),
    ).toThrow(/BACKUP_PATH/);
    expect(() =>
      validateBackupArtifact('/missing.dump', 200, 'cleanup_db', validListing, () => {
        throw new Error('ENOENT');
      }),
    ).toThrow(/missing or unreadable/);
    expect(() =>
      validateBackupArtifact('/empty.dump', 200, 'cleanup_db', validListing, () => ({
        ...oldRegularFile(),
        size: 0,
      })),
    ).toThrow(/non-empty/);
    expect(() =>
      validateBackupArtifact('/new.dump', 200, 'cleanup_db', validListing, () => ({
        ...oldRegularFile(),
        mtimeMs: 200,
      })),
    ).toThrow(/created before/);
    expect(() =>
      validateBackupArtifact(
        '/invalid.dump',
        200,
        'cleanup_db',
        () => ({ status: 1, stdout: '' }),
        oldRegularFile,
      ),
    ).toThrow(/pg_restore --list/);
    expect(() =>
      validateBackupArtifact(
        '/not-custom.dump',
        200,
        'cleanup_db',
        () => ({
          status: 0,
          stdout: '; Format: TAR\n; Dumped from database version 18.4',
        }),
        oldRegularFile,
      ),
    ).toThrow(/pg_restore --list/);
    expect(() =>
      validateBackupArtifact(
        '/wrong-db.dump',
        200,
        'cleanup_db',
        () => ({
          status: 0,
          stdout: '; Format: CUSTOM\n; dbname: unrelated_db\n; Dumped from database version 18.4',
        }),
        oldRegularFile,
      ),
    ).toThrow(/database name/);
  });

  it('never invokes a write callback in dry-run mode', async () => {
    const target = resolveDatabaseTarget('postgresql://user@localhost/local_db', 'dry-run', {});
    const write = jest.fn().mockResolvedValue(undefined);
    await expect(runApplyIfAuthorized('dry-run', target, 'preview', null, {}, write)).resolves.toBe(
      false,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('blocks apply unless backup, target, and preview are all confirmed', async () => {
    const target = resolveDatabaseTarget('postgresql://user@localhost/local_db', 'apply', {});
    const write = jest.fn().mockResolvedValue(undefined);
    const env = {
      TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL: 'true',
      TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET: 'localhost/local_db',
      TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW: 'preview-1',
    };
    await expect(
      runApplyIfAuthorized('apply', target, 'preview-1', null, env, write),
    ).rejects.toThrow(/backup/);
    await expect(
      runApplyIfAuthorized(
        'apply',
        target,
        'preview-1',
        backup,
        {
          ...env,
          TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET: 'localhost/other_db',
        },
        write,
      ),
    ).rejects.toThrow(/CONFIRM_TARGET/);
    await expect(
      runApplyIfAuthorized(
        'apply',
        target,
        'preview-1',
        backup,
        {
          ...env,
          TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW: 'stale-preview',
        },
        write,
      ),
    ).rejects.toThrow(/CONFIRM_PREVIEW/);
    expect(write).not.toHaveBeenCalled();
  });

  it('allows a local apply only with the explicit local, target, preview, and backup confirmations', async () => {
    const target = resolveDatabaseTarget('postgresql://user@localhost/local_db', 'apply', {});
    const write = jest.fn().mockResolvedValue(undefined);
    await expect(
      runApplyIfAuthorized(
        'apply',
        target,
        'preview-2',
        backup,
        {
          TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL: 'true',
          TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET: 'localhost/local_db',
          TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW: 'preview-2',
        },
        write,
      ),
    ).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('allows remote apply only when the independent remote gate and target/preview confirmations match', async () => {
    const target = resolveDatabaseTarget(REMOTE_DATABASE_URL, 'apply', remoteEnv);
    const write = jest.fn().mockResolvedValue(undefined);
    const env = {
      ...remoteEnv,
      TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET: '8.231.74.20/cureka_cleanup_test',
      TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW: 'reviewed-preview-id',
    };
    await expect(
      runApplyIfAuthorized('apply', target, 'reviewed-preview-id', backup, env, write),
    ).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(1);

    await expect(
      runApplyIfAuthorized(
        'apply',
        target,
        'reviewed-preview-id',
        backup,
        { ...env, TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET: '8.231.74.21/cureka_cleanup_test' },
        write,
      ),
    ).rejects.toThrow(/CONFIRM_TARGET/);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
