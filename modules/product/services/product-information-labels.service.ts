import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { MasterListQueryDto } from '@modules/master/dto/master-list-query.dto';
import { buildMasterListOptions } from '@modules/master/utils/master-list-query.util';
import {
  CreateProductInformationLabelDto,
  UpdateProductInformationLabelDto,
  UpdateProductInformationLabelStatusDto,
  ReorderProductInformationLabelsDto,
} from '../dto/product-information-label.dto';
import { IProductInformationLabel } from '../interfaces/product-information-label.interface';
import {
  mapProductInformationLabelEntitiesToResponse,
  mapProductInformationLabelEntityToResponse,
} from '../mappers/product-information-label.mapper';
import { ProductInformationLabelsRepository } from '../repositories/product-information-labels.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';

@Injectable()
export class ProductInformationLabelsService {
  private readonly logger = new Logger(ProductInformationLabelsService.name);

  constructor(
    private readonly productInformationLabelsRepository: ProductInformationLabelsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly productVariantsRepository: ProductVariantsRepository,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async create(
    dto: CreateProductInformationLabelDto,
    createdBy: string,
  ): Promise<IProductInformationLabel> {
    if (await this.productInformationLabelsRepository.existsByName(dto.name)) {
      throw new ConflictException(
        `A product information label with name "${dto.name}" already exists`,
      );
    }

    const entity = await this.productInformationLabelsRepository.create({
      name: dto.name,
      status: dto.status ?? MasterStatus.ACTIVE,
      sortOrder: dto.sortOrder ?? (await this.productInformationLabelsRepository.getNextSortOrder()),
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.productInformationLabelsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    await this.invalidatePublicProductCaches('created', entity.refId);
    return mapProductInformationLabelEntityToResponse(entity);
  }

  async findAll(
    query: MasterListQueryDto,
  ): Promise<PaginatedResult<IProductInformationLabel>> {
    const paginationOptions = buildMasterListOptions(query);
    const { data, total } =
      await this.productInformationLabelsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(
      mapProductInformationLabelEntitiesToResponse(data),
      total,
      paginationOptions,
    );
  }

  async findOne(refId: string): Promise<IProductInformationLabel> {
    const entity = await this.productInformationLabelsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Product information label with refId ${refId} not found`);
    }
    return mapProductInformationLabelEntityToResponse(entity);
  }

  async update(
    refId: string,
    dto: UpdateProductInformationLabelDto,
    updatedBy: string,
  ): Promise<IProductInformationLabel> {
    const existing = await this.productInformationLabelsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product information label with refId ${refId} not found`);
    }

    const oldName = existing.name.trim();
    const nextName = dto.name !== undefined ? dto.name.trim() : undefined;
    const previousName = dto.previousName?.trim();

    this.logger.log(
      `[PIL-UPDATE] start refId=${refId} updatedBy=${updatedBy} ` +
        `existingName="${existing.name}" oldNameTrimmed="${oldName}" ` +
        `dtoName=${dto.name === undefined ? '<undefined>' : `"${dto.name}"`} ` +
        `nextName=${nextName === undefined ? '<undefined>' : `"${nextName}"`} ` +
        `previousName=${previousName === undefined ? '<undefined>' : `"${previousName}"`} ` +
        `dtoKeys=[${Object.keys(dto).join(',')}]`,
    );

    if (nextName !== undefined && nextName !== oldName) {
      if (await this.productInformationLabelsRepository.existsByName(nextName, refId)) {
        throw new ConflictException(
          `A product information label with name "${nextName}" already exists`,
        );
      }
    }

    // Sources of label text still present on products/variants JSON that must become nextName.
    const cascadeFromNames = new Set<string>();
    if (nextName !== undefined && nextName !== oldName) {
      cascadeFromNames.add(oldName);
      this.logger.log(
        `[PIL-UPDATE] cascade reason=master-name-changed from="${oldName}" to="${nextName}"`,
      );
    } else if (nextName !== undefined && nextName === oldName) {
      this.logger.warn(
        `[PIL-UPDATE] master name unchanged ("${oldName}"). ` +
          `JSON cascade will NOT run unless previousName is provided. ` +
          `If product JSON still has an old label, send previousName="<exact JSON label>".`,
      );
    } else {
      this.logger.log('[PIL-UPDATE] dto.name omitted — master name will not change');
    }

    if (previousName && nextName && previousName.toLowerCase() !== nextName.toLowerCase()) {
      cascadeFromNames.add(previousName);
      this.logger.log(
        `[PIL-UPDATE] cascade reason=previousName from="${previousName}" to="${nextName}"`,
      );
    }
    // Stuck repair: master already has the new name, but JSON still has previousName.
    if (
      previousName &&
      nextName === undefined &&
      previousName.toLowerCase() !== oldName.toLowerCase()
    ) {
      cascadeFromNames.add(previousName);
      this.logger.log(
        `[PIL-UPDATE] cascade reason=previousName-only-repair from="${previousName}" to="${oldName}"`,
      );
    }

    const targetName = nextName ?? oldName;
    this.logger.log(
      `[PIL-UPDATE] cascadeFromNames=[${[...cascadeFromNames].join(' | ')}] targetName="${targetName}"`,
    );

    const { previousName: _ignoredPreviousName, ...labelFields } = dto;

    const updated = await this.productInformationLabelsRepository.transaction(async (manager) => {
      this.logger.log('[PIL-UPDATE] transaction started');
      const updatedLabel = await this.productInformationLabelsRepository.updateByRefId(
        refId,
        {
          ...labelFields,
          ...(nextName !== undefined ? { name: nextName } : {}),
          updatedBy,
        },
        manager,
      );

      if (!updatedLabel) {
        throw new NotFoundException(
          `Product information label with refId ${refId} not found after update`,
        );
      }
      this.logger.log(
        `[PIL-UPDATE] master row updated name="${updatedLabel.name}" sortOrder=${updatedLabel.sortOrder}`,
      );

      let productsUpdated = 0;
      let variantsUpdated = 0;
      const shouldCascadeJson =
        cascadeFromNames.size > 0 || (nextName !== undefined && nextName !== oldName);

      if (!shouldCascadeJson) {
        this.logger.warn('[PIL-UPDATE] SKIPPED JSON cascade — no label text changes to apply');
      } else {
        const legacyLabelNames = [...cascadeFromNames];
        this.logger.log(
          `[PIL-UPDATE] cascading JSON by labelRefId="${refId}" to="${targetName}" ` +
            `legacyNames=[${legacyLabelNames.join(' | ')}]`,
        );
        productsUpdated = await this.productsRepository.updateProductInformationLabelByRefId(
          refId,
          targetName,
          legacyLabelNames,
          updatedBy,
          manager,
        );
        variantsUpdated = await this.productVariantsRepository.updateProductInformationLabelByRefId(
          refId,
          targetName,
          legacyLabelNames,
          manager,
        );
        this.logger.log(
          `[PIL-UPDATE] cascade by refId done products=${productsUpdated} variants=${variantsUpdated}`,
        );
      }

      if (shouldCascadeJson && productsUpdated === 0 && variantsUpdated === 0) {
        this.logger.warn(
          `[PIL-UPDATE] ZERO rows updated for labelRefId="${refId}". ` +
            `Run migration to backfill labelRefId, or retry PATCH with previousName ` +
            `set to the exact label in productInformation JSON.`,
        );
      }

      return updatedLabel;
    });

    await this.invalidatePublicProductCaches('updated', refId);
    this.logger.log(`[PIL-UPDATE] completed refId=${refId}`);
    return mapProductInformationLabelEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateProductInformationLabelStatusDto,
    updatedBy: string,
  ): Promise<IProductInformationLabel> {
    const existing = await this.productInformationLabelsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product information label with refId ${refId} not found`);
    }

    const updated = await this.productInformationLabelsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(
        `Product information label with refId ${refId} not found after status update`,
      );
    }

    await this.invalidatePublicProductCaches('status_updated', refId);
    return mapProductInformationLabelEntityToResponse(updated);
  }

  async reorder(
    dto: ReorderProductInformationLabelsDto,
    updatedBy: string,
  ): Promise<IProductInformationLabel[]> {
    for (const item of dto.items) {
      const existing = await this.productInformationLabelsRepository.findByRefId(item.refId);
      if (!existing) {
        throw new NotFoundException(`Product information label with refId ${item.refId} not found`);
      }
    }

    const sortOrders = dto.items.map((item) => item.sortOrder);
    if (new Set(sortOrders).size !== sortOrders.length) {
      throw new BadRequestException('Sort order values must be unique');
    }

    const updated = await this.productInformationLabelsRepository.updateSortOrders(
      dto.items.map((item) => ({ refId: item.refId, sortOrder: item.sortOrder })),
    );

    for (const item of dto.items) {
      await this.productInformationLabelsRepository.updateByRefId(item.refId, { updatedBy });
    }

    await this.invalidatePublicProductCaches('reordered');
    return mapProductInformationLabelEntitiesToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.productInformationLabelsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product information label with refId ${refId} not found`);
    }
    await this.productInformationLabelsRepository.softDeleteByRefId(refId);
    await this.invalidatePublicProductCaches('deleted', refId);
  }

  /**
   * Public PDP caches enriched `productInformation` (labels + sort). Master label
   * changes rewrite DB JSON but must also bust those caches.
   */
  private async invalidatePublicProductCaches(
    action: string,
    refId?: string,
  ): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.products.listPattern(),
        CacheKeys.products.detailPattern(),
        CacheKeys.publicProducts.listPattern(),
        CacheKeys.publicProducts.variantSearchPattern(),
        CacheKeys.publicProducts.detailPattern(),
        ...CacheKeys.publicProducts.recommendationPatterns(),
        CacheKeys.publicBundles.listPattern(),
        CacheKeys.publicBundles.detailPattern(),
        CacheKeys.homepage.bestSellersPattern(),
        CacheKeys.homepage.sectionsPattern(),
      ],
    });
    this.logger.log(
      `Product information label cache invalidated (${action})${refId ? ` refId=${refId}` : ''}`,
    );
  }
}
