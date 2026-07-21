import { TestimonialEntity } from '../entities/testimonial.entity';
import {
  IStorefrontTestimonial,
  ITestimonial,
} from '../interfaces/testimonial.interface';

export const mapTestimonialEntityToResponse = (
  entity: TestimonialEntity,
): ITestimonial =>
  ({
    id: entity.id,
    refId: entity.refId,
    name: entity.name,
    city: entity.city,
    rating: Number(entity.rating),
    description: entity.description,
    image: entity.image,
    sortOrder: entity.sortOrder,
    status: entity.status,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  }) as unknown as ITestimonial;

export const mapTestimonialEntitiesToResponse = (
  entities: TestimonialEntity[],
): ITestimonial[] => entities.map(mapTestimonialEntityToResponse);

export const mapTestimonialToStorefrontItem = (
  entity: TestimonialEntity,
): IStorefrontTestimonial =>
  ({
    refId: entity.refId,
    name: entity.name,
    city: entity.city,
    rating: Number(entity.rating),
    description: entity.description,
    image: entity.image,
    sortOrder: entity.sortOrder,
  }) as unknown as IStorefrontTestimonial;
