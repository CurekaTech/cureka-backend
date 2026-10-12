import { ReleaseNoteError } from './errors.mjs';
import { fingerprintChange } from './classify.mjs';

const FULL_SHA = /^[0-9a-f]{40}$/;
const AMBIGUOUS_REFS = new Set(['', 'TBD', 'auto', 'HEAD', 'ambiguous']);

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function missing(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function selectedRepositories(manifest) {
  return (manifest.repositories || []).filter((repo) => repo.selected === true);
}

export function flattenChanges(manifest) {
  const top = asArray(manifest.changes);
  const nested = selectedRepositories(manifest).flatMap((repo) => asArray(repo.changes));
  return [...nested, ...top];
}

function validateRepository(repo, index, mode, structural, baseline, inaccessible) {
  const label = `repositories[${index}]`;
  if (!isObject(repo) || missing(repo.id)) {
    structural.push(`${label}.id is required.`);
    return;
  }
  if (typeof repo.selected !== 'boolean') {
    structural.push(`${label} (${repo.id}) must set selected to true or false. Repositories are never included automatically.`);
    return;
  }
  if (!repo.selected) {
    const leaked = ['commits', 'changes', 'range', 'baselineSha', 'targetSha'].filter((key) => {
      const value = repo[key];
      return Array.isArray(value) ? value.length > 0 : value != null && value !== '';
    });
    if (leaked.length > 0) {
      structural.push(
        `${repo.id} is not selected but includes ${leaked.join(', ')}. Remove those fields or select the repository explicitly.`,
      );
    }
    return;
  }

  for (const field of ['sourceBranch', 'productionBranch']) {
    if (missing(repo[field])) structural.push(`${repo.id}.${field} is required. Use TBD only when the owner has not confirmed it.`);
  }
  if (repo.accessible === false) {
    inaccessible.push(repo.accessError || `Repository ${repo.id} is marked inaccessible.`);
  }
  if (mode === 'collect') {
    if (missing(repo.localCheckoutPath) || repo.localCheckoutPath === 'TBD') {
      inaccessible.push(`Repository ${repo.id} has no configured local checkout path.`);
    }
    const baselineRef = repo.baseline == null ? '' : String(repo.baseline).trim();
    const targetRef = repo.target == null ? '' : String(repo.target).trim();
    if (repo.baselineResolution === 'ambiguous' || repo.baselineResolution === 'missing' || AMBIGUOUS_REFS.has(baselineRef)) {
      baseline.push(`Comparison baseline for ${repo.id} is missing or ambiguous. Name one previous deployed commit or tag.`);
    }
    if (AMBIGUOUS_REFS.has(targetRef)) {
      baseline.push(`Release target for ${repo.id} is missing or ambiguous. Name the exact branch or commit to release.`);
    }
    return;
  }

  if (repo.baselineResolution === 'ambiguous' || repo.baselineResolution === 'missing') {
    baseline.push(`Comparison baseline for ${repo.id} is ${repo.baselineResolution}. The release is blocked until one baseline is confirmed.`);
    return;
  }
  const baselineSha = String(repo.baselineSha || repo.baseline || '').trim().toLowerCase();
  const targetSha = String(repo.targetSha || repo.target || '').trim().toLowerCase();
  if (!FULL_SHA.test(baselineSha) || !FULL_SHA.test(targetSha)) {
    baseline.push(
      `Resolved baselineSha and targetSha are required for ${repo.id}. Refusing to present an unresolved diff as complete.`,
    );
    return;
  }
  if (repo.range != null && repo.range !== `${baselineSha}..${targetSha}`) {
    structural.push(`${repo.id}.range must equal ${baselineSha}..${targetSha}.`);
  }
}

export function validateManifest(input, options = {}) {
  const mode = options.mode === 'collect' ? 'collect' : 'manifest';
  const structural = [];
  const baseline = [];
  const inaccessible = [];

  if (!isObject(input)) {
    throw new ReleaseNoteError('VALIDATION', 'Release manifest must be a JSON object.');
  }
  if (input.schemaVersion !== 1) structural.push('schemaVersion must be 1.');
  if (missing(input.releaseId)) structural.push('releaseId is required.');
  if (missing(input.releaseName)) structural.push('releaseName is required.');
  if (missing(input.plannedDeploymentAt) || Number.isNaN(Date.parse(input.plannedDeploymentAt))) {
    structural.push('plannedDeploymentAt is required and must be an ISO date-time.');
  }
  if (missing(input.targetEnvironment)) structural.push('targetEnvironment is required.');
  if (!isObject(input.devLead) || missing(input.devLead.name)) structural.push('devLead.name is required.');
  if (!isObject(input.qaOwner) || missing(input.qaOwner.name)) structural.push('qaOwner.name is required.');
  if (!Array.isArray(input.approvers) || input.approvers.length === 0) {
    structural.push('approvers must list at least one approver. Names may be TBD.');
  } else {
    input.approvers.forEach((approver, index) => {
      if (!isObject(approver) || missing(approver.role) || missing(approver.name)) {
        structural.push(`approvers[${index}] requires role and name.`);
      }
    });
  }
  if (!Array.isArray(input.repositories) || input.repositories.length === 0) {
    structural.push('repositories must include every candidate repository with selected true or false.');
  } else if (!input.repositories.some((repo) => repo && repo.selected === true)) {
    structural.push('At least one repository must be explicitly selected.');
  } else {
    input.repositories.forEach((repo, index) => validateRepository(repo, index, mode, structural, baseline, inaccessible));
  }

  const selectedIds = new Set((input.repositories || []).filter((repo) => repo && repo.selected === true).map((repo) => repo.id));
  for (const change of asArray(input.changes)) {
    if (!change || !selectedIds.has(change.repositoryId)) {
      structural.push(`Change ${change && change.id ? change.id : '(missing id)'} belongs to a repository that was not selected.`);
    }
  }

  if (structural.length > 0) {
    throw new ReleaseNoteError('VALIDATION', `Release manifest is invalid:\n- ${structural.join('\n- ')}`);
  }
  if (inaccessible.length > 0) {
    throw new ReleaseNoteError(
      'REPO_INACCESSIBLE',
      `Selected repository is inaccessible:\n- ${inaccessible.join('\n- ')}`,
      { changes: [], repositories: (input.repositories || []).filter((repo) => repo && repo.selected && repo.accessible === false) },
    );
  }
  if (baseline.length > 0) {
    throw new ReleaseNoteError(
      'BASELINE_BLOCKED',
      `Release generation is blocked until the comparison baseline is reliable:\n- ${baseline.join('\n- ')}`,
      { changes: [], complete: false },
    );
  }

  const repositories = input.repositories.map((repo) => {
    if (!repo.selected) return { id: repo.id, selected: false, displayName: repo.displayName };
    const baselineSha = mode === 'manifest' ? String(repo.baselineSha || repo.baseline).trim().toLowerCase() : repo.baselineSha ?? null;
    const targetSha = mode === 'manifest' ? String(repo.targetSha || repo.target).trim().toLowerCase() : repo.targetSha ?? null;
    const changes = asArray(repo.changes).map((change) => ({
      ...change,
      repositoryId: change.repositoryId || repo.id,
      contentHash: change.contentHash || fingerprintChange({ ...change, repositoryId: change.repositoryId || repo.id }),
    }));
    return {
      ...repo,
      baselineSha,
      targetSha,
      range: mode === 'manifest' ? `${baselineSha}..${targetSha}` : repo.range ?? null,
      baselineResolution: repo.baselineResolution || (mode === 'manifest' ? 'explicit' : repo.baselineResolution),
      commits: asArray(repo.commits),
      changes,
      uncommittedChanges: asArray(repo.uncommittedChanges),
      migrations: asArray(repo.migrations),
      environmentVariableNames: asArray(repo.environmentVariableNames),
    };
  });

  return {
    ...input,
    knownIssues: asArray(input.knownIssues),
    constraints: asArray(input.constraints),
    stakeholderDecisions: asArray(input.stakeholderDecisions),
    dependencies: asArray(input.dependencies),
    qaChecklist: asArray(input.qaChecklist),
    excludedChanges: asArray(input.excludedChanges),
    unresolvedQuestions: asArray(input.unresolvedQuestions),
    repositories,
    changes: asArray(input.changes),
  };
}
