/**
 * Restore Windows-1252 / UTF-8 mojibake in product and blog text.
 *
 * Known unambiguous sequences are mapped back to the original Unicode
 * character. Mixed valid Unicode is preserved. Ambiguous leftovers are
 * reported and left unchanged — never deleted, except confirmed C0/BOM/bidi
 * controls that are not catalog text.
 */

export type UnresolvedFragment = {
  fragment: string;
  reason: string;
};

export type RepairResult = {
  value: string;
  changed: boolean;
  unresolved: UnresolvedFragment[];
};

const WIN1252_BYTE_TO_UNICODE = new Map<number, number>([
  [0x80, 0x20ac],
  [0x82, 0x201a],
  [0x83, 0x0192],
  [0x84, 0x201e],
  [0x85, 0x2026],
  [0x86, 0x2020],
  [0x87, 0x2021],
  [0x88, 0x02c6],
  [0x89, 0x2030],
  [0x8a, 0x0160],
  [0x8b, 0x2039],
  [0x8c, 0x0152],
  [0x8e, 0x017d],
  [0x91, 0x2018],
  [0x92, 0x2019],
  [0x93, 0x201c],
  [0x94, 0x201d],
  [0x95, 0x2022],
  [0x96, 0x2013],
  [0x97, 0x2014],
  [0x98, 0x02dc],
  [0x99, 0x2122],
  [0x9a, 0x0161],
  [0x9b, 0x203a],
  [0x9c, 0x0153],
  [0x9e, 0x017e],
  [0x9f, 0x0178],
]);

const UNICODE_TO_WIN1252 = new Map<number, number>(
  [...WIN1252_BYTE_TO_UNICODE.entries()].map(([byte, codePoint]) => [codePoint, byte]),
);

const UNDEFINED_WIN1252_BYTES = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);
const DEFINED_C1_TO_UNICODE = new Map<number, string>(
  [...WIN1252_BYTE_TO_UNICODE.entries()].map(([byte, codePoint]) => [
    byte,
    String.fromCodePoint(codePoint),
  ]),
);

const LIGATURE_ASCII: Array<[string, string]> = [
  ['\uFB00', 'ff'],
  ['\uFB01', 'fi'],
  ['\uFB02', 'fl'],
  ['\uFB03', 'ffi'],
  ['\uFB04', 'ffl'],
];

const AUDIT_CHARACTERS = [
  '\u2018',
  '\u2019',
  '\u201C',
  '\u201D',
  '\u2013',
  '\u2014',
  '\u2026',
  '\u02DA',
  '\u02DC',
  '\u00B0',
  '\u00B1',
  '\u00AE',
  '\u00B5',
  '\u00D7',
  '\u00D8',
  '\u00A9',
  '\u00A0',
  '\u20B9',
  '\u2103',
  '\u2109',
  '\u2122',
  '\u2212',
  '\u03B1',
  '\u03B2',
  '\u03BC',
  '\u2082',
  '\u25AA',
  '\u2264',
  '\u2265',
  '\u02B9',
  '\u02BA',
  '\u2153',
  '\u00E9',
  '\u00E8',
  '\u00EA',
  '\u00EB',
  '\u00E1',
  '\u00E0',
  '\u00F3',
  '\u00F1',
  '\u00FC',
  '\u00F6',
];

const VISUAL_SECOND_CHARS = 'éèêëáàâäãåæçíìîïñóòôöõúùûüýÿÉÈÊËÁÀÂÄÃÅÆÇÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ×Øµ°±®';

function charToWin1252Byte(char: string): number | undefined {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return undefined;
  const mapped = UNICODE_TO_WIN1252.get(codePoint);
  if (mapped !== undefined) return mapped;
  if (UNDEFINED_WIN1252_BYTES.has(codePoint) || codePoint <= 0xff) return codePoint;
  return undefined;
}

function utf8SequenceLength(leadByte: number): number {
  if (leadByte >= 0xc2 && leadByte <= 0xdf) return 2;
  if (leadByte >= 0xe0 && leadByte <= 0xef) return 3;
  if (leadByte >= 0xf0 && leadByte <= 0xf4) return 4;
  return 0;
}

function isSafeDecoded(text: string): boolean {
  if (!text) return false;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) continue;
    if (codePoint < 0x20 || codePoint === 0x7f) return false;
    if (codePoint >= 0x80 && codePoint <= 0x9f) return false;
    if (codePoint === 0xfffd) return false;
  }
  return true;
}

function decodeUtf8Bytes(bytes: number[]): string | null {
  const decoded = Buffer.from(bytes).toString('utf8');
  if (!isSafeDecoded(decoded)) return null;
  const roundTrip = Buffer.from(decoded, 'utf8');
  if (roundTrip.length !== bytes.length) return null;
  for (let index = 0; index < bytes.length; index += 1) {
    if (roundTrip[index] !== bytes[index]) return null;
  }
  return decoded;
}

function expandLigatures(value: string): string {
  let current = value;
  for (const [ligature, ascii] of LIGATURE_ASCII) current = current.split(ligature).join(ascii);
  return current;
}

export function encodeWindows1252Mojibake(value: string): string {
  let output = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    output += String.fromCodePoint(WIN1252_BYTE_TO_UNICODE.get(byte) ?? byte);
  }
  return output;
}

function buildExactMaps(): Array<[string, string]> {
  const maps = new Map<string, string>();
  const remember = (from: string, to: string) => {
    if (from && from !== to && !maps.has(from)) maps.set(from, to);
  };

  const originals = new Set<string>(AUDIT_CHARACTERS);
  for (let codePoint = 0xa0; codePoint <= 0xff; codePoint += 1) {
    originals.add(String.fromCharCode(codePoint));
  }

  for (const original of originals) {
    const once = encodeWindows1252Mojibake(original);
    const twice = encodeWindows1252Mojibake(once);
    const thrice = encodeWindows1252Mojibake(twice);
    remember(thrice, original);
    remember(twice, original);
    remember(once, original);
  }

  for (const [ligature, ascii] of LIGATURE_ASCII) {
    const once = encodeWindows1252Mojibake(ligature);
    const twice = encodeWindows1252Mojibake(once);
    remember(twice, ascii);
    remember(once, ascii);
  }

  for (const char of VISUAL_SECOND_CHARS) {
    remember(`\u00C3${char}`, char);
  }

  remember('Ã¢â‚¬â„¢', '\u2019');
  remember('Ã¢â‚¬Å“', '\u201C');
  remember('Ã¢â‚¬Â\u009d', '\u201D');

  return [...maps.entries()].sort((left, right) => right[0].length - left[0].length);
}

const EXACT_MAPS = buildExactMaps();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function regexCharClass(chars: string): string {
  const escaped = chars.replace(/[\\\]^-]/g, '\\$&');
  return `[${escaped}]`;
}

const C1_CHARS = Array.from({ length: 32 }, (_, index) => String.fromCharCode(0x80 + index)).join('');
const INVISIBLE_FORMAT = '\u200B\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\uFEFF';
const C1_CLASS = regexCharClass(C1_CHARS);
/**
 * C0 except NUL/tab/LF/CR, plus DEL. Written as POSIX hex escapes so the bound
 * PostgreSQL text parameter never contains a literal U+0000 (error 22021).
 */
const SQL_C0_DEL_CLASS = '[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]';
/** In-memory/CSV detector also matches U+0000; that character cannot be stored in PostgreSQL text. */
const JS_C0_DEL_CLASS = '[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]';
const STRAY_LEAD_FOLLOWER = ' \t,.;:!?)]}\'"';
const STRAY_LEAD_PATTERNS = ['Â', 'Ã'].flatMap((lead) =>
  [...STRAY_LEAD_FOLLOWER, ''].map((follower) => `${lead}${follower}`).filter((item) => item.length === 2),
);

const DETECTOR_SOURCES = [
  ...new Set([
    ...EXACT_MAPS.map(([from]) => from).filter((from) => from.length >= 2),
    ...STRAY_LEAD_PATTERNS,
    'â€',
    'ðŸ',
    'ï¿½',
    'ï¬',
    '\uFFFD',
    '\u02DA',
  ]),
].sort((left, right) => right.length - left.length);

function detectorBody(controlClass: string): string {
  return [...DETECTOR_SOURCES.map(escapeRegex), controlClass, C1_CLASS, '[ÂÃ]$', 'º\\s*[CFcf]'].join(
    '|',
  );
}

export function assertNoNulCodePoint(value: string, label: string): string {
  const index = value.indexOf('\u0000');
  if (index !== -1) {
    throw new Error(
      `${label} contains U+0000 at index ${index}; PostgreSQL UTF-8 text cannot encode NUL.`,
    );
  }
  return value;
}

export const SQL_INDICATOR = assertNoNulCodePoint(
  `(${detectorBody(SQL_C0_DEL_CLASS)})`,
  'SQL_INDICATOR',
);
export const JS_INDICATOR = new RegExp(detectorBody(JS_C0_DEL_CLASS), 'u');
const JS_INDICATOR_GLOBAL = new RegExp(detectorBody(JS_C0_DEL_CLASS), 'gu');

function applyExactMaps(value: string): string {
  let current = value;
  for (const [from, to] of EXACT_MAPS) {
    if (current.includes(from)) current = current.split(from).join(to);
  }
  return current;
}

function applyContextualDegree(value: string): string {
  return value
    .replace(/\u02DA\s*(?=[CFcf])/g, '\u00B0')
    .replace(/\u00BA\s*(?=[CFcf])/g, '\u00B0');
}

function mapDefinedC1Controls(value: string): string {
  let output = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    output += DEFINED_C1_TO_UNICODE.get(code) ?? char;
  }
  return output;
}

function isStrayLeadFollower(nextCode: number | undefined): boolean {
  if (nextCode === undefined) return true;
  if (nextCode <= 0x20) return true;
  if (nextCode >= 0x21 && nextCode <= 0x2f) return true;
  if (nextCode >= 0x3a && nextCode <= 0x40) return true;
  if (nextCode >= 0x5b && nextCode <= 0x60) return true;
  if (nextCode >= 0x7b && nextCode <= 0x7e) return true;
  return false;
}

function stripStrayUtf8LeadBytes(value: string): string {
  const chars = [...value];
  let output = '';
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const code = char.codePointAt(0) ?? 0;
    if (code === 0xc2 || code === 0xc3) {
      const nextCode = chars[index + 1]?.codePointAt(0);
      if (isStrayLeadFollower(nextCode)) continue;
    }
    output += char;
  }
  return output;
}

function stripForbiddenControls(value: string): string {
  let output = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      output += char;
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    if (INVISIBLE_FORMAT.includes(char)) continue;
    output += char;
  }
  return output;
}

function decodeMappedChars(chars: string[]): string | null {
  const bytes: number[] = [];
  for (const char of chars) {
    const byte = charToWin1252Byte(char);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  const decoded = decodeUtf8Bytes(bytes);
  if (!decoded || decoded === chars.join('')) return null;
  return expandLigatures(decoded);
}

function decodeIterative(value: string): string | null {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeMappedChars([...current]);
    if (!next || next === current) break;
    current = next;
  }
  return current === value ? null : current;
}

function repairMixed(value: string): string {
  const chars = [...value];
  let output = '';
  let index = 0;
  while (index < chars.length) {
    const leadByte = charToWin1252Byte(chars[index] ?? '');
    const minLength = leadByte === undefined ? 0 : utf8SequenceLength(leadByte);
    let matched: string | null = null;
    let consumed = 0;
    if (minLength > 0) {
      const max = Math.min(chars.length, index + 24);
      for (let end = max; end >= index + minLength; end -= 1) {
        const slice = chars.slice(index, end);
        const decoded = decodeIterative(slice.join(''));
        if (!decoded) continue;
        matched = decoded;
        consumed = end - index;
        break;
      }
    }
    if (matched !== null) {
      output += matched;
      index += consumed;
    } else {
      output += chars[index];
      index += 1;
    }
  }
  return output;
}

export function reasonFor(fragment: string): string {
  if (fragment === '\uFFFD' || fragment === 'ï¿½') return 'unrecoverable_replacement_character';
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(fragment)) return 'c0_control_character';
  if (/[\u0080-\u009F]/.test(fragment)) return 'c1_control_character';
  if (fragment === '\u00C2' || fragment === '\u00C3') return 'stray_utf8_lead_byte';
  if (fragment === '\u02DA') return 'ring_above_not_temperature';
  if (fragment.startsWith('â€') && fragment.length < 3) return 'incomplete_punctuation_mojibake';
  if (fragment.startsWith('ðŸ') && fragment.length < 4) return 'incomplete_emoji_mojibake';
  if (fragment.startsWith('ï¬') && fragment.length < 3) return 'incomplete_ligature_mojibake';
  return 'ambiguous_or_incomplete_mojibake';
}

export function findUnresolved(value: string): UnresolvedFragment[] {
  const unresolved: UnresolvedFragment[] = [];
  JS_INDICATOR_GLOBAL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JS_INDICATOR_GLOBAL.exec(value))) {
    unresolved.push({ fragment: match[0], reason: reasonFor(match[0]) });
    if (match[0].length === 0) JS_INDICATOR_GLOBAL.lastIndex += 1;
  }
  return unresolved;
}

export function findReviewOnlyFragments(value: string): UnresolvedFragment[] {
  const extra: UnresolvedFragment[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\u00AD/gu, 'soft_hyphen'],
    [/\u00A2/gu, 'suspicious_cent_sign'],
    [/\u02DC/gu, 'suspicious_small_tilde'],
    [/\d[\u2018\u2019\u201C\u201D]\d/gu, 'curly_quote_between_numbers'],
    [/\s[\u2018\u2019\u201C\u201D]\s/gu, 'spaced_curly_quote'],
    [/\d+\.\d+\.\d+\s*[°\u00B0]?\s*[CFcf]/gu, 'malformed_numeric_expression'],
  ];
  for (const [pattern, reason] of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) {
      extra.push({ fragment: match[0], reason });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return extra;
}

export function repairText(value: string): RepairResult {
  if (!value) return { value, changed: false, unresolved: [] };
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = stripForbiddenControls(
      applyContextualDegree(
        stripStrayUtf8LeadBytes(mapDefinedC1Controls(repairMixed(applyExactMaps(current)))),
      ),
    );
    if (next === current) break;
    current = next;
  }
  return {
    value: current,
    changed: current !== value,
    unresolved: findUnresolved(current),
  };
}

export function hasIndicator(value: unknown): boolean {
  return typeof value === 'string' && JS_INDICATOR.test(value);
}

export function cleanString(value: string): string {
  return repairText(value).value;
}

export function cleanJson(value: unknown): {
  value: unknown;
  changed: boolean;
  unresolved: UnresolvedFragment[];
} {
  if (typeof value === 'string') {
    const repaired = repairText(value);
    return {
      value: repaired.value,
      changed: repaired.changed,
      unresolved: repaired.unresolved,
    };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const unresolved: UnresolvedFragment[] = [];
    const next = value.map((item) => {
      const result = cleanJson(item);
      changed ||= result.changed;
      unresolved.push(...result.unresolved);
      return result.value;
    });
    return { value: next, changed, unresolved };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const unresolved: UnresolvedFragment[] = [];
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const result = cleanJson(item);
      next[key] = result.value;
      changed ||= result.changed;
      unresolved.push(...result.unresolved);
    }
    return { value: next, changed, unresolved };
  }
  return { value, changed: false, unresolved: [] };
}
