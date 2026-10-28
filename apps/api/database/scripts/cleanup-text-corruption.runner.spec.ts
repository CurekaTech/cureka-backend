import {
  cleanJson,
  cleanString,
  encodeWindows1252Mojibake,
  hasIndicator,
  repairText,
} from './text-corruption-repair';
import {
  cleanJson as runnerCleanJson,
  cleanString as runnerCleanString,
  hasIndicator as runnerHasIndicator,
} from './cleanup-text-corruption.runner';

const mojibake = (value: string, times = 1): string => {
  let current = value;
  for (let pass = 0; pass < times; pass += 1) current = encodeWindows1252Mojibake(current);
  return current;
};

const VALID_SPECIALS = '’ “ ” ‘ – — … ° ± ® ™ ₹ × µ α β μ ₂ ≤ ≥ 😀';

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
});
