import { ReleaseNoteError } from './errors.mjs';

export const EMAIL_PLACEHOLDERS = [
  'subject',
  'introduction',
  'releaseWindow',
  'customerImpact',
  'operationsImpact',
  'behindTheScenes',
  'decisions',
  'excludedChanges',
  'knownCustomerImpact',
  'contacts',
  'sender',
  'notificationTiming',
];

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const SHA_PATTERN = /\b[0-9a-f]{7,40}\b/i;
const PR_PATTERN = /\b(?:PR|pull request)\s*#?\d+\b/i;
const PATH_PATTERN = /\b[\w.-]+\/[\w./-]+\.(?:ts|js|tsx|jsx|mjs|sql|json)\b/;

export function assertBusinessLanguage(value, field) {
  const text = String(value);
  if (SHA_PATTERN.test(text) || PR_PATTERN.test(text) || PATH_PATTERN.test(text)) {
    throw new ReleaseNoteError(
      'VALIDATION',
      `Business summary field ${field} contains a commit, pull request, or source path. Keep that detail in the playbook only.`,
    );
  }
}

export function renderBusinessEmail(template, summary) {
  if (typeof template !== 'string' || template.trim() === '') {
    throw new ReleaseNoteError('VALIDATION', 'Email template is empty.');
  }
  const unknown = new Set();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!EMAIL_PLACEHOLDERS.includes(match[1])) unknown.add(match[1]);
  }
  if (unknown.size > 0) {
    throw new ReleaseNoteError(
      'UNKNOWN_PLACEHOLDER',
      `Unknown email template placeholder: ${[...unknown].join(', ')}.`,
    );
  }
  if (summary == null) {
    throw new ReleaseNoteError('VALIDATION', 'Business summary is missing.');
  }
  let rendered = template;
  for (const key of EMAIL_PLACEHOLDERS) {
    if (!Object.prototype.hasOwnProperty.call(summary, key) || String(summary[key]).trim() === '') {
      throw new ReleaseNoteError('VALIDATION', `Business summary is missing ${key}.`);
    }
    assertBusinessLanguage(summary[key], key);
    rendered = rendered.replaceAll(`{{${key}}}`, String(summary[key]).trim());
  }
  if (rendered.includes('{{')) {
    throw new ReleaseNoteError('UNKNOWN_PLACEHOLDER', 'Unresolved email template placeholder.');
  }
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}
