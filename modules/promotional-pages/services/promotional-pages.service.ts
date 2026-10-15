import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
} from '@packages/common';
import { AuditService } from '@modules/master/services/audit.service';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PROMOTIONAL_PAGE_AUDIT_ENTITY } from '../constants/promotional-page-permissions.constants';
import {
  CreatePromotionalPageDto,
  PromotionalPageQueryDto,
  ReplacePromotionalSectionsDto,
  UpdatePromotionalPageDto,
  UpdatePromotionalPageStatusDto,
  UpdatePromotionalSectionSequenceDto,
} from '../dto/promotional-page.dto';
import { PromotionalPageEntity } from '../entities/promotional-page.entity';
import { PromotionalPageSectionEntity } from '../entities/promotional-page-section.entity';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import {
  IAdminPromotionalPage,
  IAdminPromotionalPageList,
  IAdminPromotionalPageListItem,
  IAdminPromotionalSection,
  IPublicPromotionalPage,
} from '../interfaces/promotional-page.interface';
import { mapCouponToPromotionalSummary } from '../mappers/promotional-page.mapper';
import { PromotionalPagesRepository } from '../repositories/promotional-pages.repository';
import { PromotionalPageReferenceService } from './promotional-page-reference.service';
import {
  NormalizedSection,
  NormalizedTarget,
  NormalizeSectionsOptions,
  assertCanPublish,
  assertScheduleWindow,
  collectCatalogRefs,
  compareSortOrder,
  isSectionVisible,
  isStrictPromotionalStatus,
  normalizeSections,
  normalizeStoredSections,
  normalizeTargets,
  parseOptionalDate,
  publicUnavailableReason,
  resolveEffectiveStatus,
  resolveRequestedStatus,
  stripHtml,
} from '../utils/promotional-page-content.util';

@Injectable()
export class PromotionalPagesService {
  constructor(
    private readonly pagesRepository: PromotionalPagesRepository,
    private readonly references: PromotionalPageReferenceService,
    private readonly auditService: AuditService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async create(dto: CreatePromotionalPageDto, actor: string): Promise<IAdminPromotionalPage> {
    const now = new Date();
    const name = this.requireText(dto.name, 'Name');
    const title = this.requireText(dto.title, 'Title');
    const slug = dto.slug.trim();
    const startAt = parseOptionalDate(dto.startAt, 'Start date');
    const endAt = parseOptionalDate(dto.endAt, 'End date');
    this.assertCampaignDates(startAt, endAt);
    const status = resolveRequestedStatus(dto.status, startAt, endAt, now);
    const sections = normalizeSections(
      dto.sections,
      this.sectionOptions(status, startAt, endAt),
    );
    const targets = normalizeTargets(dto.targets);

    if (await this.pagesRepository.existsBySlug(slug)) {
      throw new ConflictException(`A promotional page with slug "${slug}" already exists`);
    }

    const couponRefId = dto.couponRefId ?? null;
    const { couponId } = await this.references.assertCatalogRefs(
      collectCatalogRefs(sections, targets, couponRefId),
    );

    const saved = await this.insertPage({
      name,
      slug,
      title,
      metaTitle: this.optionalText(dto.metaTitle, 'Meta title', 255),
      metaDescription: this.optionalText(dto.metaDescription, 'Meta description', 500),
      status,
      startAt,
      endAt,
      couponId,
      refId: await generateUniqueRefId(name, (refId) => this.pagesRepository.existsByRefId(refId)),
      createdBy: actor,
      updatedBy: actor,
    });

    if (sections.length || targets.length) {
      await this.pagesRepository.replaceChildren(saved.id, sections, targets);
    }

    const page = await this.requireByRefId(saved.refId);
    await this.audit(page, 'create', actor, {
      slug: page.slug,
      status: page.status,
      couponRefId,
      sectionCount: sections.length,
      ...this.mappingDetails(sections, targets, couponRefId),
    });
    return this.toAdmin(page, now);
  }

  async findAll(query: PromotionalPageQueryDto): Promise<IAdminPromotionalPageList> {
    const now = new Date();
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.pagesRepository.findAllPaginated({
      ...pagination,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      now,
    });
    return buildPaginatedResult(
      data.map((page) => this.toListItem(page, now)),
      total,
      pagination,
    );
  }

  async findOne(refId: string): Promise<IAdminPromotionalPage> {
    return this.toAdmin(await this.requireByRefId(refId), new Date());
  }

  async update(
    refId: string,
    dto: UpdatePromotionalPageDto,
    actor: string,
  ): Promise<IAdminPromotionalPage> {
    const now = new Date();
    const current = await this.requireByRefId(refId);
    const name = dto.name !== undefined ? this.requireText(dto.name, 'Name') : current.name;
    const title = dto.title !== undefined ? this.requireText(dto.title, 'Title') : current.title;
    const slug = dto.slug !== undefined ? dto.slug.trim() : current.slug;
    const startAt =
      dto.startAt !== undefined ? parseOptionalDate(dto.startAt, 'Start date') : current.startAt;
    const endAt = dto.endAt !== undefined ? parseOptionalDate(dto.endAt, 'End date') : current.endAt;
    if (dto.startAt === null || dto.endAt === null) {
      throw new BadRequestException(
        dto.startAt === null
          ? 'Campaign start date is required.'
          : 'Campaign end date is required.',
      );
    }
    const datesTouched = dto.startAt !== undefined || dto.endAt !== undefined;
    if (datesTouched || dto.sections !== undefined) {
      this.assertCampaignDates(startAt, endAt);
    } else if (startAt && endAt) {
      assertScheduleWindow(startAt, endAt);
    }
    const status =
      dto.status !== undefined
        ? resolveRequestedStatus(dto.status, startAt, endAt, now)
        : current.status;
    const sectionOptions = this.sectionOptions(status, startAt, endAt);
    const sections =
      dto.sections !== undefined
        ? normalizeSections(dto.sections, {
            ...sectionOptions,
            previousConfigs: this.sectionsFromEntity(current).map((section) => section.config),
          })
        : null;
    const targets = dto.targets !== undefined ? normalizeTargets(dto.targets) : null;
    const scheduleChanged = dto.startAt !== undefined || dto.endAt !== undefined;
    if (sections === null && (scheduleChanged || sectionOptions.mode === 'publish')) {
      normalizeStoredSections(this.sectionsFromEntity(current), sectionOptions);
    }

    if (slug !== current.slug && (await this.pagesRepository.existsBySlug(slug, refId))) {
      throw new ConflictException(`A promotional page with slug "${slug}" already exists`);
    }

    let couponId = current.couponId;
    let couponRefId = current.coupon?.refId ?? null;
    if (dto.couponRefId !== undefined) {
      couponRefId = dto.couponRefId;
      const resolved = await this.references.assertCatalogRefs(
        collectCatalogRefs(sections ?? [], targets ?? [], couponRefId),
      );
      couponId = resolved.couponId;
    } else if (sections || targets) {
      await this.references.assertCatalogRefs(
        collectCatalogRefs(sections ?? [], targets ?? [], null),
      );
    }

    await this.pagesRepository.updateByRefId(refId, {
      name,
      slug,
      title,
      metaTitle:
        dto.metaTitle !== undefined
          ? this.optionalText(dto.metaTitle, 'Meta title', 255)
          : current.metaTitle,
      metaDescription:
        dto.metaDescription !== undefined
          ? this.optionalText(dto.metaDescription, 'Meta description', 500)
          : current.metaDescription,
      status,
      startAt,
      endAt,
      couponId,
      updatedBy: actor,
    });

    if (sections || targets) {
      await this.pagesRepository.replaceChildren(
        current.id,
        sections ?? this.sectionsFromEntity(current),
        targets ?? this.targetsFromEntity(current),
      );
    }

    const page = await this.requireByRefId(refId);
    await this.audit(page, dto.status !== undefined ? this.statusAuditAction(page.status) : 'update', actor, {
      slug: page.slug,
      status: page.status,
      couponChanged: dto.couponRefId !== undefined,
      sectionsReplaced: Boolean(sections),
      targetsReplaced: Boolean(targets),
      ...this.mappingDetails(sections ?? [], targets ?? [], couponRefId),
    });
    return this.toAdmin(page, now);
  }

  async replaceSections(
    refId: string,
    dto: ReplacePromotionalSectionsDto,
    actor: string,
  ): Promise<IAdminPromotionalPage> {
    const current = await this.requireByRefId(refId);
    this.assertCampaignDates(current.startAt, current.endAt);
    const sections = normalizeSections(dto.sections, {
      ...this.sectionOptions(current.status, current.startAt, current.endAt),
      previousConfigs: this.sectionsFromEntity(current).map((section) => section.config),
    });
    const targets = this.targetsFromEntity(current);
    await this.references.assertCatalogRefs(collectCatalogRefs(sections, [], null));
    await this.pagesRepository.replaceChildren(current.id, sections, targets);
    const page = await this.requireByRefId(refId);
    await this.audit(page, 'sections_update', actor, {
      sectionCount: sections.length,
      sortOrder: sections.map((section) => section.sortOrder),
      visibility: sections.map((section) => section.isActive),
      ...this.mappingDetails(sections, [], null),
    });
    return this.toAdmin(page, new Date());
  }

  async reorderSections(
    refId: string,
    dto: UpdatePromotionalSectionSequenceDto,
    actor: string,
  ): Promise<IAdminPromotionalPage> {
    const current = await this.requireByRefId(refId);
    const existing = current.sections ?? [];
    const ids = dto.sections.map((section) => section.sectionId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Invalid section sequence for this campaign. Duplicate section id.',
      );
    }
    const orders = dto.sections.map((section) => section.sortOrder);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException(
        'Invalid section sequence for this campaign. Duplicate sort order.',
      );
    }
    const existingIds = new Set(existing.map((section) => section.id));
    if (ids.some((id) => !existingIds.has(id)) || ids.length !== existing.length) {
      throw new BadRequestException(
        'Invalid section sequence for this campaign. Every section on this page must be included once.',
      );
    }

    await this.pagesRepository.updateSectionSortOrders(
      current.id,
      dto.sections.map((section) => ({ id: section.sectionId, sortOrder: section.sortOrder })),
    );
    const page = await this.requireByRefId(refId);
    await this.audit(page, 'sections_sequence', actor, {
      sortOrder: [...(page.sections ?? [])]
        .sort(compareSortOrder)
        .map((section) => ({ id: section.id, sortOrder: section.sortOrder })),
    });
    return this.toAdmin(page, new Date());
  }

  async updateStatus(
    refId: string,
    dto: UpdatePromotionalPageStatusDto,
    actor: string,
  ): Promise<IAdminPromotionalPage> {
    const now = new Date();
    const current = await this.requireByRefId(refId);
    if (dto.status === PromotionalPageStatus.ARCHIVED) {
      await this.remove(refId, actor);
      return this.toAdmin(
        { ...current, status: PromotionalPageStatus.ARCHIVED, updatedBy: actor },
        now,
      );
    }
    if (dto.status === PromotionalPageStatus.EXPIRED) {
      throw new BadRequestException('Expired follows the schedule and cannot be set directly');
    }

    const status =
      dto.status === PromotionalPageStatus.PUBLISHED
        ? assertCanPublish(current.startAt, current.endAt, now)
        : resolveRequestedStatus(dto.status, current.startAt, current.endAt, now);

    if (isStrictPromotionalStatus(status)) {
      this.assertCampaignDates(current.startAt, current.endAt);
      normalizeStoredSections(
        this.sectionsFromEntity(current),
        this.sectionOptions(status, current.startAt, current.endAt),
      );
    }

    await this.pagesRepository.updateByRefId(refId, { status, updatedBy: actor });
    const page = await this.requireByRefId(refId);
    await this.audit(page, this.statusAuditAction(status), actor, {
      from: current.status,
      to: status,
    });
    return this.toAdmin(page, now);
  }

  async remove(refId: string, actor: string): Promise<{ refId: string }> {
    const current = await this.requireByRefId(refId);
    await this.pagesRepository.updateByRefId(refId, {
      status: PromotionalPageStatus.ARCHIVED,
      updatedBy: actor,
    });
    await this.audit(current, 'archive', actor, { slug: current.slug });
    await this.pagesRepository.softDeleteByRefId(refId);
    return { refId };
  }

  async preview(refId: string): Promise<IPublicPromotionalPage> {
    const page = await this.requireByRefId(refId);
    return this.toPublic(page, new Date(), { preview: true });
  }

  async findPublicBySlug(slug: string): Promise<IPublicPromotionalPage> {
    const now = new Date();
    const page = await this.pagesRepository.findBySlug(slug);
    if (!page) {
      const archived = await this.pagesRepository.findArchivedBySlug(slug);
      if (archived) {
        throw new NotFoundException('Promotional page is archived');
      }
      throw new NotFoundException('Promotional page not found');
    }

    const reason = publicUnavailableReason(page, now);
    if (reason) {
      throw new NotFoundException(reason);
    }

    const visibleSections = (page.sections ?? []).filter((section) => isSectionVisible(section, now));
    return this.toPublic({ ...page, sections: visibleSections }, now, { preview: false });
  }

  private async toPublic(
    page: PromotionalPageEntity,
    now: Date,
    options: { preview: boolean },
  ): Promise<IPublicPromotionalPage> {
    const sections = [...(page.sections ?? [])].sort(compareSortOrder);
    const hydrated = await this.references.hydrate({
      sections,
      targets: page.targets ?? [],
      coupon: page.coupon,
    });

    const visibleIds = new Set(
      (page.sections ?? [])
        .filter((section) => isSectionVisible(section, now))
        .map((section) => section.id),
    );

    return this.storageUrlEnricher.enrichDeep({
      id: page.id,
      refId: page.refId,
      name: page.name,
      slug: page.slug,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      status: resolveEffectiveStatus(page, now),
      startAt: page.startAt,
      endAt: page.endAt,
      sections: hydrated.sections.map((section) => ({
        ...section,
        isCurrentlyVisible: visibleIds.has(section.id),
      })),
      targets: hydrated.targets,
      promotion: mapCouponToPromotionalSummary(page.coupon),
      seo: {
        title: page.title,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
      },
      ...(options.preview ? { preview: true } : {}),
    });
  }

  private toAdmin(page: PromotionalPageEntity, now: Date): IAdminPromotionalPage {
    const sections = [...(page.sections ?? [])].sort(compareSortOrder).map((section) => this.toAdminSection(section));
    const targets = [...(page.targets ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((target) => ({
        targetType: target.targetType,
        targetRefId: target.targetRefId,
        sortOrder: target.sortOrder,
      }));

    return {
      id: page.id,
      refId: page.refId,
      name: page.name,
      slug: page.slug,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      status: resolveEffectiveStatus(page, now),
      storedStatus: page.status,
      startAt: page.startAt,
      endAt: page.endAt,
      couponRefId: page.coupon?.refId ?? null,
      promotion: mapCouponToPromotionalSummary(page.coupon),
      sections,
      targets,
      seo: {
        title: page.title,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
      },
      createdBy: page.createdBy,
      updatedBy: page.updatedBy,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  }

  private toAdminSection(section: PromotionalPageSectionEntity): IAdminPromotionalSection {
    return {
      id: section.id,
      type: section.type,
      title: section.title,
      subtitle: section.subtitle,
      config: section.config ?? {},
      sortOrder: section.sortOrder,
      isActive: section.isActive,
      startAt: section.startAt,
      endAt: section.endAt,
      items: [...(section.items ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          targetType: item.targetType,
          targetRefId: item.targetRefId,
          sortOrder: item.sortOrder,
        })),
    };
  }

  private toListItem(page: PromotionalPageEntity, now: Date): IAdminPromotionalPageListItem {
    return {
      id: page.id,
      refId: page.refId,
      name: page.name,
      slug: page.slug,
      title: page.title,
      status: resolveEffectiveStatus(page, now),
      storedStatus: page.status,
      startAt: page.startAt,
      endAt: page.endAt,
      sectionCount: page.sectionCount ?? 0,
      couponRefId: page.coupon?.refId ?? null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  }

  private sectionOptions(
    status: PromotionalPageStatus,
    startAt: Date | null,
    endAt: Date | null,
  ): NormalizeSectionsOptions {
    return {
      mode: isStrictPromotionalStatus(status) ? 'publish' : 'draft',
      pageStartAt: startAt,
      pageEndAt: endAt,
      requireSectionDates: true,
    };
  }

  private assertCampaignDates(startAt: Date | null, endAt: Date | null): void {
    if (!startAt) {
      throw new BadRequestException('Campaign start date is required.');
    }
    if (!endAt) {
      throw new BadRequestException('Campaign end date is required.');
    }
    assertScheduleWindow(startAt, endAt);
  }

  private sectionsFromEntity(page: PromotionalPageEntity): NormalizedSection[] {
    return [...(page.sections ?? [])].sort(compareSortOrder).map((section) => ({
        type: section.type,
        title: section.title,
        subtitle: section.subtitle,
        config: section.config ?? {},
        sortOrder: section.sortOrder,
        isActive: section.isActive,
        startAt: section.startAt,
        endAt: section.endAt,
        items: [...(section.items ?? [])]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => ({
            targetType: item.targetType,
            targetRefId: item.targetRefId,
            sortOrder: item.sortOrder,
          })),
      }));
  }

  private targetsFromEntity(page: PromotionalPageEntity): NormalizedTarget[] {
    return [...(page.targets ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((target) => ({
        targetType: target.targetType,
        targetRefId: target.targetRefId,
        sortOrder: target.sortOrder,
      }));
  }

  private async requireByRefId(refId: string): Promise<PromotionalPageEntity> {
    const page = await this.pagesRepository.findByRefId(refId);
    if (!page) {
      throw new NotFoundException('Promotional page not found');
    }
    return page;
  }

  private async insertPage(data: Partial<PromotionalPageEntity>): Promise<PromotionalPageEntity> {
    try {
      return await this.pagesRepository.create(data);
    } catch (error) {
      if (this.isSlugConflict(error)) {
        throw new ConflictException(`A promotional page with slug "${data.slug}" already exists`);
      }
      throw error;
    }
  }

  private isSlugConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string; detail?: string };
    if (driverError?.code !== '23505') return false;
    return `${driverError.constraint ?? ''} ${driverError.detail ?? ''}`.includes('slug');
  }

  private requireText(value: string, label: string): string {
    const cleaned = stripHtml(value);
    if (cleaned.length < 2) {
      throw new BadRequestException(`${label} is required`);
    }
    return cleaned;
  }

  private optionalText(
    value: string | null | undefined,
    label: string,
    max: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    const cleaned = stripHtml(value);
    if (!cleaned) return null;
    if (cleaned.length > max) {
      throw new BadRequestException(`${label} must be at most ${max} characters`);
    }
    return cleaned;
  }

  private mappingDetails(
    sections: NormalizedSection[],
    targets: NormalizedTarget[],
    couponRefId: string | null,
  ): Record<string, unknown> {
    const refs = collectCatalogRefs(sections, targets, couponRefId);
    return {
      productRefIds: refs.productRefIds,
      categoryRefIds: refs.categoryRefIds,
      brandRefIds: refs.brandRefIds,
      blogRefIds: refs.blogRefIds,
      couponRefId: refs.couponRefId,
    };
  }

  private statusAuditAction(status: PromotionalPageStatus): string {
    if (status === PromotionalPageStatus.PUBLISHED) return 'publish';
    if (status === PromotionalPageStatus.UNPUBLISHED) return 'unpublish';
    if (status === PromotionalPageStatus.SCHEDULED) return 'schedule';
    if (status === PromotionalPageStatus.ARCHIVED) return 'archive';
    return 'status';
  }

  private async audit(
    page: PromotionalPageEntity,
    action: string,
    actor: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      entityType: PROMOTIONAL_PAGE_AUDIT_ENTITY,
      entityId: page.id,
      entityRefId: page.refId,
      action,
      performedBy: actor,
      details,
    });
  }
}
