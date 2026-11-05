import {
  cleanJson,
  cleanString,
  encodeWindows1252Mojibake,
  hasIndicator,
  repairText,
} from './text-corruption-repair';
import {
  SQL_INDICATOR,
  applyCandidatesBatched,
  assertSqlBindValues,
  cleanJson as runnerCleanJson,
  cleanString as runnerCleanString,
  groupCandidatesForApply,
  hasIndicator as runnerHasIndicator,
  parseMode,
  previewFingerprint,
  resolveDatabaseTarget,
  runApplyIfAuthorized,
  runCleanupTransaction,
  serializePgColumnValue,
  summarizeCandidates,
  validateBackupArtifact,
} from './cleanup-text-corruption.runner';

const mojibake = (value: string, times = 1): string => {
  let current = value;
  for (let pass = 0; pass < times; pass += 1) current = encodeWindows1252Mojibake(current);
  return current;
};

const VALID_SPECIALS = '’ “ ” ‘ – — … ° ± ® ™ ₹ × µ α β μ ₂ ≤ ≥ 😀';
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
  describe('audit pattern restoration', () => {
    it.each([
      ['double-encoded curly apostrophe', mojibake('\u2019', 2), '\u2019'],
      ['csv-style Ã¢â‚¬â„¢', 'Ã¢â‚¬â„¢', '\u2019'],
      ['other double-encoded left quote', mojibake('\u201C', 2), '\u201C'],
      ['other double-encoded right quote', mojibake('\u201D', 2), '\u201D'],
      ['other double-encoded en dash', mojibake('\u2013', 2), '\u2013'],
      ['ring above Ëš', mojibake('\u02DA'), '\u02DA'],
      ['small tilde Ëœ', mojibake('\u02DC'), '\u02DC'],
      ['degree Â°', mojibake('\u00B0'), '\u00B0'],
      ['plus-minus Â±', mojibake('\u00B1'), '\u00B1'],
      ['eacute Ã©', mojibake('\u00E9'), '\u00E9'],
      ['egrave Ã¨', mojibake('\u00E8'), '\u00E8'],
      ['rupee â‚¹', mojibake('\u20B9'), '\u20B9'],
      ['registered Â®', mojibake('\u00AE'), '\u00AE'],
      ['times Ã—', mojibake('\u00D7'), '\u00D7'],
      ['micro Âµ', mojibake('\u00B5'), '\u00B5'],
      ['celsius â„ƒ', mojibake('\u2103'), '\u2103'],
      ['fahrenheit â„‰', mojibake('\u2109'), '\u2109'],
      ['trademark â„¢', mojibake('\u2122'), '\u2122'],
      ['minus âˆ’', mojibake('\u2212'), '\u2212'],
      ['alpha Î±', mojibake('\u03B1'), '\u03B1'],
      ['beta Î²', mojibake('\u03B2'), '\u03B2'],
      ['mu Î¼', mojibake('\u03BC'), '\u03BC'],
      ['subscript two â‚‚', mojibake('\u2082'), '\u2082'],
      ['bullet â–ª', mojibake('\u25AA'), '\u25AA'],
      ['less-or-equal â‰¤', mojibake('\u2264'), '\u2264'],
      ['greater-or-equal â‰¥', mojibake('\u2265'), '\u2265'],
      ['Oslash Ã˜', mojibake('\u00D8'), '\u00D8'],
      ['fi ligature', mojibake('\uFB01'), 'fi'],
      ['ff ligature', mojibake('\uFB00'), 'ff'],
      ['prime Ê¹', mojibake('\u02B9'), '\u02B9'],
      ['double prime Êº', mojibake('\u02BA'), '\u02BA'],
      ['one third â…“', mojibake('\u2153'), '\u2153'],
    ])('restores %s', (_name, input, expected) => {
      expect(cleanString(input)).toBe(expected);
      expect(hasIndicator(input)).toBe(true);
    });
  });

  describe('original six patterns', () => {
    it.each([
      ['curly apostrophe â€™', mojibake('\u2019'), '\u2019'],
      ['left double quote â€œ', mojibake('\u201C'), '\u201C'],
      ['en dash â€“', mojibake('\u2013'), '\u2013'],
      ['eacute via Ã + continuation', mojibake('\u00E9'), '\u00E9'],
      ['broken emoji prefix is restored when complete', mojibake('😀'), '😀'],
    ])('restores %s instead of deleting it', (_name, input, expected) => {
      expect(cleanString(input)).toBe(expected);
    });

    it('leaves unrecoverable ï¿½ in place and reports it', () => {
      const repaired = repairText('bad ï¿½ text');
      expect(repaired.value).toBe('bad ï¿½ text');
      expect(repaired.changed).toBe(false);
      expect(repaired.unresolved.some((item) => item.fragment === 'ï¿½')).toBe(true);
    });
  });

  describe('required cleanup examples', () => {
    it.each([
      ['Meniâ€™s Health', `Meni${mojibake('\u2019')}s Health`, 'Meni\u2019s Health'],
      ['SkinÃ¢â‚¬â„¢s Care', `Skin${mojibake('\u2019', 2)}s Care`, 'Skin\u2019s Care'],
      ['Vitamin Â® Formula', `Vitamin ${mojibake('\u00AE')} Formula`, 'Vitamin \u00AE Formula'],
      ['Price â‚¹500', `Price ${mojibake('\u20B9')}500`, 'Price \u20B9500'],
      ['Temperature 37Â°C', `Temperature 37${mojibake('\u00B0')}C`, 'Temperature 37\u00B0C'],
      ['Measurement 5Â±0.2', `Measurement 5${mojibake('\u00B1')}0.2`, 'Measurement 5\u00B10.2'],
      ['Size 2Ã—3', `Size 2${mojibake('\u00D7')}3`, 'Size 2\u00D73'],
      ['Vitamin Î± Formula', `Vitamin ${mojibake('\u03B1')} Formula`, 'Vitamin \u03B1 Formula'],
    ])('%s', (_name, input, expected) => {
      expect(cleanString(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('restores multiple occurrences of the same fragment', () => {
      const mark = mojibake('\u2019');
      expect(cleanString(`Meni${mark}s and women${mark}s`)).toBe('Meni\u2019s and women\u2019s');
    });

    it('restores several different corruption types in one string', () => {
      const input = `Meni${mojibake('\u2019')}s ${mojibake('\u00AE')} 37${mojibake('\u00B0')}C ${mojibake('\u20B9')}500`;
      expect(cleanString(input)).toBe('Meni\u2019s \u00AE 37\u00B0C \u20B9500');
    });

    it('restores double and triple encoding', () => {
      expect(cleanString(mojibake('\u2019', 2))).toBe('\u2019');
      expect(cleanString(mojibake('\u2019', 3))).toBe('\u2019');
      expect(cleanString(mojibake('\u00B0', 3))).toBe('\u00B0');
    });

    it('preserves mixed valid Unicode beside corrupted text', () => {
      expect(cleanString(`café ${mojibake('\u00AE')} 😀`)).toBe('café \u00AE 😀');
    });

    it('cleans nested JSON string values and leaves keys, numbers, booleans, and nulls', () => {
      const input = {
        [`safe${mojibake('\u2019')}key`]: `value ${mojibake('\u201C')}one${mojibake('\u201D')}`,
        list: ['ok', mojibake('\u00E9')],
        count: 3,
        enabled: false,
        nil: null,
      };
      const result = cleanJson(input);
      expect(result.changed).toBe(true);
      expect(result.value).toEqual({
        [`safe${mojibake('\u2019')}key`]: 'value \u201Cone\u201D',
        list: ['ok', '\u00E9'],
        count: 3,
        enabled: false,
        nil: null,
      });
    });

    it('keeps already clean JSON unchanged', () => {
      const input = { key: ['normal', 1, null] };
      expect(cleanJson(input)).toEqual({ value: input, changed: false, unresolved: [] });
    });

    it('repairs HTML text without damaging tags or entities', () => {
      const input = `<p class="name">Meni${mojibake('\u2019')}s</p>&nbsp;&amp;`;
      expect(cleanString(input)).toBe('<p class="name">Meni\u2019s</p>&nbsp;&amp;');
    });

    it('preserves real emoji and does not strip ðŸ from complete emoji mojibake', () => {
      expect(cleanString('plain text 😀')).toBe('plain text 😀');
      expect(cleanString(`smile ${mojibake('😀')}`)).toBe('smile 😀');
    });

    it('preserves accented language that is already valid', () => {
      expect(cleanString('café crème naïve São')).toBe('café crème naïve São');
    });

    it('does not convert 5Â±0.2 into 50.2 or ₹500 into 500', () => {
      expect(cleanString(`5${mojibake('\u00B1')}0.2`)).toBe('5\u00B10.2');
      expect(cleanString(`${mojibake('\u20B9')}500`)).toBe('\u20B9500');
      expect(cleanString('5±0.2')).toBe('5±0.2');
      expect(cleanString('₹500')).toBe('₹500');
    });

    it('leaves incomplete punctuation sequences unchanged and reports them', () => {
      const repaired = repairText('hello â€');
      expect(repaired.value).toBe('hello â€');
      expect(repaired.changed).toBe(false);
      expect(repaired.unresolved.length).toBeGreaterThan(0);
    });

    it('restores a curly apostrophe without deleting nearby unrecoverable fragments', () => {
      const input = `Meni${mojibake('\u2019')}s hair Ãa care ï¿½`;
      const repaired = repairText(input);
      expect(repaired.value).toBe('Meni\u2019s hair Ãa care ï¿½');
      expect(repaired.unresolved.some((item) => item.fragment === 'ï¿½')).toBe(true);
    });

    it('leaves a literal replacement character unchanged', () => {
      const repaired = repairText('broken \uFFFD value');
      expect(repaired.value).toBe('broken \uFFFD value');
      expect(repaired.unresolved.some((item) => item.reason === 'unrecoverable_replacement_character')).toBe(
        true,
      );
    });

    it('leaves C1 leftovers and incomplete emoji prefixes for review', () => {
      expect(repairText('control \u009d here').unresolved.length).toBeGreaterThan(0);
      expect(cleanString('start ðŸ')).toBe('start ðŸ');
    });

    it('handles empty strings, null JSON values, and non-string JSON values', () => {
      expect(cleanString('')).toBe('');
      expect(cleanJson(null)).toEqual({ value: null, changed: false, unresolved: [] });
      expect(cleanJson(12)).toEqual({ value: 12, changed: false, unresolved: [] });
      expect(cleanJson(true)).toEqual({ value: true, changed: false, unresolved: [] });
    });

    it('is idempotent for corrupted, mixed, and already-clean values', () => {
      const samples = [
        `Meni${mojibake('\u2019')}s`,
        mojibake('\u2019', 3),
        `café ${mojibake('\u00AE')}`,
        VALID_SPECIALS,
        '<p>&amp;</p>',
        'plain text 😀',
        `5${mojibake('\u00B1')}0.2`,
      ];
      for (const sample of samples) {
        const once = cleanString(sample);
        expect(cleanString(once)).toBe(once);
      }
    });

    it('preserves valid special characters, URLs, and measurements', () => {
      expect(cleanString(VALID_SPECIALS)).toBe(VALID_SPECIALS);
      expect(cleanString('https://www.cureka.com/shop/serum?sort=price#reviews')).toBe(
        'https://www.cureka.com/shop/serum?sort=price#reviews',
      );
      expect(cleanString('Omega-3 100% + 5mg/ml @sku')).toBe('Omega-3 100% + 5mg/ml @sku');
    });

    it('maps Ëš to degree only when a numeric temperature unit is unambiguous', () => {
      expect(cleanString(`37${mojibake('\u02DA')}C`)).toBe('37\u00B0C');
      expect(cleanString(mojibake('\u02DA'))).toBe('\u02DA');
    });

    it('maps unit-only ˚C / ºC to degree and strips stray Â before space', () => {
      expect(cleanString(`reading ${mojibake('\u02DA')}C or ${mojibake('\u02DA')}F`)).toBe(
        'reading \u00B0C or \u00B0F',
      );
      expect(cleanString('36ºC')).toBe('36\u00B0C');
      expect(cleanString('NestleÂ Baby Cereal')).toBe('Nestle Baby Cereal');
      expect(hasIndicator('NestleÂ Baby Cereal')).toBe(true);
    });

    it('preserves Portuguese Ã and does not guess unrecoverable text', () => {
      expect(cleanString('SÃO PAULO')).toBe('SÃO PAULO');
      expect(hasIndicator('SÃO PAULO')).toBe(false);
      expect(cleanString('beep\u009D sound')).toBe('beep\u009D sound');
      expect(repairText('beep\u009D sound').unresolved.some((item) => item.reason === 'c1_control_character')).toBe(
        true,
      );
      expect(cleanString('water â€ insoluable')).toBe('water â€ insoluable');
      expect(cleanString('men\uFFFD\uFFFD\uFFFDs')).toBe('men\uFFFD\uFFFD\uFFFDs');
      expect(cleanString('36.80.5 °C')).toBe('36.80.5 °C');
    });

    it('maps defined Windows-1252 C1 bytes and keeps emoji ZWJ sequences', () => {
      expect(cleanString('men\u0092s')).toBe('men\u2019s');
      expect(cleanString('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    });

    it('does not change JSON keys, URLs, or already-correct measurements', () => {
      const input = {
        [`safe${mojibake('\u2019')}key`]: 'plain',
        url: 'https://www.cureka.com/shop?q=caf%C3%A9',
      };
      const result = cleanJson(input);
      expect(result.value).toEqual({
        [`safe${mojibake('\u2019')}key`]: 'plain',
        url: 'https://www.cureka.com/shop?q=caf%C3%A9',
      });
      expect(cleanString('Pressure ± 3mmHg')).toBe('Pressure ± 3mmHg');
    });

    it('never puts a literal U+0000 in the SQL regex while still detecting C0/C1 in memory', () => {
      expect(SQL_INDICATOR.includes('\u0000')).toBe(false);
      expect(Buffer.from(SQL_INDICATOR, 'utf8').includes(0)).toBe(false);
      expect(SQL_INDICATOR).toContain('\u0001');
      expect(SQL_INDICATOR).toContain('\u0007');
      expect(SQL_INDICATOR).toContain('\u007F');
      expect(SQL_INDICATOR).not.toMatch(/\\x[0-9A-Fa-f]/);
      expect(() => assertSqlBindValues([SQL_INDICATOR, ['Â°', 'beep\u0007']], 'regex probe')).not.toThrow();
      expect(() => assertSqlBindValues(['prefix\u0000suffix'], 'regex probe')).toThrow(/U\+0000/);

      const c0 = [0x01, 0x08, 0x0b, 0x0c, 0x0e, 0x1f, 0x7f].map((code) => String.fromCharCode(code));
      for (const fragment of c0) {
        expect(hasIndicator(`x${fragment}y`)).toBe(true);
        expect(cleanString(`x${fragment}y`)).toBe('xy');
      }
      for (let code = 0x80; code <= 0x9f; code += 1) {
        expect(hasIndicator(`x${String.fromCharCode(code)}y`)).toBe(true);
      }
      expect(hasIndicator('keep\ttabs\nand\rreturns')).toBe(false);
      expect(cleanString('keep\ttabs\nand\rreturns')).toBe('keep\ttabs\nand\rreturns');
      expect(hasIndicator('\u0000hidden')).toBe(true);
    });

    it('repairs nested JSONB string controls without mutating keys or numbers', () => {
      const input = { safe: 1, nested: { note: `ok\u0007 ${mojibake('\u00AE')}` } };
      const result = cleanJson(input);
      expect(result.changed).toBe(true);
      expect(result.value).toEqual({ safe: 1, nested: { note: 'ok \u00AE' } });
    });

    it('detects corruption without flagging ordinary clean text', () => {
      expect(hasIndicator(`Meni${mojibake('\u2019')}s`)).toBe(true);
      expect(hasIndicator('ordinary text')).toBe(false);
      expect(hasIndicator(VALID_SPECIALS)).toBe(false);
      expect(hasIndicator('SÃO PAULO')).toBe(false);
      expect(hasIndicator('café crème naïve')).toBe(false);
    });
  });

  describe('runner re-exports', () => {
    it('exposes the restore helpers from the cleanup script', () => {
      expect(runnerCleanString(mojibake('\u00AE'))).toBe('\u00AE');
      expect(runnerHasIndicator(mojibake('\u00AE'))).toBe(true);
      expect(runnerCleanJson({ name: mojibake('\u00E9') }).value).toEqual({ name: '\u00E9' });
    });
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
    expect(sql).toContain('"settings"::jsonb IS NOT DISTINCT FROM');
    expect(sql).toContain('THEN $6::jsonb');
    expect(values).toEqual([
      'jsonb-row',
      JSON.stringify(beforeObject),
      'json-string-row',
      JSON.stringify('\u00c3\u00e9'),
      JSON.stringify(afterObject),
      JSON.stringify(''),
    ]);
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

describe('SQL bind guard and optional PostgreSQL probe', () => {
  it('does not send U+0000 to the client query when apply values contain NUL', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    await expect(
      applyCandidatesBatched(client, [
        {
          table: 'products',
          column: 'description',
          type: 'text',
          pk: { id: '1' },
          before: 'bad\u0000text',
          after: 'badtext',
        },
      ]),
    ).rejects.toThrow(/U\+0000/);
    expect(client.query).not.toHaveBeenCalled();
  });

  const pgUrl = process.env['TEXT_CORRUPTION_PG_TEST_URL'];
  const pgIt = pgUrl ? it : it.skip;

  pgIt('binds SQL_INDICATOR on an isolated PostgreSQL 18 database without error 22021', async () => {
    const { Client } = require('pg') as {
      Client: new (options: object) => {
        connect(): Promise<void>;
        end(): Promise<void>;
        query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
      };
    };
    const client = new Client({ connectionString: pgUrl });
    await client.connect();
    try {
      assertSqlBindValues([SQL_INDICATOR], 'pg-probe');
      const probe = await client.query(
        `SELECT sample, sample ~ $1 AS matches
           FROM (VALUES
             ('Â°'),
             ('ordinary text'),
             ('beep' || chr(7)),
             ('beep' || chr(157)),
             ('Ã¢â‚¬â„¢')
           ) AS samples(sample)`,
        [SQL_INDICATOR],
      );
      const bySample = Object.fromEntries(
        probe.rows.map((row) => [String(row['sample']), row['matches']]),
      );
      expect(bySample['Â°']).toBe(true);
      expect(bySample['ordinary text']).toBe(false);
      expect(bySample['beep\u0007']).toBe(true);
      expect(bySample['beep\u009D']).toBe(true);
      expect(bySample['Ã¢â‚¬â„¢']).toBe(true);
    } finally {
      await client.end();
    }
  });
});
