import { BadRequestException } from '@nestjs/common';
import { IStorageFileReference } from '@packages/storage';
import { REF_ID_PATTERN } from '@packages/common';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';

export const DEFAULT_COLLECTION_LIMIT = 12;
export const MAX_COLLECTION_LIMIT = 50;

export interface PromotionalSectionConfig {
  heading?: string | null;
  desktopImage?: IStorageFileReference | null;
  mobileImage?: IStorageFileReference | null;
  thumbnail?: IStorageFileReference | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  selectionMode?: 'manual' | 'brand' | 'category';
  brandRefId?: string | null;
  categoryRefId?: string | null;
  maxItems?: number | null;
  layout?: 'carousel' | 'grid' | null;
  videoUrl?: string | null;
  blogMode?: 'selected' | 'featured' | 'trending';
}

export interface NormalizedItem {
  targetType: PromotionalTargetType;
  targetRefId: string;
  sortOrder: number;
}

export interface NormalizedSection {
  type: PromotionalSectionType;
  title: string | null;
  subtitle: string | null;
  config: PromotionalSectionConfig;
  sortOrder: number;
  isActive: boolean;
  startAt: Date | null;
  endAt: Date | null;
  items: NormalizedItem[];
}

export interface NormalizedTarget {
  targetType: PromotionalTargetType;
  targetRefId: string;
  sortOrder: number;
}

export interface SectionInput {
  type: PromotionalSectionType;
  title?: string | null;
  subtitle?: string | null;
  config?: PromotionalSectionConfig | null;
  sortOrder?: number;
  isActive?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  items?: Array<{
    targetType: PromotionalTargetType;
    targetRefId: string;
    sortOrder?: number;
  }>;
}

export interface TargetInput {
  targetType: PromotionalTargetType;
  targetRefId: string;
  sortOrder?: number;
}

export interface CatalogRefSets {
  productRefIds: string[];
  categoryRefIds: string[];
  brandRefIds: string[];
  blogRefIds: string[];
  couponRefId: string | null;
}

const HTML_TAG = /<[^>]*>/g;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const SAFE_STORAGE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/;

const PAGE_TARGET_TYPES = new Set<PromotionalTargetType>([
  PromotionalTargetType.PRODUCT,
  PromotionalTargetType.CATEGORY,
  PromotionalTargetType.BRAND,
]);

export const stripHtml = (value: string): string =>
  value
    .replace(SCRIPT_BLOCK, '')
    .replace(STYLE_BLOCK, '')
    .replace(HTML_TAG, '')
    .replace(/\s+/g, ' ')
    .trim();

export const parseOptionalDate = (value: string | null | undefined, label: string): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} is not a valid date`);
  }
  return date;
};

export const assertScheduleWindow = (
  startAt: Date | null | undefined,
  endAt: Date | null | undefined,
  label = 'Schedule',
): void => {
  if (startAt && endAt && endAt < startAt) {
    throw new BadRequestException(`${label} end must be on or after the start`);
  }
};

export const resolveEffectiveStatus = (
  page: { status: PromotionalPageStatus; startAt?: Date | null; endAt?: Date | null },
  now: Date,
): PromotionalPageStatus => {
  if (
    page.status === PromotionalPageStatus.DRAFT ||
    page.status === PromotionalPageStatus.UNPUBLISHED ||
    page.status === PromotionalPageStatus.ARCHIVED ||
    page.status === PromotionalPageStatus.EXPIRED
  ) {
    return page.status;
  }

  if (page.endAt && page.endAt <= now) {
    return PromotionalPageStatus.EXPIRED;
  }

  if (page.startAt && page.startAt > now) {
    return PromotionalPageStatus.SCHEDULED;
  }

  return PromotionalPageStatus.PUBLISHED;
};

export const assertCanPublish = (
  startAt: Date | null,
  endAt: Date | null,
  now: Date,
): PromotionalPageStatus => {
  assertScheduleWindow(startAt, endAt);
  if (endAt && endAt <= now) {
    throw new BadRequestException('Cannot publish a promotional page whose end date has passed');
  }
  if (startAt && startAt > now) {
    return PromotionalPageStatus.SCHEDULED;
  }
  return PromotionalPageStatus.PUBLISHED;
};

export const resolveRequestedStatus = (
  requested: PromotionalPageStatus | undefined,
  startAt: Date | null,
  endAt: Date | null,
  now: Date,
): PromotionalPageStatus => {
  const status = requested ?? PromotionalPageStatus.DRAFT;
  if (status === PromotionalPageStatus.EXPIRED || status === PromotionalPageStatus.ARCHIVED) {
    throw new BadRequestException(
      'Expired and archived are not set directly. Archive uses delete, and expired follows the schedule',
    );
  }
  assertScheduleWindow(startAt, endAt);
  if (status === PromotionalPageStatus.PUBLISHED) {
    return assertCanPublish(startAt, endAt, now);
  }
  if (status === PromotionalPageStatus.SCHEDULED) {
    if (!startAt || startAt <= now) {
      throw new BadRequestException('A scheduled page needs a start date in the future');
    }
    return PromotionalPageStatus.SCHEDULED;
  }
  return status;
};

/** Null when the page may be served on the public URL. */
export const publicUnavailableReason = (
  page: {
    status: PromotionalPageStatus;
    startAt?: Date | null;
    endAt?: Date | null;
    deletedAt?: Date | null;
  },
  now: Date,
): string | null => {
  if (page.deletedAt || page.status === PromotionalPageStatus.ARCHIVED) {
    return 'Promotional page is archived';
  }
  const effective = resolveEffectiveStatus(page, now);
  if (effective === PromotionalPageStatus.PUBLISHED) return null;
  if (effective === PromotionalPageStatus.EXPIRED) return 'Promotional page has expired';
  if (effective === PromotionalPageStatus.SCHEDULED) return 'Promotional page is not available yet';
  return 'Promotional page is not published';
};

export const isSectionVisible = (
  section: { isActive: boolean; startAt?: Date | null; endAt?: Date | null },
  now: Date,
): boolean => {
  if (!section.isActive) return false;
  if (section.startAt && section.startAt > now) return false;
  if (section.endAt && section.endAt <= now) return false;
  return true;
};

export const assertSafeUrl = (value: string, label: string): string => {
  const trimmed = stripHtml(value);
  if (!trimmed) {
    throw new BadRequestException(`${label} is empty`);
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    trimmed.startsWith('//')
  ) {
    throw new BadRequestException(`${label} is not a supported URL`);
  }
  if (trimmed.startsWith('/')) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException(`${label} must be a relative path or an http(s) URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException(`${label} must be a relative path or an http(s) URL`);
  }
  return trimmed;
};

const optionalText = (value: unknown, label: string, max: number): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label} must be a string`);
  }
  const cleaned = stripHtml(value);
  if (!cleaned) return null;
  if (cleaned.length > max) {
    throw new BadRequestException(`${label} must be at most ${max} characters`);
  }
  return cleaned;
};

const storageRef = (value: unknown, label: string): IStorageFileReference | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') {
    throw new BadRequestException(`${label} is invalid`);
  }
  const record = value as { key?: unknown; name?: unknown };
  const key = typeof record.key === 'string' ? stripHtml(record.key) : '';
  const name = typeof record.name === 'string' ? stripHtml(record.name) : '';
  if (!key || !name) {
    throw new BadRequestException(`${label} must include a storage key and file name`);
  }
  if (!SAFE_STORAGE_KEY.test(key) || key.includes('..') || key.length > 500 || name.length > 255) {
    throw new BadRequestException(`${label} storage reference is invalid`);
  }
  return { key, name };
};

const assertRefId = (value: string, label: string): string => {
  const refId = value.trim().toUpperCase();
  if (!REF_ID_PATTERN.test(refId)) {
    throw new BadRequestException(`${label} is not a valid reference id`);
  }
  return refId;
};

const normalizeItems = (
  items: SectionInput['items'],
  allowed: PromotionalTargetType[],
  label: string,
): NormalizedItem[] => {
  const rows = items ?? [];
  if (!allowed.length && rows.length) {
    throw new BadRequestException(`${label} does not accept catalog items`);
  }
  return rows.map((item, index) => {
    if (!allowed.includes(item.targetType)) {
      throw new BadRequestException(`${label} does not accept ${item.targetType} items`);
    }
    return {
      targetType: item.targetType,
      targetRefId: assertRefId(item.targetRefId, `${label} item`),
      sortOrder: item.sortOrder ?? index,
    };
  });
};

const normalizeConfig = (
  type: PromotionalSectionType,
  raw: PromotionalSectionConfig | null | undefined,
  label: string,
): PromotionalSectionConfig => {
  const source = raw ?? {};
  const config: PromotionalSectionConfig = {};

  if (type === PromotionalSectionType.HERO_BANNER || type === PromotionalSectionType.PRODUCT_COLLECTION) {
    config.heading = optionalText(source.heading, `${label} heading`, 255);
    config.ctaText = optionalText(source.ctaText, `${label} CTA text`, 120);
    config.ctaUrl = source.ctaUrl ? assertSafeUrl(source.ctaUrl, `${label} CTA URL`) : null;
  }

  if (type === PromotionalSectionType.HERO_BANNER) {
    config.desktopImage = storageRef(source.desktopImage, `${label} desktop image`);
    config.mobileImage = storageRef(source.mobileImage, `${label} mobile image`);
  }

  if (type === PromotionalSectionType.PRODUCT_COLLECTION) {
    const mode = source.selectionMode ?? 'manual';
    if (mode !== 'manual' && mode !== 'brand' && mode !== 'category') {
      throw new BadRequestException(`${label} selection mode is invalid`);
    }
    config.selectionMode = mode;
    config.brandRefId = source.brandRefId ? assertRefId(source.brandRefId, `${label} brand`) : null;
    config.categoryRefId = source.categoryRefId
      ? assertRefId(source.categoryRefId, `${label} category`)
      : null;
    if (mode === 'brand' && !config.brandRefId) {
      throw new BadRequestException(`${label} brand selection requires a brand reference`);
    }
    if (mode === 'category' && !config.categoryRefId) {
      throw new BadRequestException(`${label} category selection requires a category reference`);
    }
    if (source.maxItems !== undefined && source.maxItems !== null) {
      if (!Number.isInteger(source.maxItems) || source.maxItems < 1 || source.maxItems > MAX_COLLECTION_LIMIT) {
        throw new BadRequestException(
          `${label} max items must be between 1 and ${MAX_COLLECTION_LIMIT}`,
        );
      }
      config.maxItems = source.maxItems;
    } else {
      config.maxItems = null;
    }
    if (source.layout !== undefined && source.layout !== null && source.layout !== 'carousel' && source.layout !== 'grid') {
      throw new BadRequestException(`${label} layout must be carousel or grid`);
    }
    config.layout = source.layout ?? 'carousel';
  }

  if (type === PromotionalSectionType.CATEGORY || type === PromotionalSectionType.BRAND) {
    if (source.layout !== undefined && source.layout !== null && source.layout !== 'carousel' && source.layout !== 'grid') {
      throw new BadRequestException(`${label} layout must be carousel or grid`);
    }
    config.layout = source.layout ?? 'carousel';
  }

  if (type === PromotionalSectionType.VIDEO) {
    config.videoUrl = source.videoUrl ? assertSafeUrl(source.videoUrl, `${label} video URL`) : null;
    config.thumbnail = storageRef(source.thumbnail, `${label} thumbnail`);
  }

  if (type === PromotionalSectionType.BLOG) {
    const mode = source.blogMode ?? 'selected';
    if (mode !== 'selected' && mode !== 'featured' && mode !== 'trending') {
      throw new BadRequestException(`${label} blog mode is invalid`);
    }
    config.blogMode = mode;
  }

  return config;
};

export const normalizeSections = (inputs: SectionInput[] | undefined): NormalizedSection[] =>
  (inputs ?? []).map((input, index) => {
    const label = `Section ${index + 1}`;
    assertScheduleWindow(
      input.startAt ? parseOptionalDate(input.startAt, `${label} start`) : null,
      input.endAt ? parseOptionalDate(input.endAt, `${label} end`) : null,
      label,
    );
    const allowed =
      input.type === PromotionalSectionType.PRODUCT_COLLECTION
        ? input.config?.selectionMode && input.config.selectionMode !== 'manual'
          ? []
          : [PromotionalTargetType.PRODUCT]
        : input.type === PromotionalSectionType.CATEGORY
          ? [PromotionalTargetType.CATEGORY]
          : input.type === PromotionalSectionType.BRAND
            ? [PromotionalTargetType.BRAND]
            : input.type === PromotionalSectionType.BLOG
              ? input.config?.blogMode && input.config.blogMode !== 'selected'
                ? []
                : [PromotionalTargetType.BLOG]
              : [];

    return {
      type: input.type,
      title: optionalText(input.title, `${label} title`, 255),
      subtitle: optionalText(input.subtitle, `${label} subtitle`, 500),
      config: normalizeConfig(input.type, input.config, label),
      sortOrder: input.sortOrder ?? index,
      isActive: input.isActive ?? true,
      startAt: parseOptionalDate(input.startAt, `${label} start`),
      endAt: parseOptionalDate(input.endAt, `${label} end`),
      items: normalizeItems(input.items, allowed, label),
    };
  });

export const normalizeTargets = (inputs: TargetInput[] | undefined): NormalizedTarget[] =>
  (inputs ?? []).map((input, index) => {
    if (!PAGE_TARGET_TYPES.has(input.targetType)) {
      throw new BadRequestException('Page targeting accepts products, categories, and brands');
    }
    return {
      targetType: input.targetType,
      targetRefId: assertRefId(input.targetRefId, 'Page target'),
      sortOrder: input.sortOrder ?? index,
    };
  });

export const collectCatalogRefs = (
  sections: NormalizedSection[],
  targets: NormalizedTarget[],
  couponRefId: string | null,
): CatalogRefSets => {
  const productRefIds = new Set<string>();
  const categoryRefIds = new Set<string>();
  const brandRefIds = new Set<string>();
  const blogRefIds = new Set<string>();

  const add = (type: PromotionalTargetType, refId: string): void => {
    if (type === PromotionalTargetType.PRODUCT) productRefIds.add(refId);
    if (type === PromotionalTargetType.CATEGORY) categoryRefIds.add(refId);
    if (type === PromotionalTargetType.BRAND) brandRefIds.add(refId);
    if (type === PromotionalTargetType.BLOG) blogRefIds.add(refId);
  };

  for (const section of sections) {
    for (const item of section.items) add(item.targetType, item.targetRefId);
    if (section.config.brandRefId) brandRefIds.add(section.config.brandRefId);
    if (section.config.categoryRefId) categoryRefIds.add(section.config.categoryRefId);
  }
  for (const target of targets) add(target.targetType, target.targetRefId);

  return {
    productRefIds: [...productRefIds],
    categoryRefIds: [...categoryRefIds],
    brandRefIds: [...brandRefIds],
    blogRefIds: [...blogRefIds],
    couponRefId,
  };
};
