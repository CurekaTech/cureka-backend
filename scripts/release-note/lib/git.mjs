import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ReleaseNoteError } from './errors.mjs';
import { classifyFilePath, fingerprintChange } from './classify.mjs';
import { destructiveSignals, extractEnvNames } from './secrets.mjs';

const execFileAsync = promisify(execFile);

export const READ_ONLY_GIT_COMMANDS = Object.freeze([
  'status',
  'fetch',
  'log',
  'diff',
  'show',
  'rev-parse',
  'tag',
  'merge-base',
]);

const ALLOWED = new Set(READ_ONLY_GIT_COMMANDS);
const REFUSED = new Set([
  'reset',
  'checkout',
  'switch',
  'clean',
  'commit',
  'push',
  'rebase',
  'merge',
  'cherry-pick',
  'stash',
  'am',
  'revert',
  'filter-branch',
  'update-ref',
  'add',
  'rm',
  'mv',
]);

const FULL_SHA = /^[0-9a-f]{40}$/;

export function assertAllowedGitInvocation(args, options = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some((arg) => typeof arg !== 'string' || arg.length === 0)) {
    throw new ReleaseNoteError('GIT_WRITE_REFUSED', 'Refusing an empty or invalid git invocation.');
  }
  const [command, ...rest] = args;
  if (REFUSED.has(command) || !ALLOWED.has(command)) {
    throw new ReleaseNoteError('GIT_WRITE_REFUSED', `Refusing git ${command}. Release-note git access is read-only.`);
  }
  if (command === 'tag' && !rest.includes('--list')) {
    throw new ReleaseNoteError('GIT_WRITE_REFUSED', 'git tag is allowed only as git tag --list.');
  }
  if (command === 'fetch') {
    if (!options.allowFetch) {
      throw new ReleaseNoteError('GIT_WRITE_REFUSED', 'git fetch requires explicit permission.');
    }
    if (rest.some((arg) => arg.includes(':') || arg.startsWith('+'))) {
      throw new ReleaseNoteError('GIT_WRITE_REFUSED', 'git fetch refspecs that update local branches are refused.');
    }
  }
  if (rest.some((arg) => arg === '--hard' || arg === '--force' || arg === '--mirror')) {
    throw new ReleaseNoteError('GIT_WRITE_REFUSED', 'Refusing a git argument that mutates repository state.');
  }
}

export async function runGit(cwd, args, options = {}) {
  assertAllowedGitInvocation(args, options);
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout;
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr) : '';
    const wrapped = new Error((stderr || error.message || 'git failed').trim());
    wrapped.code = error.code;
    wrapped.gitArgs = args.slice();
    throw wrapped;
  }
}

function blockedRepo(repo, blockReason, message) {
  return {
    id: repo.id,
    selected: true,
    sourceBranch: repo.sourceBranch,
    productionBranch: repo.productionBranch,
    baseline: repo.baseline ?? null,
    target: repo.target ?? null,
    localCheckoutPath: repo.localCheckoutPath ?? null,
    accessible: blockReason !== 'inaccessible',
    accessError: blockReason === 'inaccessible' ? message : null,
    blocked: true,
    blockReason,
    blockMessage: message,
    baselineSha: null,
    targetSha: null,
    range: null,
    commits: [],
    changes: [],
    uncommittedChanges: [],
    migrations: [],
    environmentVariableNames: [],
    destructiveSignals: [],
  };
}

function baselineProblem(repo) {
  if (repo.baselineResolution === 'ambiguous') {
    return 'Comparison baseline is marked ambiguous. Provide one previous deployed commit or tag.';
  }
  if (repo.baselineResolution === 'missing' || repo.baseline == null || String(repo.baseline).trim() === '') {
    return 'Comparison baseline is missing. Provide the previous deployed commit or tag.';
  }
  const baseline = String(repo.baseline).trim();
  if (baseline === 'TBD' || baseline === 'auto' || baseline === 'HEAD') {
    return `Comparison baseline "${baseline}" is not an explicit previous deployed commit or tag.`;
  }
  if (repo.target == null || String(repo.target).trim() === '' || repo.target === 'TBD' || repo.target === 'HEAD') {
    return 'Release target commit or branch is missing or ambiguous. Name the exact intended release target.';
  }
  return null;
}

async function resolveSha(run, checkout, ref, label) {
  let output;
  try {
    output = await run(checkout, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  } catch (error) {
    const detail = error.message || '';
    const ambiguous = /ambiguous/i.test(detail);
    return {
      ok: false,
      message: ambiguous
        ? `${label} "${ref}" is ambiguous. ${detail}`
        : `${label} "${ref}" could not be resolved. ${detail}`,
    };
  }
  const sha = String(output).trim().toLowerCase();
  if (!FULL_SHA.test(sha)) {
    return { ok: false, message: `${label} "${ref}" did not resolve to one full commit SHA.` };
  }
  return { ok: true, sha };
}

export function parseCommitLog(text) {
  const commits = [];
  let current = null;
  for (const line of String(text || '').split('\n')) {
    if (!line) continue;
    if (line.startsWith('COMMIT\x1f')) {
      const parts = line.split('\x1f');
      current = { sha: parts[1], subject: parts.slice(2).join('\x1f'), files: [] };
      commits.push(current);
      continue;
    }
    if (!current || !line.includes('\t')) continue;
    const [status, ...rest] = line.split('\t');
    current.files.push({ status, path: rest.join('\t') });
  }
  return commits;
}

function buildChanges(repo, commits, envNames, signals) {
  return commits.map((commit) => {
    const categories = [];
    for (const file of commit.files) {
      for (const category of classifyFilePath(file.path)) {
        if (!categories.includes(category)) categories.push(category);
      }
    }
    if (categories.length === 0) categories.push('bugfix-maintenance');
    const migrations = commit.files
      .map((file) => file.path)
      .filter((filePath) => /(?:^|\/)database\/migrations\/[^/]+\.ts$/.test(filePath))
      .map((filePath) => filePath.split('/').pop());
    const change = {
      id: `${repo.id}:${commit.sha}`,
      repositoryId: repo.id,
      sha: commit.sha,
      summary: commit.subject || '(no commit subject)',
      categories,
      categorySource: 'path-heuristic',
      needsHumanReview: true,
      files: commit.files,
      migrations,
      environmentVariableNames: envNames,
      destructive: signals.length > 0,
      destructiveSignals: signals,
    };
    change.contentHash = fingerprintChange(change);
    return change;
  });
}

export async function inspectRepository(repo, context) {
  const runGitCommand = context.runGit;
  const allowFetch = context.allowFetch === true;
  const pathExists = context.pathExists;
  const commands = [];
  const run = async (cwd, args) => {
    assertAllowedGitInvocation(args, { allowFetch });
    commands.push(args.slice());
    return runGitCommand(cwd, args, { allowFetch });
  };

  const problem = baselineProblem(repo);
  if (!repo.localCheckoutPath || pathExists(repo.localCheckoutPath) !== true) {
    const result = blockedRepo(
      repo,
      'inaccessible',
      `Repository ${repo.id} is missing or inaccessible at the configured checkout path.`,
    );
    result.gitCommands = commands;
    return result;
  }
  if (problem) {
    const result = blockedRepo(repo, 'baseline', problem);
    result.gitCommands = commands;
    return result;
  }

  let inside = '';
  try {
    inside = String(await run(repo.localCheckoutPath, ['rev-parse', '--is-inside-work-tree'])).trim();
  } catch (error) {
    const result = blockedRepo(
      repo,
      'inaccessible',
      `Repository ${repo.id} could not be read: ${error.message}`,
    );
    result.gitCommands = commands;
    return result;
  }
  if (inside !== 'true') {
    const result = blockedRepo(repo, 'inaccessible', `Repository ${repo.id} is not a Git work tree.`);
    result.gitCommands = commands;
    return result;
  }

  const baseline = await resolveSha(run, repo.localCheckoutPath, String(repo.baseline).trim(), 'Baseline');
  const target = await resolveSha(run, repo.localCheckoutPath, String(repo.target).trim(), 'Target');
  if (!baseline.ok || !target.ok) {
    const result = blockedRepo(repo, 'baseline', [baseline.message, target.message].filter(Boolean).join(' '));
    result.gitCommands = commands;
    return result;
  }

  let mergeBase = null;
  let historyWarning = null;
  try {
    mergeBase = String(await run(repo.localCheckoutPath, ['merge-base', baseline.sha, target.sha])).trim().toLowerCase();
    if (mergeBase !== baseline.sha) {
      historyWarning = 'The baseline is not an ancestor of the target. Review the range before treating it as a straight release delta.';
    }
  } catch (error) {
    const result = blockedRepo(
      repo,
      'baseline',
      `No reliable merge base between baseline and target for ${repo.id}: ${error.message}`,
    );
    result.gitCommands = commands;
    return result;
  }

  const range = `${baseline.sha}..${target.sha}`;
  const logText = await run(repo.localCheckoutPath, [
    'log',
    '--reverse',
    '--name-status',
    '--format=COMMIT%x1f%H%x1f%s',
    range,
  ]);
  const commits = parseCommitLog(logText);
  const statusText = await run(repo.localCheckoutPath, ['status', '--porcelain=v1', '--untracked-files=all']);
  const uncommittedChanges = String(statusText)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  let envDiff = '';
  let destructiveDiff = '';
  const touched = commits.flatMap((commit) => commit.files.map((file) => file.path));
  const envPaths = [...new Set(touched.filter((filePath) => /(^|\/)\.env(\.|$)/.test(filePath) || filePath.includes('.env')))];
  if (envPaths.length > 0) {
    envDiff = await run(repo.localCheckoutPath, [
      'diff',
      '--unified=0',
      baseline.sha,
      target.sha,
      '--',
      ...envPaths,
    ]);
  }
  if (touched.length > 0) {
    destructiveDiff = await run(repo.localCheckoutPath, [
      'diff',
      '--unified=0',
      '-G',
      'DROP TABLE|TRUNCATE|DELETE FROM',
      baseline.sha,
      target.sha,
    ]);
  }

  const envNames = extractEnvNames(envDiff);
  const signals = destructiveSignals(destructiveDiff);
  const changes = buildChanges(repo, commits, envNames, signals);

  return {
    id: repo.id,
    selected: true,
    sourceBranch: repo.sourceBranch,
    productionBranch: repo.productionBranch,
    baseline: repo.baseline,
    target: repo.target,
    localCheckoutPath: repo.localCheckoutPath,
    accessible: true,
    accessError: null,
    blocked: false,
    blockReason: null,
    blockMessage: null,
    baselineResolution: 'explicit',
    baselineSha: baseline.sha,
    targetSha: target.sha,
    range,
    mergeBase,
    historyWarning,
    commits: commits.map((commit) => ({ sha: commit.sha, subject: commit.subject })),
    changes,
    uncommittedChanges,
    migrations: [...new Set(changes.flatMap((change) => change.migrations || []))],
    environmentVariableNames: envNames,
    destructiveSignals: signals,
    gitCommands: commands,
  };
}

export async function collectSelectedRepositories(manifest, context) {
  const selected = (manifest.repositories || []).filter((repo) => repo.selected === true);
  const excludedRepositoryIds = (manifest.repositories || []).filter((repo) => repo.selected !== true).map((repo) => repo.id);
  const repositories = [];
  for (const repo of selected) {
    repositories.push(await inspectRepository(repo, context));
  }
  const blockReasons = repositories
    .filter((repo) => repo.blocked)
    .map((repo) => ({
      repositoryId: repo.id,
      kind: repo.blockReason,
      message: repo.blockMessage,
    }));
  return {
    blocked: blockReasons.length > 0,
    blockReasons,
    repositories,
    excludedRepositoryIds,
  };
}
