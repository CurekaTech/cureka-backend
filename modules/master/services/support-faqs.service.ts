import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import {
  CreateSupportFaqDto,
  SupportFaqQueryDto,
  UpdateSupportFaqDto,
  UpdateSupportFaqStatusDto,
} from '../dto/support.dto';
import { SupportFaqEntity } from '../entities/support-faq.entity';
import { SupportCategoryType } from '../enums/support-category-type.enum';
import { SupportContentStatus } from '../enums/support-content-status.enum';
import { mapStorefrontFaq, mapSupportFaq } from '../mappers/support.mapper';
import { SupportFaqsRepository } from '../repositories/support-faqs.repository';
import { SupportCategoriesService } from './support-categories.service';

@Injectable()
export class SupportFaqsService {
  constructor(
    private readonly faqsRepo: SupportFaqsRepository,
    private readonly categoriesService: SupportCategoriesService,
  ) {}

  async create(dto: CreateSupportFaqDto, actor: string) {
    await this.categoriesService.assertCategoryExists(dto.categoryRefId, SupportCategoryType.FAQ);

    const refId = await generateUniqueRefId(dto.question, (id) =>
      this.faqsRepo.existsByRefId(id),
    );

    const entity = await this.faqsRepo.create({
      refId,
      question: dto.question,
      answer: dto.answer,
      categoryRefId: dto.categoryRefId,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? SupportContentStatus.ACTIVE,
      createdBy: actor,
      updatedBy: actor,
    });

    return mapSupportFaq(entity);
  }

  async findAll(query: SupportFaqQueryDto): Promise<PaginatedResult<ReturnType<typeof mapSupportFaq>>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.faqsRepo.findAllPaginated({
      ...pagination,
      categoryRefId: query.categoryRefId,
      status: query.status,
    });

    return buildPaginatedResult(data.map(mapSupportFaq), total, pagination);
  }

  async findAllPublic(query: SupportFaqQueryDto) {
    const result = await this.findAll({
      ...query,
      status: SupportContentStatus.ACTIVE,
    });
    return {
      ...result,
      data: result.data.map((faq) => mapStorefrontFaq(faq as SupportFaqEntity)),
    };
  }

  async findOne(refId: string) {
    const entity = await this.faqsRepo.findByRefId(refId);
    if (!entity) throw new NotFoundException('Support FAQ not found');
    return mapSupportFaq(entity);
  }

  async update(refId: string, dto: UpdateSupportFaqDto, actor: string) {
    const existing = await this.faqsRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Support FAQ not found');

    if (dto.categoryRefId) {
      await this.categoriesService.assertCategoryExists(dto.categoryRefId, SupportCategoryType.FAQ);
    }

    const updated = await this.faqsRepo.updateByRefId(refId, {
      ...dto,
      updatedBy: actor,
    });

    return mapSupportFaq(updated as SupportFaqEntity);
  }

  async updateStatus(refId: string, dto: UpdateSupportFaqStatusDto, actor: string) {
    return this.update(refId, { status: dto.status }, actor);
  }

  async remove(refId: string) {
    const existing = await this.faqsRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Support FAQ not found');
    await this.faqsRepo.softDeleteByRefId(refId);
  }
}
