import {
  AuditIssue,
  AuditIssueType,
  AuditRecord,
  AuditSummaryStats,
  SitemapAuditType,
} from './sitemap-audit.types';

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
};

const pushIssue = (
  issues: AuditIssue[],
  issueType: AuditIssueType,
  record: AuditRecord,
  reason: string,
): void => {
  issues.push({
    issueType,
    refId: record.refId ?? null,
    name: record.name ?? null,
    slug: record.slug ?? null,
    url: record.url ?? null,
    reason,
  });
};

export const detectAuditIssues = (
  records: AuditRecord[],
  options?: { requireSlug?: boolean; requireRefId?: boolean },
): AuditIssue[] => {
  const requireSlug = options?.requireSlug ?? true;
  const requireRefId = options?.requireRefId ?? true;
  const issues: AuditIssue[] = [];

  const refIdCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();
  const urlCounts = new Map<string, number>();

  for (const record of records) {
    const refId = asText(record.refId);
    const slug = asText(record.slug);
    const url = asText(record.url);

    if (refId) refIdCounts.set(refId, (refIdCounts.get(refId) ?? 0) + 1);
    if (slug) slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
    if (url) urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
  }

  for (const record of records) {
    const refId = asText(record.refId);
    const slug = asText(record.slug);
    const url = asText(record.url);

    if (requireRefId && !refId) {
      pushIssue(issues, 'missing_ref_id', record, 'Missing refId');
    }
    if (requireSlug && !slug) {
      pushIssue(issues, 'missing_slug', record, 'Missing slug');
    }
    if (refId && (refIdCounts.get(refId) ?? 0) > 1) {
      pushIssue(issues, 'duplicate_ref_id', record, `Duplicate refId "${refId}"`);
    }
    if (slug && (slugCounts.get(slug) ?? 0) > 1) {
      pushIssue(issues, 'duplicate_slug', record, `Duplicate slug "${slug}"`);
    }
    if (url && (urlCounts.get(url) ?? 0) > 1) {
      pushIssue(issues, 'duplicate_url', record, `Duplicate URL "${url}"`);
    }
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          pushIssue(issues, 'invalid_url', record, `Invalid URL protocol for "${url}"`);
        }
      } catch {
        pushIssue(issues, 'invalid_url', record, `Invalid absolute URL "${url}"`);
      }
    } else if (record.sitemapEligible) {
      pushIssue(issues, 'invalid_url', record, 'Eligible record has no generated URL');
    }

    if (record.deletedAt) {
      pushIssue(issues, 'soft_deleted', record, 'Record is soft-deleted');
    }

    const status = asText(record.status).toLowerCase();
    if (
      status &&
      status !== 'active' &&
      status !== 'published' &&
      !(status === 'public' /* not used */)
    ) {
      // blogs use published; masters use active/inactive
      if (status === 'inactive' || status === 'draft' || status === 'archived' || status === 'rejected' || status === 'pending_review' || status === 'scheduled') {
        pushIssue(issues, 'inactive', record, `Status is "${record.status}"`);
      }
    }

    if (!record.sitemapEligible) {
      pushIssue(
        issues,
        'not_eligible',
        record,
        asText(record.exclusionReason) || 'Not eligible for sitemap',
      );
    }
  }

  return issues;
};

export const buildSummaryStats = (input: {
  type: SitemapAuditType;
  records: AuditRecord[];
  issues: AuditIssue[];
  baseUrl: string;
}): AuditSummaryStats => {
  const { type, records, issues, baseUrl } = input;
  const countIssue = (issueType: AuditIssueType): number =>
    issues.filter((issue) => issue.issueType === issueType).length;

  const nonDeleted = records.filter((row) => !row.deletedAt);
  const eligible = records.filter((row) => row.sitemapEligible);
  const urls = new Set(
    records.map((row) => asText(row.url)).filter((url) => Boolean(url)),
  );

  return {
    sitemapType: type,
    totalDbRecords: records.length,
    nonDeletedRecords: nonDeleted.length,
    eligibleRecords: eligible.length,
    excludedRecords: records.length - eligible.length,
    generatedUrls: urls.size,
    missingRefId: countIssue('missing_ref_id'),
    missingSlug: countIssue('missing_slug'),
    duplicateRefId: countIssue('duplicate_ref_id'),
    duplicateSlug: countIssue('duplicate_slug'),
    duplicateUrl: countIssue('duplicate_url'),
    invalidUrl: countIssue('invalid_url'),
    softDeleted: countIssue('soft_deleted'),
    inactive: countIssue('inactive'),
    notEligible: countIssue('not_eligible'),
    reportGeneratedAt: new Date().toISOString(),
    baseUrl,
  };
};

export const applyAuditFilters = (
  records: AuditRecord[],
  filters: {
    status?: string;
    eligibleOnly?: boolean;
    ineligibleOnly?: boolean;
    search?: string;
    refId?: string;
  },
): AuditRecord[] => {
  let result = records;
  if (filters.status) {
    const wanted = filters.status.trim().toLowerCase();
    result = result.filter((row) => asText(row.status).toLowerCase() === wanted);
  }
  if (filters.eligibleOnly) {
    result = result.filter((row) => row.sitemapEligible);
  }
  if (filters.ineligibleOnly) {
    result = result.filter((row) => !row.sitemapEligible);
  }
  if (filters.refId) {
    const wanted = filters.refId.trim().toLowerCase();
    result = result.filter((row) => asText(row.refId).toLowerCase() === wanted);
  }
  if (filters.search) {
    const needle = filters.search.trim().toLowerCase();
    result = result.filter((row) => {
      const haystack = [row.name, row.slug, row.refId, row.url]
        .map((value) => asText(value).toLowerCase())
        .join(' ');
      return haystack.includes(needle);
    });
  }
  return result;
};
