import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReleaseNoteError } from './lib/errors.mjs';
import { REPO_ROOT } from './lib/build.mjs';
import { assertAllowedGitInvocation } from './lib/git.mjs';
import {
  assertLinearRebase,
  buildNotification,
  describeEmailSettings,
  developmentReleaseId,
  emailAlreadySent,
  emailIdempotencyKey,
  parseRecipients,
  resolvePullRequestRange,
  runMergedPullRequest,
  sanitizeUntrustedText,
  selectPullRequestRange,
  shouldGenerateReleaseNote,
} from './lib/pull-request.mjs';

const BASE = 'a'.repeat(40);
const PARENT = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const FEATURE = 'd'.repeat(40);
const CHECKOUT = '/repos/cureka-backend';

function event(overrides = {}) {
  return {
    action: 'closed',
    merged: true,
    baseRef: 'development',
    number: '42',
    title: 'Add a catalog detail',
    url: 'https://github.com/Budventure-Technologies-Pvt-Ltd/Cureka-backend/pull/42',
    headRef: 'feature/catalog',
    mergeCommitSha: MERGE,
    baseSha: PARENT,
    mergedAt: '2026-10-12T12:00:00Z',
    commitCount: 1,
    ...overrides,
  };
}

function removeRelease(releaseId) {
  fs.rmSync(path.join(REPO_ROOT, 'reports', 'releases', releaseId), { recursive: true, force: true });
}

describe('development pull request release notes', () => {
  const recordDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-note-sent-'));

  afterAll(() => {
    fs.rmSync(recordDir, { recursive: true, force: true });
    removeRelease(developmentReleaseId('42', MERGE));
  });

  it('generates only for a merged pull request into development', () => {
    expect(shouldGenerateReleaseNote(event()).run).toBe(true);
    expect(shouldGenerateReleaseNote(event({ merged: false })).run).toBe(false);
    expect(shouldGenerateReleaseNote(event({ action: 'opened' })).run).toBe(false);
    expect(shouldGenerateReleaseNote(event({ baseRef: 'beta_development' })).reason).toMatch(/development/);
  });

  it('uses the merge commit parents and does not fall back to a branch tip', () => {
    expect(selectPullRequestRange({
      merged: true,
      baseRef: 'development',
      mergeCommitSha: MERGE,
      baseSha: 'e'.repeat(40),
      parents: [PARENT, FEATURE],
    })).toEqual({ baselineSha: PARENT, targetSha: MERGE, strategy: 'merge' });

    expect(selectPullRequestRange({
      merged: true,
      baseRef: 'development',
      mergeCommitSha: MERGE,
      baseSha: PARENT,
      parents: [PARENT],
    })).toEqual({ baselineSha: PARENT, targetSha: MERGE, strategy: 'squash' });

    expect(selectPullRequestRange({
      merged: true,
      baseRef: 'development',
      mergeCommitSha: MERGE,
      baseSha: BASE,
      parents: [FEATURE],
      commitCount: 2,
      rangeCommits: [
        { sha: FEATURE, parents: [BASE] },
        { sha: MERGE, parents: [FEATURE] },
      ],
    })).toEqual({ baselineSha: BASE, targetSha: MERGE, strategy: 'rebase' });
  });

  it('rejects an invalid or unrelated comparison range', () => {
    expect(() => selectPullRequestRange({
      merged: true,
      baseRef: 'development',
      mergeCommitSha: 'latest',
      parents: [PARENT],
    })).toThrow(/branch tip/);

    expect(() => selectPullRequestRange({
      merged: true,
      baseRef: 'development',
      mergeCommitSha: MERGE,
      parents: [],
    })).toThrow(/parents are unavailable/);

    expect(() => assertLinearRebase([
      { sha: FEATURE, parents: [BASE, PARENT] },
    ], BASE, FEATURE, 1)).toThrow(/straight line/);

    expect(() => selectPullRequestRange({
      merged: true,
      baseRef: 'development',
      mergeCommitSha: MERGE,
      baseSha: BASE,
      parents: [FEATURE],
      commitCount: 1,
      rangeCommits: [
        { sha: FEATURE, parents: [BASE] },
        { sha: MERGE, parents: [FEATURE] },
      ],
    })).toThrow(/Expected 1 pull-request commits/);
  });

  it('refuses a base SHA that is not an ancestor of the merge commit', async () => {
    const runGit = async (_cwd, args) => {
      assertAllowedGitInvocation(args, { allowFetch: false });
      if (String(args.at(-1)).endsWith('^@')) return `${FEATURE}\n`;
      if (args[0] === 'merge-base') throw new Error('not an ancestor');
      throw new Error(args.join(' '));
    };
    await expect(resolvePullRequestRange({
      runGit,
      checkout: CHECKOUT,
      event: event({ baseSha: BASE }),
    })).rejects.toThrow(/not an ancestor/);
  });

  it('does not build or email an unmerged pull request', async () => {
    let builds = 0;
    let sends = 0;
    const build = async () => {
      builds += 1;
    };
    const transport = { sendMail: async () => {
      sends += 1;
    } };
    const result = await runMergedPullRequest({
      event: event({ merged: false }),
      checkout: CHECKOUT,
      repoRoot: REPO_ROOT,
      build,
      transport,
      env: {},
    });
    expect(result.generated).toBe(false);
    expect(result.email.reason).toMatch(/closed without being merged/);
    expect(builds).toBe(0);
    expect(sends).toBe(0);
  });

  it('does not send when email configuration is missing', async () => {
    let sends = 0;
    const transport = { sendMail: async () => {
      sends += 1;
    } };
    const result = await runMergedPullRequest({
      event: event(),
      checkout: CHECKOUT,
      repoRoot: REPO_ROOT,
      range: { baselineSha: PARENT, targetSha: MERGE, strategy: 'squash' },
      repository: 'Budventure-Technologies-Pvt-Ltd/Cureka-backend',
      sentRecordPath: path.join(recordDir, 'missing.json'),
      env: {},
      transport,
      now: '2026-10-12T12:00:00.000Z',
      build: async () => ({
        files: {
          directory: recordDir,
          docx: path.join(recordDir, 'release-note.docx'),
          manifest: path.join(recordDir, 'manifest.json'),
          businessSummary: path.join(recordDir, 'business-summary.txt'),
        },
        manifest: { risk: { level: 'LOW' }, businessSummary: { introduction: 'Review only.' } },
        email: 'Review only.',
      }),
    });
    expect(result.generated).toBe(true);
    expect(result.email.sent).toBe(false);
    expect(result.email.missing).toEqual(expect.arrayContaining([
      'RELEASE_NOTE_EMAIL_ENABLED',
      'SMTP_HOST',
      'SMTP_PASS',
    ]));
    expect(sends).toBe(0);
  });

  it('attaches the playbook and does not send a second time for the same merge', async () => {
    const calls = [];
    const transport = { sendMail: async (payload) => calls.push(payload) };
    const docx = path.join(recordDir, 'release-note.docx');
    fs.writeFileSync(docx, 'playbook');
    const sentRecordPath = path.join(recordDir, 'sent.json');
    const readyEnv = {
      RELEASE_NOTE_EMAIL_ENABLED: 'true',
      RELEASE_NOTE_EMAIL_TO: 'reviewer@example.com',
      SMTP_FROM: 'notes@example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'notes@example.com',
      SMTP_PASS: 'supersecretvalue',
    };
    const shared = {
      event: event(),
      checkout: CHECKOUT,
      repoRoot: REPO_ROOT,
      range: { baselineSha: PARENT, targetSha: MERGE, strategy: 'squash' },
      repository: 'Budventure-Technologies-Pvt-Ltd/Cureka-backend',
      sentRecordPath,
      env: readyEnv,
      transport,
      now: '2026-10-12T12:00:00.000Z',
      build: async () => ({
        files: { directory: recordDir, docx, manifest: docx, businessSummary: docx },
        manifest: { risk: { level: 'MEDIUM' }, businessSummary: { introduction: 'Review only.' } },
        email: 'Review only.',
      }),
    };
    const first = await runMergedPullRequest(shared);
    const second = await runMergedPullRequest(shared);
    expect(first.email.sent).toBe(true);
    expect(second.email.sent).toBe(false);
    expect(second.email.reason).toBe('already-sent');
    expect(calls).toHaveLength(1);
    expect(calls[0].attachments[0].filename).toBe('release-note.docx');
    expect(calls[0].text).toContain('not production deployment approval');
    expect(calls[0].text).toContain(MERGE);
    expect(JSON.stringify(calls[0])).not.toContain('supersecretvalue');
    expect(emailAlreadySent(JSON.parse(fs.readFileSync(sentRecordPath, 'utf8')), emailIdempotencyKey({
      repository: 'Budventure-Technologies-Pvt-Ltd/Cureka-backend',
      prNumber: '42',
      mergeSha: MERGE,
    }))).toBe(true);
  });

  it('does not email when document generation fails', async () => {
    let sends = 0;
    const transport = { sendMail: async () => {
      sends += 1;
    } };
    const result = await runMergedPullRequest({
      event: event(),
      checkout: CHECKOUT,
      repoRoot: REPO_ROOT,
      range: { baselineSha: PARENT, targetSha: MERGE, strategy: 'squash' },
      repository: 'Budventure-Technologies-Pvt-Ltd/Cureka-backend',
      sentRecordPath: path.join(recordDir, 'failed.json'),
      env: {
        RELEASE_NOTE_EMAIL_ENABLED: 'true',
        RELEASE_NOTE_EMAIL_TO: 'reviewer@example.com',
        SMTP_FROM: 'notes@example.com',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'notes@example.com',
        SMTP_PASS: 'supersecretvalue',
      },
      transport,
      build: async () => {
        throw new ReleaseNoteError('BASELINE_BLOCKED', 'range unavailable');
      },
    });
    expect(result.generated).toBe(false);
    expect(result.email.reason).toBe('generation-failed');
    expect(sends).toBe(0);
    expect(fs.existsSync(path.join(recordDir, 'failed.json'))).toBe(false);
  });

  it('redacts untrusted pull request text and rejects recipient injection', () => {
    expect(sanitizeUntrustedText('password=supersecretvalue\nrm -rf')).toBe('[redacted]');
    const message = buildNotification({
      repository: 'Budventure-Technologies-Pvt-Ltd/Cureka-backend',
      pullRequest: event({ title: 'password=supersecretvalue' }),
      range: { baselineSha: PARENT, targetSha: MERGE },
      riskLevel: 'HIGH',
      summaryText: 'Review only.',
    });
    expect(message.text).not.toContain('supersecretvalue');
    expect(message.text).toContain('[redacted]');
    expect(() => parseRecipients('reviewer@example.com;touch /tmp/x')).toThrow(ReleaseNoteError);
    expect(describeEmailSettings({}).ready).toBe(false);
  });

  it('collects a development range without frontend changes or a real email', async () => {
    const calls = [];
    const runGit = async (cwd, args) => {
      calls.push(args.slice());
      assertAllowedGitInvocation(args, { allowFetch: false });
      if (cwd !== CHECKOUT) throw new Error('unexpected repository');
      const [command, ...rest] = args;
      if (command === 'rev-parse' && rest.includes('--is-inside-work-tree')) return 'true\n';
      if (command === 'rev-parse' && String(rest.at(-1)).endsWith('^@')) return `${PARENT}\n`;
      if (command === 'rev-parse' && rest.includes('--verify')) {
        const ref = String(rest.at(-1)).replace(/\^\{commit\}$/, '');
        if (ref === PARENT || ref === MERGE) return `${ref}\n`;
        throw new Error(`unknown ${ref}`);
      }
      if (command === 'merge-base') return `${PARENT}\n`;
      if (command === 'log') {
        return `COMMIT\x1f${MERGE}\x1fAdd a catalog detail\nM\tmodules/product/controllers/product.controller.ts\n`;
      }
      if (command === 'status') return '';
      if (command === 'diff') return '';
      throw new Error(`unexpected ${args.join(' ')}`);
    };
    const releaseId = developmentReleaseId('42', MERGE);
    removeRelease(releaseId);
    let sends = 0;
    const transport = { sendMail: async () => {
      sends += 1;
    } };
    const result = await runMergedPullRequest({
      event: event(),
      checkout: CHECKOUT,
      repoRoot: REPO_ROOT,
      runGit,
      pathExists: (candidate) => candidate === CHECKOUT,
      repository: 'Budventure-Technologies-Pvt-Ltd/Cureka-backend',
      sentRecordPath: path.join(recordDir, 'collect.json'),
      env: {},
      transport,
      now: '2026-10-12T12:00:00.000Z',
    });
    expect(result.generated).toBe(true);
    expect(result.email.sent).toBe(false);
    expect(result.manifest.targetEnvironment).toBe('development');
    expect(result.manifest.developmentValidation).toBe(true);
    expect(result.manifest.repositories.find((repo) => repo.id === 'cureka-backend').range).toBe(`${PARENT}..${MERGE}`);
    expect(result.manifest.repositories.filter((repo) => repo.selected).map((repo) => repo.id)).toEqual(['cureka-backend']);
    expect(result.manifest.repositories.find((repo) => repo.id === 'cureka-backend').productionBranch).toBe('TBD');
    expect(JSON.stringify(result.manifest)).not.toContain('FRONTEND_ONLY_COMMIT');
    expect(fs.existsSync(result.files.docx)).toBe(true);
    expect(fs.existsSync(result.files.businessSummary)).toBe(true);
    expect(fs.readFileSync(path.join(result.files.directory, 'email-status.txt'), 'utf8')).toMatch(/Missing configuration/);
    expect(sends).toBe(0);
    expect(calls.some((args) => args[0] === 'push' || args[0] === 'reset')).toBe(false);
    removeRelease(releaseId);
  });

  it('keeps the workflow limited to merged development pull requests', () => {
    const workflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/development-release-note.yml'), 'utf8');
    expect(workflow).toContain('pull_request_target:');
    expect(workflow).toContain('types: [closed]');
    expect(workflow).toContain('branches: [development]');
    expect(workflow).toContain('github.event.pull_request.merged == true');
    expect(workflow).toContain('github.event.pull_request.merge_commit_sha');
    expect(workflow).toContain('github.event.pull_request.base.sha');
    expect(workflow).toContain('ref: development');
    expect(workflow).not.toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(workflow).not.toContain('migration:run');
    expect(workflow).not.toContain('deploy-beta');
    expect(workflow).not.toContain('id-token:');
    expect(workflow).not.toContain('devgajjar0132@gmail.com');
    expect(workflow).not.toMatch(/run:.*github\.event\.pull_request\.title/);
  });
});
