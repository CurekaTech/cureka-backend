import { fingerprintChange } from './classify.mjs';

function byId(items) {
  const map = new Map();
  for (const item of items || []) {
    if (item && item.id) map.set(item.id, item);
  }
  return map;
}

function filled(value) {
  return value != null && String(value).trim() !== '';
}

function mergeQa(previousItems, nextItems) {
  const previous = byId(previousItems);
  const seen = new Set();
  const merged = (nextItems || []).map((item) => {
    seen.add(item.id);
    const prior = previous.get(item.id);
    if (!prior) return item;
    return {
      ...item,
      result: filled(prior.result) ? prior.result : item.result || '',
      evidence: filled(prior.evidence) ? prior.evidence : item.evidence || '',
      owner: filled(prior.owner) ? prior.owner : item.owner || '',
      timestamp: filled(prior.timestamp) ? prior.timestamp : item.timestamp || '',
      signOff: filled(prior.signOff) ? prior.signOff : item.signOff || '',
    };
  });
  for (const [id, prior] of previous) {
    if (seen.has(id)) continue;
    merged.push({
      ...prior,
      stale: true,
      steps: `${prior.steps || prior.area || id}\nRetained from the previous version because it no longer matches the generated checklist.`,
    });
  }
  return merged;
}

function mergeById(previousItems, nextItems) {
  const previous = byId(previousItems);
  const seen = new Set();
  const merged = [];
  for (const item of nextItems || []) {
    if (item && item.id && previous.has(item.id)) {
      seen.add(item.id);
      merged.push({ ...item, ...previous.get(item.id) });
      continue;
    }
    merged.push(item);
  }
  for (const [id, prior] of previous) {
    if (!seen.has(id)) merged.push(prior);
  }
  return merged;
}

function mergeApprovers(previousItems, nextItems) {
  const priorList = previousItems || [];
  return (nextItems || []).map((approver) => {
    const prior = priorList.find((candidate) => candidate.role === approver.role && (candidate.email || '') === (approver.email || ''));
    if (!prior) return approver;
    return {
      ...approver,
      name: filled(prior.name) && prior.name !== 'TBD' ? prior.name : approver.name,
      status: filled(prior.status) ? prior.status : approver.status,
      signedAt: filled(prior.signedAt) ? prior.signedAt : approver.signedAt || '',
      notes: filled(prior.notes) ? prior.notes : approver.notes || '',
    };
  });
}

function mergeSummary(previous, next) {
  if (!previous) return next || null;
  if (!next) return previous;
  const edited = new Set([...(previous.manuallyEditedFields || []), ...(next.manuallyEditedFields || [])]);
  const merged = { ...next, manuallyEditedFields: [...edited] };
  for (const field of edited) {
    if (filled(previous[field])) merged[field] = previous[field];
  }
  return merged;
}

function changeIndex(manifest) {
  const map = new Map();
  const add = (change) => {
    if (!change || !change.id) return;
    map.set(change.id, { ...change, contentHash: change.contentHash || fingerprintChange(change) });
  };
  for (const repo of manifest.repositories || []) {
    for (const change of repo.changes || []) add(change);
  }
  for (const change of manifest.changes || []) add(change);
  for (const change of manifest.approvedChanges || []) add(change);
  return map;
}

export function approvalDrift(previous, next) {
  const prior = changeIndex(previous);
  const current = changeIndex(next);
  const approvedIds = new Set(previous.approvedChangeIds || []);
  for (const change of prior.values()) {
    if (change.approvalStatus === 'approved') approvedIds.add(change.id);
  }
  const drift = [];
  for (const id of approvedIds) {
    const before = prior.get(id);
    const after = current.get(id);
    if (!after) {
      drift.push({
        changeId: id,
        kind: 'disappeared',
        previousHash: before ? before.contentHash : null,
        nextHash: null,
      });
      continue;
    }
    const previousHash = before ? before.contentHash : null;
    const nextHash = after.contentHash;
    if (previousHash && nextHash && previousHash !== nextHash) {
      drift.push({ changeId: id, kind: 'changed', previousHash, nextHash });
    }
  }
  return drift;
}

export function mergeRefresh(previous, next) {
  const merged = {
    ...next,
    knownIssues: mergeById(previous.knownIssues, next.knownIssues),
    constraints: [...new Set([...(previous.constraints || []), ...(next.constraints || [])])],
    stakeholderDecisions: mergeById(previous.stakeholderDecisions, next.stakeholderDecisions),
    approvers: mergeApprovers(previous.approvers, next.approvers),
    qaChecklist: mergeQa(previous.qaChecklist, next.qaChecklist),
    businessSummary: mergeSummary(previous.businessSummary, next.businessSummary),
    approvedChangeIds: [...new Set([...(previous.approvedChangeIds || []), ...(next.approvedChangeIds || [])])],
  };
  merged.approvalDrift = approvalDrift(previous, merged);
  merged.refresh = {
    preservedHumanFields: true,
    fromVersion: previous.generation?.version ?? null,
    policy: 'Recalculate Git ranges from the explicit baseline. Keep QA results, approvals, known issues, stakeholder decisions, and manually edited business-summary fields. Flag approved changes that changed or disappeared. Write a new version directory and leave the previous files in place.',
  };
  return merged;
}
