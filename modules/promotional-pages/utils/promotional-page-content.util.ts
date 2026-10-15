import { BadRequestException } from '@nestjs/common';
import { mergeJsonImageAlt } from '@modules/master/utils/image-alt-text.util';
import { IStorageFileReference } from '@packages/storage';
import { REF_ID_PATTERN } from '@packages/common';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';

export const DEFAULT_COLLECTION_LIMIT = 12;
export const MAX_COLLECTION_LIMIT = 50;
export const SECTION_TITLE_MAX = 100;
export const SECTION_SUBTITLE_MAX = 200;
export const SECTION_HEADING_MAX = 100;
export const MAX_CATEGORY_ITEMS = 20;
export const MAX_BRAND_ITEMS = 20;
export const MAX_BLOG_ITEMS = 12;

export type SectionValidationMode = 'draft' | 'publish';

export interface NormalizeSectionsOptions {
  mode?: SectionValidationMode;
  pageStartAt?: Date | null;
  pageEndAt?: Date | null;
  /** User-submitted sections must include both dates. Stored rows may still be null. */
  requireSectionDates?: boolean;
  /** Previous configs aligned by section index, used to keep omitted alt text. */
  previousConfigs?: Array<PromotionalSectionConfig | null | undefined>;
}

export const isStrictPromotionalStatus = (status: PromotionalPageStatus): boolean =>
  status === PromotionalPageStatus.PUBLISHED || status === PromotionalPageStatus.SCHEDULED;

export interface PromotionalSectionConfig {
  heading?: string | null;
  desktopImage?: IStorageFileReference | null;
  desktopImageAltText?: string | null;
  mobileImage?: IStorageFileReference | null;
  mobileImageAltText?: string | null;
  thumbnail?: IStorageFileReference | null;
  thumbnailAltText?: string | null;
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

export const formatCampaignDate = (value: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);

export const formatCampaignRange = (startAt: Date, endAt: Date): string =>
  `${formatCampaignDate(startAt)} - ${formatCampaignDate(endAt)}`;

export const assertScheduleWindow = (
  startAt: Date | null | undefined,
  endAt: Date | null | undefined,
  _label = 'Schedule',
): void => {
  if (startAt && endAt && endAt < startAt) {
    throw new BadRequestException(
      'Campaign start date must be before or equal to campaign end date.',
    );
  }
};

export const compareSortOrder = (
  left: { sortOrder: number; id?: string },
  right: { sortOrder: number; id?: string },
): number => {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return (left.id ?? '').localeCompare(right.id ?? '');
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

const YOUTUBE_HOST = /^(?:(?:www|m)\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

const exceptionMessages = (error: BadRequestException): string[] => {
  const response = error.getResponse();
  if (typeof response === 'string') return [response];
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String);
    if (typeof message === 'string') return [message];
  }
  return [error.message];
};

const capture = <T>(errors: string[], run: () => T, fallback: T): T => {
  try {
    return run();
  } catch (error) {
    if (error instanceof BadRequestException) {
      errors.push(...exceptionMessages(error));
      return fallback;
    }
    throw error;
  }
};

const throwSectionErrors = (errors: string[]): void => {
  if (errors.length === 0) return;
  const exception = new BadRequestException(errors);
  exception.message = errors.join('\n');
  throw exception;
};

const assertYouTubeUrl = (value: string, label: string): string => {
  const safe = assertSafeUrl(value, label);
  if (safe.startsWith('/')) {
    throw new BadRequestException(`${label} must be a YouTube URL`);
  }
  let host = '';
  try {
    host = new URL(safe).hostname;
  } catch {
    throw new BadRequestException(`${label} must be a YouTube URL`);
  }
  if (!YOUTUBE_HOST.test(host)) {
    throw new BadRequestException(`${label} must be a YouTube URL`);
  }
  return safe;
};

const campaignRangeSuffix = (pageStartAt?: Date | null, pageEndAt?: Date | null): string =>
  pageStartAt && pageEndAt ? ` (${formatCampaignRange(pageStartAt, pageEndAt)})` : '';

const assertSectionInsidePage = (
  errors: string[],
  startAt: Date | null,
  endAt: Date | null,
  label: string,
  pageStartAt?: Date | null,
  pageEndAt?: Date | null,
): void => {
  const range = campaignRangeSuffix(pageStartAt, pageEndAt);
  if (startAt && pageStartAt && startAt < pageStartAt) {
    errors.push(`${label} start date cannot be before the campaign start date${range}.`);
  }
  if (endAt && pageStartAt && endAt < pageStartAt) {
    errors.push(`${label} end date cannot be before the campaign start date${range}.`);
  }
  if (startAt && pageEndAt && startAt > pageEndAt) {
    errors.push(`${label} start date cannot be after the campaign end date${range}.`);
  }
  if (endAt && pageEndAt && endAt > pageEndAt) {
    errors.push(`${label} end date cannot be after the campaign end date${range}.`);
  }
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

const isSelectionMode = (value: unknown): value is 'manual' | 'brand' | 'category' =>
  value === 'manual' || value === 'brand' || value === 'category';

const isLayout = (value: unknown): value is 'carousel' | 'grid' =>
  value === 'carousel' || value === 'grid';

const isBlogMode = (value: unknown): value is 'selected' | 'featured' | 'trending' =>
  value === 'selected' || value === 'featured' || value === 'trending';

const normalizeItems = (
  items: SectionInput['items'],
  allowed: PromotionalTargetType[],
  label: string,
  errors: string[],
): NormalizedItem[] => {
  const rows = items ?? [];
  if (!allowed.length && rows.length) {
    errors.push(`${label} does not accept catalog items`);
    return [];
  }
  const normalized: NormalizedItem[] = [];
  rows.forEach((item, index) => {
    if (!allowed.includes(item.targetType)) {
      errors.push(`${label} does not accept ${item.targetType} items`);
      return;
    }
    const targetRefId = capture(
      errors,
      () => assertRefId(item.targetRefId, `${label} item`),
      null,
    );
    if (!targetRefId) return;
    normalized.push({
      targetType: item.targetType,
      targetRefId,
      sortOrder: item.sortOrder ?? index,
    });
  });
  return normalized;
};

const applyCta = (
  config: PromotionalSectionConfig,
  source: PromotionalSectionConfig,
  label: string,
  errors: string[],
  strict: boolean,
  withHeading: boolean,
): void => {
  if (withHeading) {
    config.heading = capture(
      errors,
      () => optionalText(source.heading, `${label} heading`, SECTION_HEADING_MAX),
      null,
    );
  }
  config.ctaText = capture(errors, () => optionalText(source.ctaText, `${label} CTA text`, 120), null);
  const ctaUrlProvided = typeof source.ctaUrl === 'string' && source.ctaUrl.trim().length > 0;
  config.ctaUrl = ctaUrlProvided
    ? capture(errors, () => assertSafeUrl(source.ctaUrl as string, `${label} CTA URL`), null)
    : null;
  const textSet = Boolean(config.ctaText);
  const urlSet = Boolean(config.ctaUrl);
  if (strict && textSet !== urlSet && !(ctaUrlProvided && !urlSet)) {
    errors.push(`${label} CTA text and CTA URL must both be set or both be empty`);
  }
};

const applyLayout = (
  config: PromotionalSectionConfig,
  source: PromotionalSectionConfig,
  label: string,
  errors: string[],
  required: boolean,
): void => {
  const provided = source.layout !== undefined && source.layout !== null;
  if (provided && !isLayout(source.layout)) {
    errors.push(`${label} layout must be carousel or grid`);
    return;
  }
  if (!provided && required) {
    errors.push(`${label} layout is required`);
    return;
  }
  config.layout = provided ? source.layout : 'carousel';
};

const applyImageAlt = (
  config: PromotionalSectionConfig,
  source: PromotionalSectionConfig,
  previous: PromotionalSectionConfig | null | undefined,
  imageKey: 'desktopImage' | 'mobileImage' | 'thumbnail',
  altKey: 'desktopImageAltText' | 'mobileImageAltText' | 'thumbnailAltText',
): void => {
  config[altKey] = mergeJsonImageAlt({
    incoming: source[altKey],
    previousAlt: previous?.[altKey],
    previousFile: previous?.[imageKey],
    nextFile: config[imageKey],
  });
};

const normalizeConfig = (
  type: PromotionalSectionType,
  raw: PromotionalSectionConfig | null | undefined,
  label: string,
  errors: string[],
  strict: boolean,
  previous?: PromotionalSectionConfig | null,
): PromotionalSectionConfig => {
  const source = raw ?? {};
  const config: PromotionalSectionConfig = {};
  const withCta =
    type === PromotionalSectionType.HERO_BANNER ||
    type === PromotionalSectionType.PRODUCT_COLLECTION ||
    type === PromotionalSectionType.VIDEO;
  if (withCta) {
    applyCta(
      config,
      source,
      label,
      errors,
      strict,
      type === PromotionalSectionType.HERO_BANNER || type === PromotionalSectionType.PRODUCT_COLLECTION,
    );
  }

  if (type === PromotionalSectionType.HERO_BANNER) {
    const desktopProvided = source.desktopImage !== undefined && source.desktopImage !== null;
    const mobileProvided = source.mobileImage !== undefined && source.mobileImage !== null;
    config.desktopImage = capture(
      errors,
      () => storageRef(source.desktopImage, `${label} desktop image`),
      null,
    );
    config.mobileImage = capture(
      errors,
      () => storageRef(source.mobileImage, `${label} mobile image`),
      null,
    );
    if (strict && !desktopProvided) {
      errors.push(`${label} desktop image is required`);
    }
    if (strict && !mobileProvided) {
      errors.push(`${label} mobile image is required`);
    }
    applyImageAlt(config, source, previous, 'desktopImage', 'desktopImageAltText');
    applyImageAlt(config, source, previous, 'mobileImage', 'mobileImageAltText');
  }

  if (type === PromotionalSectionType.PRODUCT_COLLECTION) {
    const modeProvided = source.selectionMode !== undefined && source.selectionMode !== null;
    if (modeProvided && !isSelectionMode(source.selectionMode)) {
      errors.push(`${label} selection mode is invalid`);
    } else if (!modeProvided && strict) {
      errors.push(`${label} selection mode is required`);
    } else {
      config.selectionMode = isSelectionMode(source.selectionMode) ? source.selectionMode : 'manual';
    }
    config.brandRefId = source.brandRefId
      ? capture(errors, () => assertRefId(source.brandRefId as string, `${label} brand`), null)
      : null;
    config.categoryRefId = source.categoryRefId
      ? capture(errors, () => assertRefId(source.categoryRefId as string, `${label} category`), null)
      : null;
    if (strict && config.selectionMode === 'brand' && !source.brandRefId) {
      errors.push(`${label} brand selection requires a brand reference`);
    }
    if (strict && config.selectionMode === 'category' && !source.categoryRefId) {
      errors.push(`${label} category selection requires a category reference`);
    }
    if (source.maxItems !== undefined && source.maxItems !== null) {
      if (
        !Number.isInteger(source.maxItems) ||
        source.maxItems < 1 ||
        source.maxItems > MAX_COLLECTION_LIMIT
      ) {
        errors.push(`${label} max items must be between 1 and ${MAX_COLLECTION_LIMIT}`);
      } else {
        config.maxItems = source.maxItems;
      }
    } else {
      config.maxItems = null;
    }
    applyLayout(config, source, label, errors, strict);
  }

  if (type === PromotionalSectionType.CATEGORY || type === PromotionalSectionType.BRAND) {
    applyLayout(config, source, label, errors, false);
  }

  if (type === PromotionalSectionType.VIDEO) {
    const videoProvided = typeof source.videoUrl === 'string' && source.videoUrl.trim().length > 0;
    config.videoUrl = videoProvided
      ? capture(errors, () => assertYouTubeUrl(source.videoUrl as string, `${label} video URL`), null)
      : null;
    if (strict && !videoProvided) {
      errors.push(`${label} video URL is required`);
    }
    config.thumbnail = capture(errors, () => storageRef(source.thumbnail, `${label} thumbnail`), null);
    applyImageAlt(config, source, previous, 'thumbnail', 'thumbnailAltText');
  }

  if (type === PromotionalSectionType.BLOG) {
    const modeProvided = source.blogMode !== undefined && source.blogMode !== null;
    if (modeProvided && !isBlogMode(source.blogMode)) {
      errors.push(`${label} blog mode is invalid`);
    } else if (!modeProvided && strict) {
      errors.push(`${label} blog mode is required`);
    } else {
      config.blogMode = isBlogMode(source.blogMode) ? source.blogMode : 'selected';
    }
  }

  return config;
};

const allowedItemTypes = (
  type: PromotionalSectionType,
  config: PromotionalSectionConfig,
): PromotionalTargetType[] => {
  if (type === PromotionalSectionType.PRODUCT_COLLECTION) {
    return !config.selectionMode || config.selectionMode === 'manual'
      ? [PromotionalTargetType.PRODUCT]
      : [];
  }
  if (type === PromotionalSectionType.CATEGORY) return [PromotionalTargetType.CATEGORY];
  if (type === PromotionalSectionType.BRAND) return [PromotionalTargetType.BRAND];
  if (type === PromotionalSectionType.BLOG) {
    return !config.blogMode || config.blogMode === 'selected' ? [PromotionalTargetType.BLOG] : [];
  }
  return [];
};

const assertItemLimits = (
  errors: string[],
  section: NormalizedSection,
  label: string,
  strict: boolean,
): void => {
  if (
    section.type === PromotionalSectionType.PRODUCT_COLLECTION &&
    section.config.selectionMode === 'manual'
  ) {
    if (section.items.length > MAX_COLLECTION_LIMIT) {
      errors.push(`${label} accepts at most ${MAX_COLLECTION_LIMIT} products`);
    }
    if (
      section.config.maxItems != null &&
      section.items.length > section.config.maxItems
    ) {
      errors.push(`${label} max items cannot be lower than the number of selected products`);
    }
    if (strict && section.items.length < 1) {
      errors.push(`${label} needs at least 1 product`);
    }
  }

  if (section.type === PromotionalSectionType.CATEGORY) {
    if (section.items.length > MAX_CATEGORY_ITEMS) {
      errors.push(`${label} accepts at most ${MAX_CATEGORY_ITEMS} categories`);
    }
    if (strict && section.items.length < 1) {
      errors.push(`${label} needs at least 1 category`);
    }
  }

  if (section.type === PromotionalSectionType.BRAND) {
    if (section.items.length > MAX_BRAND_ITEMS) {
      errors.push(`${label} accepts at most ${MAX_BRAND_ITEMS} brands`);
    }
    if (strict && section.items.length < 1) {
      errors.push(`${label} needs at least 1 brand`);
    }
  }

  if (section.type === PromotionalSectionType.BLOG && section.config.blogMode === 'selected') {
    if (section.items.length > MAX_BLOG_ITEMS) {
      errors.push(`${label} accepts at most ${MAX_BLOG_ITEMS} blog posts`);
    }
    if (strict && section.items.length < 1) {
      errors.push(`${label} needs at least 1 blog post`);
    }
  }
};

const toSectionInput = (section: NormalizedSection): SectionInput => ({
  type: section.type,
  title: section.title,
  subtitle: section.subtitle,
  config: section.config,
  sortOrder: section.sortOrder,
  isActive: section.isActive,
  startAt: section.startAt ? section.startAt.toISOString() : null,
  endAt: section.endAt ? section.endAt.toISOString() : null,
  items: section.items,
});

export const normalizeSections = (
  inputs: SectionInput[] | undefined,
  options: NormalizeSectionsOptions = {},
): NormalizedSection[] => {
  const errors: string[] = [];
  const strict = options.mode === 'publish';
  const sections = (inputs ?? []).map((input, index) => {
    const sectionName = typeof input.title === 'string' ? stripHtml(input.title) : '';
    const label = sectionName ? `Section ${index + 1} (${sectionName})` : `Section ${index + 1}`;
    const startAt = capture(errors, () => parseOptionalDate(input.startAt, `${label} start`), null);
    const endAt = capture(errors, () => parseOptionalDate(input.endAt, `${label} end`), null);
    if (options.requireSectionDates && !startAt) {
      errors.push(`${label} start date is required.`);
    }
    if (options.requireSectionDates && !endAt) {
      errors.push(`${label} end date is required.`);
    }
    if (startAt && endAt && endAt < startAt) {
      errors.push(`${label} start date must be before or equal to section end date.`);
    }
    assertSectionInsidePage(errors, startAt, endAt, label, options.pageStartAt, options.pageEndAt);
    const config = normalizeConfig(
      input.type,
      input.config,
      label,
      errors,
      strict,
      options.previousConfigs?.[index],
    );
    const section: NormalizedSection = {
      type: input.type,
      title: capture(errors, () => optionalText(input.title, `${label} title`, SECTION_TITLE_MAX), null),
      subtitle: capture(
        errors,
        () => optionalText(input.subtitle, `${label} subtitle`, SECTION_SUBTITLE_MAX),
        null,
      ),
      config,
      sortOrder: input.sortOrder ?? index,
      isActive: input.isActive ?? true,
      startAt,
      endAt,
      items: normalizeItems(input.items, allowedItemTypes(input.type, config), label, errors),
    };
    assertItemLimits(errors, section, label, strict);
    return section;
  });

  if (strict && !sections.some((section) => section.isActive)) {
    errors.push('At least one active section is required to publish');
  }

  throwSectionErrors(errors);
  return sections;
};

export const normalizeStoredSections = (
  sections: NormalizedSection[],
  options?: NormalizeSectionsOptions,
): NormalizedSection[] =>
  normalizeSections(sections.map(toSectionInput), { ...options, requireSectionDates: false });

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
