import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FastifyRequest } from 'fastify';
import { TestimonialUpdatedEvent, CacheDomainAction, EVENTS } from '@packages/events';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  formatValidationErrorMessage,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { plainToInstance } from 'class-transformer';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { validate } from 'class-validator';
import { TestimonialRepository } from '../repositories/testimonial.repository';
import {
  CreateTestimonialDto,
  PublicTestimonialQueryDto,
  TestimonialQueryDto,
  UpdateTestimonialDto,
  UpdateTestimonialStatusDto,
} from '../dto/testimonial.dto';
import {
  IStorefrontTestimonial,
  ITestimonial,
} from '../interfaces/testimonial.interface';
import {
  mapTestimonialEntitiesToResponse,
  mapTestimonialEntityToResponse,
  mapTestimonialToStorefrontItem,
} from '../mappers/testimonial.mapper';
import { TestimonialEntity } from '../entities/testimonial.entity';
import { MasterStatus } from '../enums/master-status.enum';

const TESTIMONIAL_MEDIA_FIELDS = ['image'] as const;

const TESTIMONIAL_UPLOAD_FIELDS = {
  imageFile: UploadFolder.IMAGES,
} as const;

@Injectable()
export class TestimonialService {
  constructor(
    private readonly testimonialRepository: TestimonialRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<ITestimonial> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateTestimonialDto,
      TESTIMONIAL_UPLOAD_FIELDS,
    );

    return this.create(dto, createdBy, uploadedUrls['imageFile']);
  }

  async createFromJson(body: unknown, createdBy: string): Promise<ITestimonial> {
    const dto = await this.validateJsonDto(CreateTestimonialDto, body);
    return this.create(dto, createdBy);
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<ITestimonial> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateTestimonialDto,
      TESTIMONIAL_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, uploadedUrls['imageFile']);
  }

  async updateFromJson(
    refId: string,
    body: unknown,
    updatedBy: string,
  ): Promise<ITestimonial> {
    const dto = await this.validateJsonDto(UpdateTestimonialDto, body);
    return this.update(refId, dto, updatedBy);
  }

  async create(
    dto: CreateTestimonialDto,
    createdBy: string,
    uploadedImage?: string,
  ): Promise<ITestimonial> {
    const normalized = this.normalizeDto(dto, uploadedImage);

    const entity = await this.testimonialRepository.create({
      name: normalized.name,
      city: normalized.city,
      rating: normalized.rating,
      description: normalized.description,
      image: normalized.image,
      sortOrder: normalized.sortOrder,
      status: normalized.status,
      refId: await generateUniqueRefId(
        dto.name,
        (id) => this.testimonialRepository.existsByRefId(id),
      ),
      createdBy,
    });

    await this.emitTestimonialUpdated(entity.refId, 'created');
    return this.enrichItem(mapTestimonialEntityToResponse(entity));
  }

  async findAll(query: TestimonialQueryDto): Promise<PaginatedResult<ITestimonial>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.testimonialRepository.findAllPaginated({
      ...paginationOptions,
      status: query.status,
    });

    const result = buildPaginatedResult(
      mapTestimonialEntitiesToResponse(data),
      total,
      paginationOptions,
    );

    return this.storageUrlEnricher.enrichPaginated(result, [...TESTIMONIAL_MEDIA_FIELDS]);
  }

  async findOne(refId: string): Promise<ITestimonial> {
    const entity = await this.testimonialRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Testimonial with refId ${refId} not found`);
    }
    return this.enrichItem(mapTestimonialEntityToResponse(entity));
  }

  async update(
    refId: string,
    dto: UpdateTestimonialDto,
    updatedBy: string,
    uploadedImage?: string,
  ): Promise<ITestimonial> {
    const existing = await this.testimonialRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Testimonial with refId ${refId} not found`);
    }

    const merged: CreateTestimonialDto = {
      name: dto.name ?? existing.name,
      city: dto.city ?? existing.city,
      rating: dto.rating ?? Number(existing.rating),
      description: dto.description ?? existing.description,
      sortOrder: dto.sortOrder ?? existing.sortOrder,
      status: dto.status ?? existing.status,
    };

    const normalized = this.normalizeDto(merged, uploadedImage, existing.image);

    const result = await this.testimonialRepository.updateByRefId(refId, {
      name: normalized.name,
      city: normalized.city,
      rating: normalized.rating,
      description: normalized.description,
      image: normalized.image,
      sortOrder: normalized.sortOrder,
      status: normalized.status,
      updatedBy,
    });

    if (!result) {
      throw new NotFoundException(`Testimonial with refId ${refId} not found after update`);
    }

    await this.emitTestimonialUpdated(refId, 'updated');
    return this.enrichItem(mapTestimonialEntityToResponse(result));
  }

  async updateStatus(
    refId: string,
    dto: UpdateTestimonialStatusDto,
    updatedBy: string,
  ): Promise<ITestimonial> {
    const existing = await this.testimonialRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Testimonial with refId ${refId} not found`);
    }

    const updated = await this.testimonialRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(
        `Testimonial with refId ${refId} not found after status update`,
      );
    }

    await this.emitTestimonialUpdated(refId, 'status_updated');
    return this.enrichItem(mapTestimonialEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.testimonialRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Testimonial with refId ${refId} not found`);
    }

    await this.testimonialRepository.softDeleteByRefId(refId);
    await this.emitTestimonialUpdated(refId, 'deleted');
  }

  async findAllPublic(
    query: PublicTestimonialQueryDto,
  ): Promise<PaginatedResult<IStorefrontTestimonial>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.testimonialRepository.findAllPaginated({
      ...pagination,
      status: MasterStatus.ACTIVE,
    });

    const storefrontItems = data.map(mapTestimonialToStorefrontItem);
    const enriched = await this.storageUrlEnricher.enrichManyFields(
      storefrontItems,
      [...TESTIMONIAL_MEDIA_FIELDS],
    );

    const publicItems = enriched.map((item) => ({
      refId: item.refId,
      name: item.name,
      city: item.city,
      rating: item.rating,
      description: item.description,
      image: item.image,
      sortOrder: item.sortOrder,
    }));

    return buildPaginatedResult(publicItems, total, pagination);
  }

  async loadTestimonialsUncached(limit?: number): Promise<IStorefrontTestimonial[]> {
    const items = await this.testimonialRepository.findActiveForStorefront(limit);
    return items.map(mapTestimonialToStorefrontItem);
  }

  private normalizeDto(
    dto: CreateTestimonialDto,
    uploadedImage?: string,
    existingImage?: TestimonialEntity['image'],
  ): {
    name: string;
    city: string;
    rating: number;
    description: string;
    image: ReturnType<StorageUrlEnricher['persist']>;
    sortOrder: number;
    status: MasterStatus;
  } {
    const name = dto.name?.trim();
    const city = dto.city?.trim();
    const description = dto.description?.trim();

    if (!name) {
      throw new BadRequestException('Name is required');
    }
    if (!city) {
      throw new BadRequestException('City is required');
    }
    if (!description) {
      throw new BadRequestException('Description is required');
    }

    const rating = Number(dto.rating);
    if (Number.isNaN(rating) || rating < 0 || rating > 5) {
      throw new BadRequestException('Rating must be between 0 and 5');
    }

    let image = existingImage ? this.storageUrlEnricher.persist(existingImage) : null;
    if (uploadedImage) {
      image = this.storageUrlEnricher.persist(uploadedImage);
    }

    return {
      name,
      city,
      rating,
      description,
      image,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? MasterStatus.ACTIVE,
    };
  }

  private enrichItem(item: ITestimonial): Promise<ITestimonial> {
    if (!item.image) {
      return Promise.resolve(item);
    }
    return this.storageUrlEnricher.enrichFields(item, [...TESTIMONIAL_MEDIA_FIELDS]);
  }

  private async emitTestimonialUpdated(
    refId: string,
    action: CacheDomainAction,
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.TESTIMONIAL_UPDATED,
      new TestimonialUpdatedEvent(refId, action),
    );
  }

  private async validateJsonDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    body: unknown,
  ): Promise<T> {
    const instance = plainToInstance(dtoClass, body, { enableImplicitConversion: false });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException(formatValidationErrorMessage(errors));
    }

    return instance;
  }
}
