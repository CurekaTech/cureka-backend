import crypto from 'node:crypto';

export const CHANGE_CATEGORIES = [
  'customer-facing',
  'api-integration',
  'admin-operational',
  'database-migration',
  'environment-config',
  'workers-queues',
  'dependencies',
  'performance-infrastructure',
  'security-auth',
  'bugfix-maintenance',
];

const PATH_RULES = [
  { category: 'database-migration', test: /(?:^|\/)database\/migrations\/[^/]+\.ts$/ },
  { category: 'environment-config', test: /(?:^|\/)\.env(?:[.]|$)|(?:^|\/)[^/]*\.env(?:[.][^/]+)?$|ecosystem\.config\.js$/ },
  { category: 'workers-queues', test: /(?:^|\/)processors\/|queue\.constants\.ts$|image-worker/ },
  { category: 'security-auth', test: /(?:auth|guards?|rbac|permissions?|passport)/i },
  { category: 'performance-infrastructure', test: /(?:cache|image-pipeline|image-worker|sitemap)/i },
  { category: 'dependencies', test: /(?:^|\/)package(?:-lock)?\.json$/ },
  { category: 'api-integration', test: /\.controller\.ts$/ },
  { category: 'admin-operational', test: /(?:^|\/)admin[-_/]/i },
  { category: 'customer-facing', test: /(?:^|\/)modules\/(?:product|cart|orders?|catalog|checkout)\// },
];

const HIGH_RISK_PATH = /(payment|checkout|razorpay|cashfree|gokwik|kwikpass|\/auth\/|guards?|rbac|permissions?)/i;

export function classifyFilePath(filePath) {
  const categories = [];
  for (const rule of PATH_RULES) {
    if (rule.test.test(filePath) && !categories.includes(rule.category)) categories.push(rule.category);
  }
  if (categories.length === 0) categories.push('bugfix-maintenance');
  return categories;
}

export function fingerprintChange(change) {
  const files = (change.files || [])
    .map((file) => (typeof file === 'string' ? file : `${file.status || ''}:${file.path}`))
    .sort();
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      id: change.id,
      summary: change.summary || '',
      sha: change.sha || '',
      files,
    }))
    .digest('hex')
    .slice(0, 16);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

/**
 * Risk is a review aid. Tests and a small diff do not lower the level.
 * HIGH covers payment, authentication, authorization, and destructive data changes.
 */
export function assessRisk(input) {
  const changes = input.changes || [];
  const reasons = [];
  let level = 'LOW';

  const bump = (next, reason) => {
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    if (rank[next] > rank[level]) level = next;
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (changes.length === 0) {
    bump('MEDIUM', 'No committed changes were classified, so this release cannot be treated as low risk.');
  }

  const categories = unique(changes.flatMap((change) => change.categories || []));
  if (changes.length > 1 || categories.length > 1) {
    bump('MEDIUM', 'The release contains multiple changes or more than one change category, so verification needs to cover how they interact.');
  }

  for (const change of changes) {
    const paths = (change.files || []).map((file) => (typeof file === 'string' ? file : file.path)).join('\n');
    if ((change.categories || []).includes('security-auth') || HIGH_RISK_PATH.test(paths) || HIGH_RISK_PATH.test(change.summary || '')) {
      bump('HIGH', `Security, authentication, authorization, payment, or checkout paths are present (${change.id}).`);
    }
    if ((change.categories || []).includes('database-migration') || (change.migrations || []).length > 0) {
      bump('MEDIUM', `Database migrations are included (${change.id}). Apply and verify them before treating the release as routine.`);
    }
    if ((change.categories || []).includes('environment-config') || (change.environmentVariableNames || []).length > 0) {
      bump('MEDIUM', `Configuration or environment-variable names changed (${change.id}). Values are intentionally omitted.`);
    }
    if (change.destructive || (change.destructiveSignals || []).length > 0) {
      bump('HIGH', `A destructive data change was detected (${(change.destructiveSignals || ['destructive SQL']).join(', ')}) on ${change.id}.`);
    }
    if ((change.categories || []).includes('customer-facing') || (change.categories || []).includes('api-integration')) {
      bump('MEDIUM', `Customer-facing or API behavior is in the release (${change.id}) and needs targeted QA.`);
    }
  }

  if (level === 'LOW') {
    reasons.unshift('The classified change set is a single isolated, non-destructive maintenance change. Confirm that reading of the diff agrees before accepting low risk.');
  }

  return { level, reasons };
}
