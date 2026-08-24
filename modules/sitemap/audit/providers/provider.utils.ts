import { AuditFilters, AuditRecord } from '../sitemap-audit.types';

export const formatIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
};

export const applyRecordFilters = (records: AuditRecord[], filters: AuditFilters): AuditRecord[] => {
  let result = records;
  if (filters.status) {
    const wanted = filters.status.trim().toLowerCase();
    result = result.filter((row) => String(row.status ?? '').toLowerCase() === wanted);
  }
  if (filters.eligibleOnly) result = result.filter((row) => row.sitemapEligible);
  if (filters.ineligibleOnly) result = result.filter((row) => !row.sitemapEligible);
  if (filters.refId) {
    const wanted = filters.refId.trim().toLowerCase();
    result = result.filter((row) => String(row.refId ?? '').toLowerCase() === wanted);
  }
  if (filters.search) {
    const needle = filters.search.trim().toLowerCase();
    result = result.filter((row) =>
      [row.name, row.slug, row.refId, row.url]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
        .includes(needle),
    );
  }
  return result;
};
