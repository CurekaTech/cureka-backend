import { ConflictException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
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
  constructor(
    private readonly productInformationLabelsRepository: ProductInformationLabelsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly productVariantsRepository: ProductVariantsRepository,
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

    if (dto.name !== undefined && dto.name !== existing.name) {
      if (await this.productInformationLabelsRepository.existsByName(dto.name, refId)) {
        throw new ConflictException(
          `A product information label with name "${dto.name}" already exists`,
        );
      }
    }

    const oldName = existing.name;
    const nextName = dto.name;

    const updated = await this.productInformationLabelsRepository.transaction(async (manager) => {
      const updatedLabel = await this.productInformationLabelsRepository.updateByRefId(
        refId,
        {
          ...dto,
          updatedBy,
        },
      );

      if (!updatedLabel) {
        throw new NotFoundException(
          `Product information label with refId ${refId} not found after update`,
        );
      }

      if (nextName !== undefined && nextName !== oldName) {
        await this.productsRepository.renameProductInformationLabel(
          oldName,
          nextName,
          updatedBy,
          manager,
        );
        await this.productVariantsRepository.renameProductInformationLabel(
          oldName,
          nextName,
          updatedBy,
          manager,
        );
      }

      return updatedLabel;
    });

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

    return mapProductInformationLabelEntitiesToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.productInformationLabelsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product information label with refId ${refId} not found`);
    }
    await this.productInformationLabelsRepository.softDeleteByRefId(refId);
  }
}
