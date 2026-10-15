import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildReleaseNote, REPO_ROOT, TEMPLATE_PATH } from './lib/build.mjs';
import { ReleaseNoteError } from './lib/errors.mjs';
import { resolveReleaseOutputDir } from './lib/paths.mjs';
import { extractEnvNames, findSecrets } from './lib/secrets.mjs';
import { validateManifest } from './lib/validate.mjs';
import { renderBusinessEmail } from './lib/email.mjs';
import { assertAllowedGitInvocation, collectSelectedRepositories, READ_ONLY_GIT_COMMANDS } from './lib/git.mjs';
import { assessRisk } from './lib/classify.mjs';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const here = path.dirname(fileURLToPath(import.meta.url));
const examplePath = path.join(here, 'release-note.example.json');
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const D = 'd'.repeat(40);
const E = 'e'.repeat(40);
const F = 'f'.repeat(40);

function loadExample() {
  return JSON.parse(fs.readFileSync(examplePath, 'utf8'));
}

function people(releaseId) {
  return {
    schemaVersion: 1,
    releaseId,
    releaseName: 'Test release',
    plannedDeploymentAt: '2026-10-20T18:30:00+05:30',
    targetEnvironment: 'production',
    devLead: { name: 'TBD', email: 'dev.budtech@gmail.com' },
    qaOwner: { name: 'TBD', email: 'TBD' },
    approvers: [{ role: 'Dev lead', name: 'TBD', email: 'dev.budtech@gmail.com', status: 'pending' }],
    repositories: [],
  };
}

function repo(id, checkout, baseline, target, baselineSha, targetSha) {
  return {
    id,
    selected: true,
    localCheckoutPath: checkout,
    sourceBranch: `feature/${id}`,
    productionBranch: 'TBD',
    baseline,
    target,
    baselineSha,
    targetSha,
  };
}

function removeRelease(releaseId) {
  fs.rmSync(path.join(REPO_ROOT, 'reports', 'releases', releaseId), { recursive: true, force: true });
}

function docXml(filePath) {
  const zip = new AdmZip(filePath);
  return {
    document: zip.readAsText('word/document.xml'),
    footer: zip.getEntries().filter((entry) => entry.entryName.startsWith('word/footer')).map((entry) => entry.getData().toString('utf8')).join('\n'),
  };
}

function fakeGit(definitions) {
  const calls = [];
  const runGit = async (cwd, args) => {
    calls.push({ cwd, args: args.slice() });
    assertAllowedGitInvocation(args, { allowFetch: false });
    const repoDef = definitions[cwd];
    if (!repoDef) throw Object.assign(new Error('not a git repository'), { code: 'ENOENT' });
    const [command, ...rest] = args;
    if (command === 'rev-parse' && rest.includes('--is-inside-work-tree')) return 'true\n';
    if (command === 'rev-parse' && rest.includes('--verify')) {
      const ref = rest[rest.length - 1].replace(/\^\{commit\}$/, '');
      if (repoDef.ambiguous?.has(ref)) throw new Error(`fatal: short SHA1 ${ref} is ambiguous`);
      if (!repoDef.refs[ref]) throw new Error(`fatal: Needed a single revision`);
      return `${repoDef.refs[ref]}\n`;
    }
    if (command === 'merge-base') return `${repoDef.mergeBase}\n`;
    if (command === 'log') return repoDef.log;
    if (command === 'status') return repoDef.status || '';
    if (command === 'diff') return repoDef.diff || '';
    if (command === 'show' || command === 'tag') return '';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  return { calls, runGit };
}

function commitLog(sha, subject, files) {
  const body = files.map((file) => `${file.status}\t${file.path}`).join('\n');
  return `COMMIT\x1f${sha}\x1f${subject}\n${body}\n`;
}

describe('release-note builder', () => {
  afterAll(() => {
    for (const entry of fs.existsSync(path.join(REPO_ROOT, 'reports', 'releases'))
      ? fs.readdirSync(path.join(REPO_ROOT, 'reports', 'releases'))
      : []) {
      if (entry.startsWith('jest-')) removeRelease(entry);
    }
  });

  it('builds a valid Word document from the example manifest', async () => {
    removeRelease('example-backend-only');
    const result = await buildReleaseNote(loadExample(), { repoRoot: REPO_ROOT, now: '2026-10-12T09:30:00.000Z' });
    expect(fs.existsSync(result.files.docx)).toBe(true);
    expect(result.files.docx.endsWith(`${path.join('example-backend-only', 'v1', 'release-note.docx')}`)).toBe(true);
    const xml = docXml(result.files.docx);
    for (const heading of [
      'Release overview',
      'Business summary',
      'Repository and commit manifest',
      'Change log',
      'Risk assessment',
      'Prerequisites',
      'Deployment sequence',
      'Database and configuration changes',
      'Rollback plan',
      'QA checklist',
      'Known issues',
      'Approvals and sign-off',
    ]) {
      expect(xml.document).toContain(heading);
    }
    expect(xml.footer).toContain('PAGE');
    expect(result.manifest.risk.level).toBe('MEDIUM');
    expect(result.manifest.generation.deploymentExecuted).toBe(false);
    expect(result.manifest.generation.emailSent).toBe(false);
    expect(result.manifest.generation.gitWriteOperations).toBe(0);
    removeRelease('example-backend-only');
  });

  it('writes a business summary from the email template', async () => {
    const input = loadExample();
    input.releaseId = 'jest-email';
    removeRelease(input.releaseId);
    const result = await buildReleaseNote(input, { repoRoot: REPO_ROOT, now: '2026-10-12T09:30:00.000Z' });
    const written = fs.readFileSync(result.files.businessSummary, 'utf8');
    expect(written).toBe(renderBusinessEmail(template, input.businessSummary));
    expect(written).toContain('Subject: Example release for review: optional catalog detail');
    expect(written).not.toContain('{{');
    expect(written).toContain('It has not been sent.');
    removeRelease(input.releaseId);
  });

  it('still writes a Word document when the business summary is omitted', async () => {
    const input = loadExample();
    input.releaseId = 'jest-no-email';
    delete input.businessSummary;
    removeRelease(input.releaseId);
    const result = await buildReleaseNote(input, { repoRoot: REPO_ROOT, now: '2026-10-12T09:30:00.000Z' });
    expect(fs.existsSync(result.files.docx)).toBe(true);
    expect(result.files.businessSummary).toBeNull();
    expect(fs.existsSync(path.join(result.files.directory, 'business-summary.txt'))).toBe(false);
    expect(docXml(result.files.docx).document).toContain('No business summary was provided');
    removeRelease(input.releaseId);
  });

  it('fails clearly on an unknown email placeholder', () => {
    expect(() => renderBusinessEmail('Hello {{notARealField}}', loadExample().businessSummary))
      .toThrow(/Unknown email template placeholder: notARealField/);
    try {
      renderBusinessEmail('Hello {{notARealField}}', loadExample().businessSummary);
    } catch (error) {
      expect(error).toBeInstanceOf(ReleaseNoteError);
      expect(error.code).toBe('UNKNOWN_PLACEHOLDER');
    }
  });

  it('fails with the missing field names', () => {
    expect(() => validateManifest({})).toThrow(/releaseId is required/);
    expect(() => validateManifest({})).toThrow(/releaseName is required/);
    expect(() => validateManifest({})).toThrow(/plannedDeploymentAt is required/);
    expect(() => validateManifest({})).toThrow(/repositories must include/);
    try {
      validateManifest({});
    } catch (error) {
      expect(error.code).toBe('VALIDATION');
    }
  });

  it('keeps a backend-only release free of frontend and admin changes', async () => {
    const backend = '/repos/cureka-backend';
    const frontend = '/repos/cureka-frontend';
    const git = fakeGit({
      [backend]: {
        refs: { 'base-backend': A, 'head-backend': B },
        mergeBase: A,
        log: commitLog(B, 'Backend catalog change', [{ status: 'M', path: 'modules/product/controllers/product.controller.ts' }]),
        status: '',
      },
      [frontend]: {
        refs: { 'base-frontend': C, 'head-frontend': D },
        mergeBase: C,
        log: commitLog(D, 'FRONTEND_ONLY_COMMIT', [{ status: 'M', path: 'src/frontend-only.tsx' }]),
        status: '',
      },
    });
    const input = people('jest-backend-only');
    input.repositories = [
      repo('cureka-backend', backend, 'base-backend', 'head-backend'),
      { id: 'cureka-frontend', selected: false, localCheckoutPath: frontend },
      { id: 'cureka-admin', selected: false, localCheckoutPath: '/repos/cureka-admin' },
    ];
    removeRelease(input.releaseId);
    const result = await buildReleaseNote(input, {
      repoRoot: REPO_ROOT,
      collect: true,
      runGit: git.runGit,
      pathExists: (candidate) => candidate === backend,
      now: '2026-10-12T09:30:00.000Z',
    });
    expect(git.calls.every((call) => call.cwd === backend)).toBe(true);
    expect(result.manifest.repositories.filter((item) => item.selected).map((item) => item.id)).toEqual(['cureka-backend']);
    expect(JSON.stringify(result.manifest)).not.toContain('FRONTEND_ONLY_COMMIT');
    const checklistIds = result.manifest.qaChecklist.map((item) => item.id);
    expect(checklistIds).not.toContain('qa-frontend');
    expect(checklistIds).not.toContain('qa-admin');
    const selectedRanges = result.manifest.generation.comparisonRanges;
    expect(selectedRanges).toEqual([{ repositoryId: 'cureka-backend', range: `${A}..${B}`, baselineSha: A, targetSha: B }]);
    removeRelease(input.releaseId);
  });

  it('records a separate commit range for each selected repository', async () => {
    const paths = {
      'cureka-backend': '/repos/backend',
      'cureka-frontend': '/repos/frontend',
      'cureka-admin': '/repos/admin',
    };
    const specs = [
      ['cureka-backend', 'base-backend', 'head-backend', A, B, 'Backend change'],
      ['cureka-frontend', 'base-frontend', 'head-frontend', C, D, 'Website change'],
      ['cureka-admin', 'base-admin', 'head-admin', E, F, 'Admin change'],
    ];
    const definitions = {};
    for (const [id, baseline, target, baselineSha, targetSha, subject] of specs) {
      definitions[paths[id]] = {
        refs: { [baseline]: baselineSha, [target]: targetSha },
        mergeBase: baselineSha,
        log: commitLog(targetSha, subject, [{ status: 'M', path: `${id}/README.md` }]),
        status: '',
      };
    }
    const git = fakeGit(definitions);
    const input = people('jest-multi');
    input.repositories = specs.map(([id, baseline, target]) => repo(id, paths[id], baseline, target));
    removeRelease(input.releaseId);
    const result = await buildReleaseNote(input, {
      repoRoot: REPO_ROOT,
      collect: true,
      runGit: git.runGit,
      pathExists: () => true,
      now: '2026-10-12T09:30:00.000Z',
    });
    expect(result.manifest.generation.comparisonRanges).toEqual([
      { repositoryId: 'cureka-backend', range: `${A}..${B}`, baselineSha: A, targetSha: B },
      { repositoryId: 'cureka-frontend', range: `${C}..${D}`, baselineSha: C, targetSha: D },
      { repositoryId: 'cureka-admin', range: `${E}..${F}`, baselineSha: E, targetSha: F },
    ]);
    expect(new Set(git.calls.map((call) => call.cwd)).size).toBe(3);
    removeRelease(input.releaseId);
  });

  it('reports an inaccessible repository without inventing changes', async () => {
    const input = people('jest-missing-repo');
    input.repositories = [repo('cureka-frontend', '/repos/missing-frontend', 'base-frontend', 'head-frontend')];
    const git = fakeGit({});
    await expect(buildReleaseNote(input, {
      repoRoot: REPO_ROOT,
      collect: true,
      runGit: git.runGit,
      pathExists: () => false,
    })).rejects.toMatchObject({ code: 'REPO_INACCESSIBLE' });
    try {
      await buildReleaseNote(input, {
        repoRoot: REPO_ROOT,
        collect: true,
        runGit: git.runGit,
        pathExists: () => false,
      });
    } catch (error) {
      expect(error.details.report.repositories[0].changes).toEqual([]);
      expect(error.details.report.repositories[0].commits).toEqual([]);
      expect(error.details.report.complete).toBe(false);
      expect(JSON.stringify(error.details.report)).not.toContain('invented');
    }
    expect(git.calls).toEqual([]);
    expect(fs.existsSync(path.join(REPO_ROOT, 'reports', 'releases', input.releaseId))).toBe(false);
  });

  it('blocks release generation when the comparison baseline is missing or ambiguous', async () => {
    const checkout = '/repos/cureka-backend';
    const git = fakeGit({
      [checkout]: {
        refs: { 'head-backend': B },
        ambiguous: new Set(['abc1234']),
        mergeBase: A,
        log: commitLog(B, 'SHOULD_NOT_APPEAR', [{ status: 'M', path: 'modules/product/controllers/product.controller.ts' }]),
        status: '',
      },
    });
    const missing = people('jest-baseline-missing');
    missing.repositories = [repo('cureka-backend', checkout, 'auto', 'head-backend')];
    await expect(buildReleaseNote(missing, {
      repoRoot: REPO_ROOT,
      collect: true,
      runGit: git.runGit,
      pathExists: () => true,
    })).rejects.toMatchObject({ code: 'BASELINE_BLOCKED' });

    const ambiguous = people('jest-baseline-ambiguous');
    ambiguous.repositories = [repo('cureka-backend', checkout, 'abc1234', 'head-backend')];
    try {
      await buildReleaseNote(ambiguous, {
        repoRoot: REPO_ROOT,
        collect: true,
        runGit: git.runGit,
        pathExists: () => true,
      });
      throw new Error('expected baseline block');
    } catch (error) {
      expect(error.code).toBe('BASELINE_BLOCKED');
      expect(error.details.report.repositories[0].changes).toEqual([]);
      expect(error.details.report.repositories[0].commits).toEqual([]);
      expect(JSON.stringify(error.details.report)).not.toContain('SHOULD_NOT_APPEAR');
    }
    expect(fs.existsSync(path.join(REPO_ROOT, 'reports', 'releases', 'jest-baseline-ambiguous'))).toBe(false);
  });

  it('records migration file names and environment-variable names without values', async () => {
    const checkout = '/repos/cureka-backend';
    const secretValue = 'supersecretvalue';
    const git = fakeGit({
      [checkout]: {
        refs: { 'base-backend': A, 'head-backend': B },
        mergeBase: A,
        log: commitLog(B, 'Add catalog field', [
          { status: 'A', path: 'apps/api/database/migrations/1785999999999-ExampleNullableCatalogField.ts' },
          { status: 'M', path: '.env.example' },
        ]),
        status: ' M .env\n',
        diff: [
          '+EXAMPLE_PUBLIC_FLAG=true',
          `+SUPER_SECRET=${secretValue}`,
          'DROP TABLE products',
        ].join('\n'),
      },
    });
    const input = people('jest-migrate');
    input.repositories = [
      repo('cureka-backend', checkout, 'base-backend', 'head-backend'),
      { id: 'cureka-frontend', selected: false },
      { id: 'cureka-admin', selected: false },
    ];
    removeRelease(input.releaseId);
    const result = await buildReleaseNote(input, {
      repoRoot: REPO_ROOT,
      collect: true,
      runGit: git.runGit,
      pathExists: () => true,
      now: '2026-10-12T09:30:00.000Z',
    });
    const backend = result.manifest.repositories.find((item) => item.id === 'cureka-backend');
    expect(backend.migrations).toEqual(['1785999999999-ExampleNullableCatalogField.ts']);
    expect(backend.environmentVariableNames).toEqual(['EXAMPLE_PUBLIC_FLAG', 'SUPER_SECRET']);
    expect(backend.uncommittedChanges).toEqual([' M .env']);
    expect(backend.commits.map((commit) => commit.sha)).toEqual([B]);
    expect(result.manifest.deployment.environmentVariables).toEqual([
      { name: 'EXAMPLE_PUBLIC_FLAG', value: null },
      { name: 'SUPER_SECRET', value: null },
    ]);
    const written = fs.readFileSync(result.files.manifest, 'utf8') + fs.readFileSync(result.files.docx);
    expect(written).not.toContain(secretValue);
    expect(written).not.toContain('DROP TABLE products');
    expect(backend.destructiveSignals).toEqual(['DROP TABLE']);
    expect(extractEnvNames(`+SUPER_SECRET=${secretValue}\n`)).toEqual(['SUPER_SECRET']);
    removeRelease(input.releaseId);
  });

  it('preserves human-entered fields and does not overwrite the previous version', async () => {
    const first = loadExample();
    first.releaseId = 'jest-refresh';
    first.qaChecklist = [{
      id: 'qa-api-health',
      area: 'API health',
      steps: 'Call the health route.',
      result: 'Passed on staging',
      evidence: 'note-1',
      owner: 'QA Owner',
      timestamp: '2026-10-12T10:00:00Z',
      signOff: 'QA Owner',
    }];
    first.knownIssues = [{ id: 'issue-1', description: 'Human entered packaging note' }];
    first.stakeholderDecisions = [{
      id: 'decision-window',
      question: 'Confirm the customer-facing release window.',
      decision: 'Ship after the store closes',
      replyBy: '2026-10-18',
      owner: 'Commercial',
    }];
    first.approvers[0].status = 'approved';
    first.approvers[0].signedAt = '2026-10-12T11:00:00Z';
    first.approvers[0].notes = 'Approved the example scope';
    first.businessSummary.customerImpact = 'Manually confirmed customer impact';
    first.businessSummary.manuallyEditedFields = ['customerImpact'];
    first.repositories[0].changes[0].approvalStatus = 'approved';
    first.approvedChangeIds = ['cureka-backend:example-catalog', 'approved-change-removed'];
    removeRelease(first.releaseId);
    const created = await buildReleaseNote(first, { repoRoot: REPO_ROOT, now: '2026-10-12T09:30:00.000Z' });
    const originalDocx = fs.readFileSync(created.files.docx);
    const originalManifest = fs.readFileSync(created.files.manifest);

    const next = loadExample();
    next.releaseId = 'jest-refresh';
    next.businessSummary.introduction = 'Updated introduction after another commit was added.';
    next.businessSummary.customerImpact = 'This generated sentence should not replace the edit.';
    next.businessSummary.manuallyEditedFields = ['customerImpact'];
    next.repositories[0].baselineSha = A;
    next.repositories[0].targetSha = C;
    next.repositories[0].baseline = A;
    next.repositories[0].target = C;
    next.repositories[0].changes[0].summary = 'Example catalog response changed after approval';
    next.repositories[0].commits[0].sha = C;
    next.repositories[0].changes[0].sha = C;
    delete next.qaChecklist;
    delete next.knownIssues;
    delete next.stakeholderDecisions;

    const refreshed = await buildReleaseNote(next, {
      repoRoot: REPO_ROOT,
      refresh: true,
      previousManifest: created.manifest,
      now: '2026-10-12T12:00:00.000Z',
    });
    expect(fs.readFileSync(created.files.docx).equals(originalDocx)).toBe(true);
    expect(fs.readFileSync(created.files.manifest).equals(originalManifest)).toBe(true);
    expect(refreshed.files.directory.endsWith(`${path.sep}v2`)).toBe(true);
    const health = refreshed.manifest.qaChecklist.find((item) => item.id === 'qa-api-health');
    expect(health.result).toBe('Passed on staging');
    expect(health.evidence).toBe('note-1');
    expect(health.owner).toBe('QA Owner');
    expect(health.timestamp).toBe('2026-10-12T10:00:00Z');
    expect(health.signOff).toBe('QA Owner');
    expect(refreshed.manifest.knownIssues[0].description).toBe('Human entered packaging note');
    expect(refreshed.manifest.stakeholderDecisions[0].decision).toBe('Ship after the store closes');
    expect(refreshed.manifest.approvers[0].status).toBe('approved');
    expect(refreshed.manifest.approvers[0].notes).toBe('Approved the example scope');
    expect(refreshed.manifest.businessSummary.customerImpact).toBe('Manually confirmed customer impact');
    expect(refreshed.manifest.businessSummary.introduction).toBe('Updated introduction after another commit was added.');
    expect(refreshed.manifest.repositories[0].range).toBe(`${A}..${C}`);
    expect(refreshed.manifest.approvalDrift).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeId: 'cureka-backend:example-catalog', kind: 'changed' }),
      expect.objectContaining({ changeId: 'approved-change-removed', kind: 'disappeared' }),
    ]));
    expect(fs.readFileSync(refreshed.files.businessSummary, 'utf8')).toContain('Manually confirmed customer impact');
    removeRelease(first.releaseId);
  });

  it('refuses output paths outside reports/releases', () => {
    expect(() => resolveReleaseOutputDir(REPO_ROOT, '../outside')).toThrow(ReleaseNoteError);
    expect(() => resolveReleaseOutputDir(REPO_ROOT, '..')).toThrow(/safe directory name|escape/);
    expect(() => resolveReleaseOutputDir(REPO_ROOT, '/tmp/release')).toThrow(ReleaseNoteError);
    expect(() => resolveReleaseOutputDir(REPO_ROOT, 'nested/release')).toThrow(ReleaseNoteError);
    const safe = resolveReleaseOutputDir(REPO_ROOT, 'jest-safe-name');
    expect(safe).toBe(path.resolve(REPO_ROOT, 'reports', 'releases', 'jest-safe-name'));
    expect(path.relative(path.resolve(REPO_ROOT, 'reports', 'releases'), safe).startsWith('..')).toBe(false);
  });

  it('does not perform production operations or git writes', async () => {
    for (const command of ['reset', 'checkout', 'switch', 'clean', 'commit', 'push', 'merge', 'rebase']) {
      expect(() => assertAllowedGitInvocation([command, '--hard'])).toThrow(/read-only|Refusing/);
    }
    expect(() => assertAllowedGitInvocation(['tag', 'v1'])).toThrow(/git tag --list/);
    expect(() => assertAllowedGitInvocation(['fetch', 'origin'])).toThrow(/explicit permission/);
    expect(READ_ONLY_GIT_COMMANDS).toEqual(['status', 'fetch', 'log', 'diff', 'show', 'rev-parse', 'tag', 'merge-base']);

    const libDir = path.join(here, 'lib');
    for (const fileName of fs.readdirSync(libDir)) {
      const source = fs.readFileSync(path.join(libDir, fileName), 'utf8');
      if (fileName === 'git.mjs') {
        expect(source).toContain("execFileAsync('git'");
        expect(source).not.toContain('deploy-beta');
        expect(source).not.toContain('migration:run');
        continue;
      }
      expect(source).not.toMatch(/child_process|execFile|spawn\(/);
    }
    const calls = [];
    const input = people('jest-no-git');
    input.repositories = [{
      ...repo('cureka-backend', '/repos/cureka-backend', A, B, A, B),
      baselineResolution: 'explicit',
      commits: [],
      changes: [],
    }];
    removeRelease(input.releaseId);
    await buildReleaseNote(input, {
      repoRoot: REPO_ROOT,
      runGit: async () => {
        calls.push('git');
        throw new Error('git should not be called in manifest mode');
      },
      now: '2026-10-12T09:30:00.000Z',
    });
    expect(calls).toEqual([]);
    removeRelease(input.releaseId);
  });

  it('rejects credential values before writing a release', async () => {
    const input = loadExample();
    input.releaseId = 'jest-secret';
    input.knownIssues = [{ id: 'leak', description: 'password=supersecretvalue' }];
    removeRelease(input.releaseId);
    await expect(buildReleaseNote(input, { repoRoot: REPO_ROOT })).rejects.toMatchObject({ code: 'SECRET_DETECTED' });
    expect(fs.existsSync(path.join(REPO_ROOT, 'reports', 'releases', input.releaseId, 'v1', 'release-note.docx'))).toBe(false);
    expect(findSecrets('postgres://app:supersecretvalue@db.internal/cureka').length).toBeGreaterThan(0);
    const clean = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    expect(findSecrets(clean)).toEqual([]);
  });

  it('does not treat tests as a reason to lower risk', () => {
    const payment = assessRisk({
      changes: [{
        id: 'pay',
        summary: 'Adjust checkout totals',
        categories: ['bugfix-maintenance'],
        hasTests: true,
        files: [{ status: 'M', path: 'modules/checkout/checkout.service.ts' }],
      }],
    });
    expect(payment.level).toBe('HIGH');
    const isolated = assessRisk({
      changes: [{
        id: 'copy',
        summary: 'Clarify an operator note',
        categories: ['bugfix-maintenance'],
        files: [{ status: 'M', path: 'docs/operator-note.md' }],
      }],
    });
    expect(isolated.level).toBe('LOW');
  });

  it('inspects only selected repositories during collection', async () => {
    const collected = await collectSelectedRepositories({
      repositories: [
        { id: 'cureka-backend', selected: false, localCheckoutPath: '/repos/backend' },
        { id: 'cureka-frontend', selected: false },
      ],
    }, {
      runGit: async () => {
        throw new Error('unselected repository was inspected');
      },
      pathExists: () => true,
    });
    expect(collected.blocked).toBe(false);
    expect(collected.repositories).toEqual([]);
    expect(collected.excludedRepositoryIds).toEqual(['cureka-backend', 'cureka-frontend']);
  });
});
