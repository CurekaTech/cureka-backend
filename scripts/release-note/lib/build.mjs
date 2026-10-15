import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReleaseNoteError } from './errors.mjs';
import { assertInside, resolveReleaseOutputDir } from './paths.mjs';
import { assertNoSecrets } from './secrets.mjs';
import { validateManifest, flattenChanges } from './validate.mjs';
import { collectSelectedRepositories, runGit } from './git.mjs';
import { assessRisk } from './classify.mjs';
import { mergeRefresh } from './refresh.mjs';
import { renderBusinessEmail } from './email.mjs';
import { renderReleaseDocx } from './docx.mjs';
import { buildDependencies, buildDeployment, buildQaChecklist, unresolvedQuestions } from './playbook.mjs';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_PATH = path.resolve(LIB_DIR, '..', 'business-email.template.txt');
export const REPO_ROOT = path.resolve(LIB_DIR, '..', '..', '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function applyCollection(manifest, collected) {
  const byId = new Map(collected.repositories.map((repo) => [repo.id, repo]));
  return {
    ...manifest,
    repositories: manifest.repositories.map((repo) => {
      if (!repo.selected) return { id: repo.id, selected: false, displayName: repo.displayName };
      const inspected = byId.get(repo.id);
      if (!inspected) {
        throw new ReleaseNoteError('VALIDATION', `Selected repository ${repo.id} was not inspected.`);
      }
      const { gitCommands, ...safe } = inspected;
      return {
        ...repo,
        ...safe,
        sourceBranch: repo.sourceBranch,
        productionBranch: repo.productionBranch,
      };
    }),
  };
}

function enrich(manifest) {
  const changes = flattenChanges(manifest);
  const risk = manifest.risk && manifest.risk.override === true
    ? manifest.risk
    : assessRisk({ changes });
  const deployment = buildDeployment(manifest, changes);
  return {
    ...manifest,
    risk,
    dependencies: buildDependencies(manifest, changes),
    qaChecklist: buildQaChecklist(manifest, changes),
    deployment,
    unresolvedQuestions: unresolvedQuestions({ ...manifest, deployment }),
    status: 'ready-for-review',
  };
}

function blockCode(reasons) {
  const kinds = new Set(reasons.map((reason) => reason.kind));
  if (kinds.has('inaccessible') && kinds.has('baseline')) return 'RELEASE_BLOCKED';
  if (kinds.has('inaccessible')) return 'REPO_INACCESSIBLE';
  return 'BASELINE_BLOCKED';
}

function versionsIn(releaseDir) {
  if (!fs.existsSync(releaseDir)) return [];
  return fs.readdirSync(releaseDir)
    .filter((name) => /^v\d+$/.test(name))
    .map((name) => Number(name.slice(1)))
    .sort((left, right) => left - right);
}

function loadPreviousManifest(releaseDir) {
  const pointer = path.join(releaseDir, 'LATEST.txt');
  if (!fs.existsSync(pointer)) {
    throw new ReleaseNoteError('VALIDATION', 'Refresh requires an existing release version under reports/releases/.');
  }
  const versionName = fs.readFileSync(pointer, 'utf8').trim();
  if (!/^v\d+$/.test(versionName)) {
    throw new ReleaseNoteError('PATH_ESCAPE', 'LATEST.txt does not name a version directory.');
  }
  const manifestPath = assertInside(releaseDir, path.join(releaseDir, versionName, 'manifest.json'));
  return readJson(manifestPath);
}

export async function buildReleaseNote(rawInput, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const collect = options.collect === true;
  let manifest = validateManifest(rawInput, { mode: collect ? 'collect' : 'manifest' });
  assertNoSecrets(manifest);

  if (collect) {
    const collected = await collectSelectedRepositories(manifest, {
      runGit: options.runGit || runGit,
      allowFetch: options.allowFetch === true,
      pathExists: options.pathExists || fs.existsSync,
    });
    if (collected.blocked) {
      collected.complete = false;
      throw new ReleaseNoteError(
        blockCode(collected.blockReasons),
        `Release generation is blocked. An incomplete diff was not written.\n- ${collected.blockReasons.map((reason) => `${reason.repositoryId}: ${reason.message}`).join('\n- ')}`,
        { report: collected, complete: false },
      );
    }
    manifest = validateManifest(applyCollection(manifest, collected), { mode: 'manifest' });
    assertNoSecrets(manifest);
  }

  manifest = enrich(manifest);

  const refreshing = options.refresh === true || options.previousManifest != null;
  if (refreshing) {
    const previous = options.previousManifest
      ? (typeof options.previousManifest === 'string' ? readJson(options.previousManifest) : options.previousManifest)
      : loadPreviousManifest(resolveReleaseOutputDir(repoRoot, manifest.releaseId));
    manifest = mergeRefresh(previous, manifest);
  }

  assertNoSecrets(manifest);
  if (options.write === false) {
    const template = options.template ?? (manifest.businessSummary ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : '');
    const email = manifest.businessSummary ? renderBusinessEmail(template, manifest.businessSummary) : null;
    if (email) assertNoSecrets(email);
    return { manifest, email, files: null };
  }

  const releaseDir = resolveReleaseOutputDir(repoRoot, manifest.releaseId);
  fs.mkdirSync(releaseDir, { recursive: true });
  const existing = versionsIn(releaseDir);
  if (!refreshing && existing.length > 0) {
    throw new ReleaseNoteError(
      'RELEASE_EXISTS',
      `Release ${manifest.releaseId} already has v${existing[existing.length - 1]}. Refresh it so the original files stay in place.`,
    );
  }
  if (refreshing && existing.length === 0 && options.previousManifest == null) {
    throw new ReleaseNoteError('VALIDATION', 'Refresh requires an existing release version.');
  }
  const version = existing.length === 0 ? 1 : existing[existing.length - 1] + (refreshing ? 1 : 0);
  const versionDir = assertInside(releaseDir, path.join(releaseDir, `v${version}`));
  fs.mkdirSync(versionDir, { recursive: false });

  manifest = {
    ...manifest,
    generation: {
      generator: '@release-note',
      schemaVersion: 1,
      generatedAt: options.now || new Date().toISOString(),
      readOnly: true,
      gitWriteOperations: 0,
      deploymentExecuted: false,
      emailSent: false,
      version,
      outputDir: path.posix.join('reports', 'releases', manifest.releaseId, `v${version}`),
      comparisonRanges: manifest.repositories
        .filter((repo) => repo.selected)
        .map((repo) => ({
          repositoryId: repo.id,
          range: repo.range,
          baselineSha: repo.baselineSha,
          targetSha: repo.targetSha,
        })),
    },
  };

  try {
    assertNoSecrets(manifest);
    const template = options.template ?? (manifest.businessSummary ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : '');
    const email = manifest.businessSummary ? renderBusinessEmail(template, manifest.businessSummary) : null;
    if (email) assertNoSecrets(email);
    const docx = await renderReleaseDocx(manifest);
    const manifestPath = path.join(versionDir, 'manifest.json');
    const docxPath = path.join(versionDir, 'release-note.docx');
    const emailPath = email ? path.join(versionDir, 'business-summary.txt') : null;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(docxPath, docx);
    if (emailPath) fs.writeFileSync(emailPath, email);
    fs.writeFileSync(path.join(releaseDir, 'LATEST.txt'), `v${version}\n`);
    return {
      manifest,
      email,
      files: {
        directory: versionDir,
        manifest: manifestPath,
        docx: docxPath,
        businessSummary: emailPath,
      },
    };
  } catch (error) {
    fs.rmSync(versionDir, { recursive: true, force: true });
    throw error;
  }
}
