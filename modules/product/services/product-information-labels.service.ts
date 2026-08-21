import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
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
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<IProductInformationLabel>> {
    const paginationOptions = buildPaginationOptions(query);
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
    }
    if (previousName && nextName && previousName.toLowerCase() !== nextName.toLowerCase()) {
      cascadeFromNames.add(previousName);
    }
    // Stuck repair: master already has the new name, but JSON still has previousName.
    if (previousName && nextName === undefined && previousName.toLowerCase() !== oldName.toLowerCase()) {
      cascadeFromNames.add(previousName);
    }

    const targetName = nextName ?? oldName;

    const { previousName: _ignoredPreviousName, ...labelFields } = dto;

    const updated = await this.productInformationLabelsRepository.transaction(async (manager) => {
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

      let productsUpdated = 0;
      let variantsUpdated = 0;
      for (const fromName of cascadeFromNames) {
        productsUpdated += await this.productsRepository.renameProductInformationLabel(
          fromName,
          targetName,
          updatedBy,
          manager,
        );
        variantsUpdated += await this.productVariantsRepository.renameProductInformationLabel(
          fromName,
          targetName,
          updatedBy,
          manager,
        );
      }

      if (cascadeFromNames.size > 0) {
        this.logger.log(
          `Cascaded product information label rename → "${targetName}" ` +
            `from=[${[...cascadeFromNames].join(', ')}] ` +
            `(products=${productsUpdated}, variants=${variantsUpdated})`,
        );
        if (productsUpdated === 0 && variantsUpdated === 0) {
          this.logger.warn(
            `No products/variants contained labels [${[...cascadeFromNames].join(', ')}]. ` +
              `If JSON still shows an old label, retry with body.previousName set to that exact text.`,
          );
        }
      }

      return updatedLabel;
    });

    await this.invalidatePublicProductCaches('updated', refId);
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
