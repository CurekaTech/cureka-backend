import fs from 'node:fs';
import path from 'node:path';
import { ReleaseNoteError } from './errors.mjs';
import { assertSafeReleaseId } from './paths.mjs';
import { assertNoSecrets, findSecrets } from './secrets.mjs';
import { buildReleaseNote } from './build.mjs';

const FULL_SHA = /^[0-9a-f]{40}$/;
const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;
const PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9._/-]+\/pull\/\d+$/;

export function shouldGenerateReleaseNote(event) {
  if (!event || event.action !== 'closed') {
    return { run: false, reason: 'pull request is not closed' };
  }
  if (event.merged !== true) {
    return { run: false, reason: 'pull request was closed without being merged' };
  }
  if (event.baseRef !== 'development') {
    return { run: false, reason: 'pull request does not target development' };
  }
  return { run: true, reason: 'merged into development' };
}

export function assertLinearRebase(commits, baselineSha, targetSha, expectedCount) {
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new ReleaseNoteError(
      'BASELINE_BLOCKED',
      'No commits were found between the verified base SHA and the merge commit.',
    );
  }
  if (expectedCount != null && commits.length !== expectedCount) {
    throw new ReleaseNoteError(
      'BASELINE_BLOCKED',
      `Expected ${expectedCount} pull-request commits and found ${commits.length}. Refusing an ambiguous range.`,
    );
  }
  let previous = baselineSha;
  commits.forEach((commit, index) => {
    const parents = commit.parents || [];
    if (parents.length !== 1 || parents[0] !== previous) {
      throw new ReleaseNoteError(
        'BASELINE_BLOCKED',
        'The comparison range is not a straight line from the verified base commit. Refusing to include unrelated commits.',
      );
    }
    previous = commit.sha;
    if (index === commits.length - 1 && commit.sha !== targetSha) {
      throw new ReleaseNoteError('BASELINE_BLOCKED', 'The range does not end at the verified merge commit.');
    }
  });
}

export function selectPullRequestRange(input) {
  if (input.merged !== true) {
    throw new ReleaseNoteError('VALIDATION', 'Pull request was not merged. No release note will be generated.');
  }
  if (input.baseRef !== 'development') {
    throw new ReleaseNoteError('VALIDATION', 'Pull request does not target development. No release note will be generated.');
  }
  const targetSha = String(input.mergeCommitSha || '').toLowerCase();
  if (!FULL_SHA.test(targetSha)) {
    throw new ReleaseNoteError('BASELINE_BLOCKED', 'Merge commit SHA is missing. Refusing to use the branch tip.');
  }
  const parents = (input.parents || []).map((parent) => String(parent).toLowerCase());
  if (parents.length === 0 || parents.some((parent) => !FULL_SHA.test(parent))) {
    throw new ReleaseNoteError('BASELINE_BLOCKED', 'Merge commit parents are unavailable. Refusing to guess the comparison range.');
  }
  if (parents.length >= 2) {
    if (parents[0] === targetSha) {
      throw new ReleaseNoteError('BASELINE_BLOCKED', 'The merge commit is the same as its first parent.');
    }
    return { baselineSha: parents[0], targetSha, strategy: 'merge' };
  }
  const parent = parents[0];
  const baseSha = input.baseSha ? String(input.baseSha).toLowerCase() : '';
  if (baseSha && baseSha !== parent) {
    if (!FULL_SHA.test(baseSha)) {
      throw new ReleaseNoteError('BASELINE_BLOCKED', 'Pull request base SHA is not a full commit SHA.');
    }
    if (baseSha === targetSha) {
      throw new ReleaseNoteError('BASELINE_BLOCKED', 'Base SHA is the same as the target commit.');
    }
    assertLinearRebase(input.rangeCommits, baseSha, targetSha, input.commitCount ?? null);
    return { baselineSha: baseSha, targetSha, strategy: 'rebase' };
  }
  if (parent === targetSha) {
    throw new ReleaseNoteError('BASELINE_BLOCKED', 'The squash commit is the same as its parent.');
  }
  return { baselineSha: parent, targetSha, strategy: 'squash' };
}

export function developmentReleaseId(prNumber, mergeSha) {
  if (!/^\d{1,10}$/.test(String(prNumber))) {
    throw new ReleaseNoteError('VALIDATION', 'Pull request number is invalid.');
  }
  const sha = String(mergeSha || '').toLowerCase();
  if (!FULL_SHA.test(sha)) {
    throw new ReleaseNoteError('VALIDATION', 'Merge commit SHA is invalid.');
  }
  return assertSafeReleaseId(`dev-pr-${prNumber}-${sha.slice(0, 12)}`);
}

export function emailIdempotencyKey({ repository, prNumber, mergeSha }) {
  const repo = String(repository || '').replace(/[^A-Za-z0-9._/-]/g, '');
  if (!repo || !/^\d{1,10}$/.test(String(prNumber)) || !FULL_SHA.test(String(mergeSha || '').toLowerCase())) {
    throw new ReleaseNoteError('VALIDATION', 'Email idempotency key is missing a repository, pull request number, or merge SHA.');
  }
  return `${repo}:${prNumber}:${String(mergeSha).toLowerCase()}`;
}

export function emailAlreadySent(record, key) {
  return Boolean(record && record.status === 'sent' && record.key === key);
}

export function sanitizeUntrustedText(value, maxLength = 180) {
  const singleLine = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!singleLine || findSecrets(singleLine).length > 0) return '[redacted]';
  return singleLine.slice(0, maxLength);
}

export function safeBranchName(value) {
  if (typeof value === 'string' && BRANCH.test(value) && !value.includes('..') && !value.startsWith('-') && !value.includes('//')) {
    return value;
  }
  return 'TBD';
}

export function safePullRequestUrl(value) {
  return typeof value === 'string' && PR_URL.test(value) ? value : 'TBD';
}

export function parseRecipients(value) {
  const parts = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !ADDRESS.test(part))) {
    throw new ReleaseNoteError('VALIDATION', 'Email recipient must be a plain address. Recipients are not taken from the pull request.');
  }
  return parts;
}

export function describeEmailSettings(env) {
  const missing = [];
  if (env.RELEASE_NOTE_EMAIL_ENABLED !== 'true') missing.push('RELEASE_NOTE_EMAIL_ENABLED');
  for (const name of ['RELEASE_NOTE_EMAIL_TO', 'SMTP_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
    if (!String(env[name] || '').trim()) missing.push(name);
  }
  let recipients = [];
  if (env.RELEASE_NOTE_EMAIL_ENABLED === 'true' && !missing.includes('RELEASE_NOTE_EMAIL_TO')) {
    recipients = parseRecipients(env.RELEASE_NOTE_EMAIL_TO);
  }
  return {
    ready: missing.length === 0,
    missing,
    recipients,
    from: String(env.SMTP_FROM || '').trim(),
  };
}

export function developmentBusinessSummary() {
  return {
    subject: 'Development branch change ready for review',
    introduction: 'A change was merged into the development branch. This note is for review. It is not approval to deploy to production.',
    releaseWindow: 'No production window is scheduled. This is a development validation only.',
    customerImpact: 'Customer impact has not been confirmed from this automatic note.',
    operationsImpact: 'No production operation is requested. Support does not need to change a live process from this note alone.',
    behindTheScenes: 'The attached playbook lists the committed files, migration filenames, and setting names found in this merge. Setting values are not included.',
    decisions: 'Confirm whether this development change still needs a separate production release decision. Reply by: TBD.',
    excludedChanges: 'The customer website and the admin panel were not part of this automatic note.',
    knownCustomerImpact: 'No customer downtime is confirmed by this automatic note.',
    contacts: 'Dev lead, QA owner, and approvers: TBD.',
    sender: 'TBD',
    notificationTiming: 'TBD',
    manuallyEditedFields: [],
  };
}

export function buildDevelopmentManifest({ releaseId, pullRequest, range, checkout, mergedAt }) {
  if (!mergedAt || Number.isNaN(Date.parse(mergedAt))) {
    throw new ReleaseNoteError('VALIDATION', 'Merged time is missing. Refusing to invent a deployment window.');
  }
  return {
    schemaVersion: 1,
    releaseId,
    releaseName: `Development validation ${releaseId}`,
    developmentValidation: true,
    example: false,
    plannedDeploymentAt: mergedAt,
    targetEnvironment: 'development',
    devLead: { name: 'TBD', email: 'TBD' },
    qaOwner: { name: 'TBD', email: 'TBD' },
    approvers: [{ role: 'Dev lead', name: 'TBD', status: 'pending' }],
    constraints: ['Development validation only. This is not production deployment approval.'],
    knownIssues: [],
    stakeholderDecisions: [],
    pullRequest: {
      number: Number(pullRequest.number),
      title: sanitizeUntrustedText(pullRequest.title),
      url: safePullRequestUrl(pullRequest.url),
      sourceBranch: safeBranchName(pullRequest.headRef),
      baseBranch: 'development',
      mergeCommitSha: range.targetSha,
      strategy: range.strategy,
    },
    repositories: [
      {
        id: 'cureka-backend',
        selected: true,
        localCheckoutPath: checkout,
        sourceBranch: safeBranchName(pullRequest.headRef),
        productionBranch: 'TBD',
        baseline: range.baselineSha,
        target: range.targetSha,
      },
      { id: 'cureka-frontend', selected: false },
      { id: 'cureka-admin', selected: false },
    ],
    businessSummary: developmentBusinessSummary(),
  };
}

export function buildNotification({ repository, pullRequest, range, riskLevel, summaryText }) {
  const title = sanitizeUntrustedText(pullRequest.title);
  const url = safePullRequestUrl(pullRequest.url);
  const text = [
    'Development-branch release note',
    '',
    'This is a development-branch release note. It is not production deployment approval.',
    '',
    `Repository: ${repository}`,
    `Pull request: #${pullRequest.number}`,
    `Title: ${title}`,
    `URL: ${url}`,
    `Merge commit: ${range.targetSha}`,
    `Comparison: ${range.baselineSha}..${range.targetSha}`,
    `Risk: ${riskLevel}`,
    '',
    summaryText,
    '',
    'The Word playbook is attached.',
  ].join('\n');
  const message = {
    subject: sanitizeUntrustedText(`Cureka backend development note #${pullRequest.number}: ${title}`, 180),
    text,
  };
  assertNoSecrets(message);
  return message;
}

export async function sendReleaseEmail({ transport, from, recipients, message, attachmentPath }) {
  const payload = {
    from,
    to: recipients,
    subject: message.subject,
    text: message.text,
    attachments: [{ filename: 'release-note.docx', path: attachmentPath }],
  };
  assertNoSecrets({ subject: payload.subject, text: payload.text, to: payload.to, from: payload.from });
  await transport.sendMail(payload);
  return payload;
}

function parseParents(output) {
  return String(output || '').split(/\s+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function parseRangeLog(output) {
  return String(output || '').split('\n').filter(Boolean).map((line) => {
    const [sha, parentField] = line.split('\x1f');
    return { sha: String(sha || '').toLowerCase(), parents: parseParents(parentField) };
  });
}

async function isAncestor(runGit, checkout, baseline, target) {
  try {
    await runGit(checkout, ['merge-base', '--is-ancestor', baseline, target]);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePullRequestRange({ runGit, checkout, event }) {
  const mergeCommitSha = String(event.mergeCommitSha || '').toLowerCase();
  if (!FULL_SHA.test(mergeCommitSha)) {
    throw new ReleaseNoteError('BASELINE_BLOCKED', 'Merge commit SHA is missing. Refusing to use the branch tip.');
  }
  let parentOutput = '';
  try {
    await runGit(checkout, ['rev-parse', '--verify', '--end-of-options', `${mergeCommitSha}^{commit}`]);
    // A merge commit has two parents. --verify rejects that list with
    // "Needed a single revision", and --end-of-options is echoed back.
    parentOutput = await runGit(checkout, ['rev-parse', `${mergeCommitSha}^@`]);
  } catch (error) {
    throw new ReleaseNoteError('BASELINE_BLOCKED', `Merge commit parents could not be read. ${error.message}`);
  }
  const parents = parseParents(parentOutput);
  const baseSha = event.baseSha ? String(event.baseSha).toLowerCase() : '';
  let rangeCommits = null;
  if (parents.length === 1 && FULL_SHA.test(baseSha) && baseSha !== parents[0]) {
    const ancestor = await isAncestor(runGit, checkout, baseSha, mergeCommitSha);
    if (!ancestor) {
      throw new ReleaseNoteError('BASELINE_BLOCKED', 'Pull request base SHA is not an ancestor of the merge commit.');
    }
    const logOutput = await runGit(checkout, ['log', '--reverse', '--format=%H%x1f%P', `${baseSha}..${mergeCommitSha}`]);
    rangeCommits = parseRangeLog(logOutput);
  }
  return selectPullRequestRange({ ...event, mergeCommitSha, baseSha, parents, rangeCommits });
}

function readRecord(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`);
}

export async function runMergedPullRequest(options) {
  const event = options.event || {};
  const decision = shouldGenerateReleaseNote(event);
  if (!decision.run) {
    return { generated: false, email: { sent: false, reason: decision.reason }, files: null };
  }
  const checkout = options.checkout;
  const runGit = options.runGit;
  const range = options.range || await resolvePullRequestRange({ runGit, checkout, event });
  const releaseId = developmentReleaseId(event.number, range.targetSha);
  const manifest = buildDevelopmentManifest({
    releaseId,
    pullRequest: event,
    range,
    checkout,
    mergedAt: event.mergedAt,
  });
  const build = options.build || buildReleaseNote;
  let built;
  try {
    built = await build(manifest, {
      repoRoot: options.repoRoot,
      collect: true,
      runGit,
      pathExists: options.pathExists,
      now: options.now,
    });
  } catch (error) {
    return { generated: false, email: { sent: false, reason: 'generation-failed', error }, files: null };
  }
  const statusPath = path.join(built.files.directory, 'email-status.txt');
  const settings = describeEmailSettings(options.env || {});
  if (!settings.ready) {
    fs.writeFileSync(statusPath, `Email was not sent. Missing configuration: ${settings.missing.join(', ')}\n`);
    return {
      generated: true,
      email: { sent: false, reason: 'missing-configuration', missing: settings.missing },
      files: built.files,
      manifest: built.manifest,
    };
  }
  const key = emailIdempotencyKey({
    repository: options.repository,
    prNumber: event.number,
    mergeSha: range.targetSha,
  });
  const recordPath = options.sentRecordPath;
  if (emailAlreadySent(readRecord(recordPath), key)) {
    fs.writeFileSync(statusPath, 'Email was not sent again. A successful send was already recorded for this merge commit.\n');
    return {
      generated: true,
      email: { sent: false, reason: 'already-sent' },
      files: built.files,
      manifest: built.manifest,
    };
  }
  const summaryText = built.email || built.manifest.businessSummary.introduction;
  const message = buildNotification({
    repository: options.repository,
    pullRequest: event,
    range,
    riskLevel: built.manifest.risk.level,
    summaryText,
  });
  await sendReleaseEmail({
    transport: options.transport,
    from: settings.from,
    recipients: settings.recipients,
    message,
    attachmentPath: built.files.docx,
  });
  writeRecord(recordPath, { key, status: 'sent', sentAt: options.now || new Date().toISOString() });
  fs.writeFileSync(statusPath, 'Email was sent with the Word playbook attached.\n');
  return {
    generated: true,
    email: { sent: true, reason: 'sent' },
    files: built.files,
    manifest: built.manifest,
  };
}
