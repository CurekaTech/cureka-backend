import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
} from '../dto/product-information-label.dto';
import { IProductInformationLabel } from '../interfaces/product-information-label.interface';
import {
  mapProductInformationLabelEntitiesToResponse,
  mapProductInformationLabelEntityToResponse,
} from '../mappers/product-information-label.mapper';
import { ProductInformationLabelsRepository } from '../repositories/product-information-labels.repository';

@Injectable()
export class ProductInformationLabelsService {
  constructor(
    private readonly productInformationLabelsRepository: ProductInformationLabelsRepository,
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

    const updated = await this.productInformationLabelsRepository.updateByRefId(refId, {
      ...dto,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(
        `Product information label with refId ${refId} not found after update`,
      );
    }

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

  async remove(refId: string): Promise<void> {
    const existing = await this.productInformationLabelsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product information label with refId ${refId} not found`);
    }
    await this.productInformationLabelsRepository.softDeleteByRefId(refId);
  }
}
