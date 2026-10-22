import { cleanJson, cleanString, hasIndicator } from './cleanup-text-corruption.runner';

describe('text corruption cleanup helpers', () => {
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
});
