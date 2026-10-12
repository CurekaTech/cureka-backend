import { ReleaseNoteError } from './errors.mjs';

const SECRET_PATTERNS = [
  { name: 'database-url', regex: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/i },
  { name: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'assigned-secret', regex: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"]?[^\s'"]{6,}/i },
  { name: 'razorpay-key', regex: /\brzp_(?:live|test)_[A-Za-z0-9]+/ },
  { name: 'bearer-token', regex: /\bBearer\s+[A-Za-z0-9\-._~+/]{12,}=*\b/ },
];

function walk(value, visit, trail = []) {
  if (value == null) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    visit(String(value), trail.join('.'));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...trail, String(index)]));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visit(key, [...trail, key].join('.'));
      walk(child, visit, [...trail, key]);
    }
  }
}

export function findSecrets(value) {
  const hits = [];
  walk(value, (text, location) => {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(text)) {
        hits.push({ location, pattern: pattern.name });
      }
    }
  });
  return hits;
}

export function assertNoSecrets(value, label = 'release manifest') {
  const hits = findSecrets(value);
  if (hits.length > 0) {
    const where = hits.map((hit) => `${hit.location || label} (${hit.pattern})`).join(', ');
    throw new ReleaseNoteError(
      'SECRET_DETECTED',
      `Refusing to write ${label} because it contains a credential or secret value: ${where}. Record environment-variable names only.`,
    );
  }
}

/** Pull variable names from a unified diff. Values after "=" are never returned. */
export function extractEnvNames(diffText) {
  const names = new Set();
  if (!diffText) return [];
  for (const line of String(diffText).split('\n')) {
    if (!line.startsWith('+') && !line.startsWith('-')) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const body = line.slice(1).trim();
    const match = body.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

export function destructiveSignals(diffText) {
  const signals = [];
  const text = String(diffText || '');
  if (/\bDROP\s+TABLE\b/i.test(text)) signals.push('DROP TABLE');
  if (/\bTRUNCATE\b/i.test(text)) signals.push('TRUNCATE');
  if (/\bDELETE\s+FROM\b/i.test(text)) signals.push('DELETE FROM');
  return signals;
}
