import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { ProductStatus } from '../enums/product-status.enum';
import { buildSkipTake } from '@packages/database';

export interface ProductListOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  productType?: string;
  status?: ProductStatus;
  categoryId?: string;
  brandId?: string;
  productNatureId?: string;
}

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
  ) {}

  create(data: Partial<ProductEntity>, manager?: EntityManager): Promise<ProductEntity> {
    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    const entity = repository.create(data);
    return repository.save(entity);
  }

  async findByRefId(refId: string, manager?: EntityManager): Promise<ProductEntity | null> {
    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    return repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.productNature', 'productNature')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.subCategory', 'subCategory')
      .leftJoinAndSelect('product.subSubCategory', 'subSubCategory')
      .leftJoinAndSelect('product.subSubSubCategory', 'subSubSubCategory')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.manufacturer', 'manufacturer')
      .leftJoinAndSelect('product.packer', 'packer')
      .leftJoinAndSelect('product.importer', 'importer')
      .leftJoinAndSelect('product.countryOfOrigin', 'countryOfOrigin')
      .leftJoinAndSelect('product.attributeMappings', 'attributeMappings')
      .leftJoinAndSelect('attributeMappings.attribute', 'attribute')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'attribute')
      .leftJoinAndSelect('product.media', 'media')
      .leftJoinAndSelect('product.healthConcernMappings', 'healthConcernMappings')
      .leftJoinAndSelect('healthConcernMappings.healthConcern', 'healthConcern')
      .leftJoinAndSelect('product.tagMappings', 'tagMappings')
      .leftJoinAndSelect('tagMappings.tag', 'tag')
      .leftJoinAndSelect('product.faqMappings', 'faqMappings')
      .leftJoinAndSelect('faqMappings.productFaq', 'productFaq')
      .leftJoinAndSelect('product.bundleItems', 'bundleItems')
      .leftJoinAndSelect('bundleItems.childProduct', 'childProduct')
      .where('product.refId = :refId', { refId })
      .getOne();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo.createQueryBuilder('product').where('product.slug = :slug', { slug });
    if (excludeRefId) {
      qb.andWhere('product.refId != :excludeRefId', { excludeRefId });
    }
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ProductEntity>,
    manager?: EntityManager,
  ): Promise<ProductEntity | null> {
    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    await repository.update({ refId }, data);
    return this.findByRefId(refId, manager);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: ProductListOptions,
  ): Promise<{ data: ProductEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const SORTABLE: Record<string, string> = {
      createdAt: 'product.createdAt',
      name: 'product.name',
      status: 'product.status',
      publishedAt: 'product.publishedAt',
    };
    const sortColumn = (options.sortBy && SORTABLE[options.sortBy]) ?? 'product.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.productNature', 'productNature')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere('(product.name ILIKE :search OR product.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }
    if (options.productType) {
      qb.andWhere('product.productType = :productType', { productType: options.productType });
    }
    if (options.status) {
      qb.andWhere('product.status = :status', { status: options.status });
    }
    if (options.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    if (options.brandId) {
      qb.andWhere('product.brandId = :brandId', { brandId: options.brandId });
    }
    if (options.productNatureId) {
      qb.andWhere('product.productNatureId = :productNatureId', {
        productNatureId: options.productNatureId,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
