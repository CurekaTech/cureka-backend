export const SITEMAP_AUDIT_TYPES = [
  'categories',
  'brands',
  'health-concerns',
  'wellness-goals',
  'collections',
  'products',
  'blogs',
  'static',
] as const;

export type SitemapAuditType = (typeof SITEMAP_AUDIT_TYPES)[number];

export const isSitemapAuditType = (value: string): value is SitemapAuditType =>
  (SITEMAP_AUDIT_TYPES as readonly string[]).includes(value);

export type AuditOutputFormat = 'xlsx' | 'csv' | 'both';

export type AuditIssueType =
  | 'missing_ref_id'
  | 'missing_slug'
  | 'duplicate_ref_id'
  | 'duplicate_slug'
  | 'duplicate_url'
  | 'invalid_url'
  | 'soft_deleted'
  | 'inactive'
  | 'not_eligible';

export interface AuditFilters {
  status?: string;
  eligibleOnly?: boolean;
  ineligibleOnly?: boolean;
  search?: string;
  refId?: string;
}

export interface AuditColumn {
  key: string;
  header: string;
}

export interface AuditRecord {
  /** Display fields used by common report columns; extras allowed. */
  name?: string | null;
  refId?: string | null;
  slug?: string | null;
  url?: string | null;
  locPath?: string | null;
  status?: string | null;
  deletedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  sitemapEligible: boolean;
  exclusionReason?: string | null;
  [key: string]: unknown;
}

export interface AuditIssue {
  issueType: AuditIssueType;
  refId?: string | null;
  name?: string | null;
  slug?: string | null;
  url?: string | null;
  reason: string;
}

export interface AuditSummaryStats {
  sitemapType: SitemapAuditType;
  totalDbRecords: number;
  nonDeletedRecords: number;
  eligibleRecords: number;
  excludedRecords: number;
  generatedUrls: number;
  missingRefId: number;
  missingSlug: number;
  duplicateRefId: number;
  duplicateSlug: number;
  duplicateUrl: number;
  invalidUrl: number;
  softDeleted: number;
  inactive: number;
  notEligible: number;
  reportGeneratedAt: string;
  baseUrl: string;
}

export interface AuditReportPayload {
  type: SitemapAuditType;
  columns: AuditColumn[];
  records: AuditRecord[];
  issues: AuditIssue[];
  summary: AuditSummaryStats;
}

export interface UrlCheckResult {
  found: boolean;
  sitemapType?: SitemapAuditType;
  refId?: string | null;
  name?: string | null;
  slug?: string | null;
  status?: string | null;
  deletedAt?: Date | string | null;
  sitemapEligible?: boolean;
  exclusionReason?: string | null;
  url?: string;
  locPath?: string | null;
}

export interface CompareResult {
  type: SitemapAuditType;
  matching: string[];
  missingFromSitemap: string[];
  extraInSitemap: string[];
  duplicateInSitemap: string[];
  eligibleCount: number;
  liveCount: number;
}

export interface SitemapAuditProvider {
  readonly type: SitemapAuditType;
  columns(): AuditColumn[];
  fetchAll(filters: AuditFilters): Promise<AuditRecord[]>;
  matchPath(pathname: string, baseUrl: string): Promise<UrlCheckResult | null>;
}

export const COMMON_AUDIT_COLUMNS: AuditColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'refId', header: 'Ref ID' },
  { key: 'slug', header: 'Slug' },
  { key: 'url', header: 'URL' },
  { key: 'status', header: 'Status' },
  { key: 'deletedAt', header: 'Deleted At' },
  { key: 'updatedAt', header: 'Updated At' },
  { key: 'sitemapEligible', header: 'Sitemap Eligible' },
  { key: 'exclusionReason', header: 'Exclusion Reason' },
];
