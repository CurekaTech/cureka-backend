/** Compact name + id snapshot stored with an audit row. Not the full entity. */
export function auditSubjectFields(input: {
  name?: string | null;
  id?: string | null;
  refId?: string | null;
}): Record<string, string> {
  const name = clip(input.name);
  const id = clip(input.id);
  const refId = clip(input.refId);
  const label = [name, refId].filter(Boolean).join(' · ');
  const fields: Record<string, string> = {};
  if (name) fields.subjectName = name;
  if (id) fields.subjectId = id;
  if (refId) fields.subjectRefId = refId;
  if (label) fields.subjectLabel = label;
  return fields;
}

export function mergeAuditSubject(
  details: Record<string, unknown> | null | undefined,
  subject: { name?: string | null; id?: string | null; refId?: string | null },
): Record<string, unknown> {
  return { ...(details ?? {}), ...auditSubjectFields(subject) };
}

function clip(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}
