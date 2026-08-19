import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ProductSubscriptionConfigEntity } from '../entities/product-subscription-config.entity';

@Injectable()
export class ProductSubscriptionConfigsRepository {
  constructor(
    @InjectRepository(ProductSubscriptionConfigEntity)
    private readonly repo: Repository<ProductSubscriptionConfigEntity>,
  ) {}

  create(
    data: Partial<ProductSubscriptionConfigEntity>,
    manager?: EntityManager,
  ): Promise<ProductSubscriptionConfigEntity> {
    const repository = manager ? manager.getRepository(ProductSubscriptionConfigEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<ProductSubscriptionConfigEntity | null> {
    const repository = manager ? manager.getRepository(ProductSubscriptionConfigEntity) : this.repo;
    return repository.findOne({ where: { id } });
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<ProductSubscriptionConfigEntity | null> {
    const repository = manager ? manager.getRepository(ProductSubscriptionConfigEntity) : this.repo;
    return repository.findOne({ where: { refId } });
  }

  findByProductAndVariant(
    productId: string,
    productVariantId: string | null,
    manager?: EntityManager,
  ): Promise<ProductSubscriptionConfigEntity | null> {
    const repository = manager ? manager.getRepository(ProductSubscriptionConfigEntity) : this.repo;
    return repository.findOne({
      where: {
        productId,
        productVariantId: productVariantId === null ? IsNull() : productVariantId,
      },
    });
  }

  async findForProductVariant(
    productId: string,
    productVariantId: string | null,
    manager?: EntityManager,
  ): Promise<ProductSubscriptionConfigEntity | null> {
    const variantSpecific = productVariantId
      ? await this.findByProductAndVariant(productId, productVariantId, manager)
      : null;
    if (variantSpecific?.enabled) return variantSpecific;

    const productLevel = await this.findByProductAndVariant(productId, null, manager);
    if (productLevel?.enabled) return productLevel;

    const configs = await this.findByProductId(productId, manager);
    const enabled = configs.find((config) => config.enabled);
    if (enabled) return enabled;

    return variantSpecific ?? productLevel;
  }

  findByProductId(productId: string, manager?: EntityManager): Promise<ProductSubscriptionConfigEntity[]> {
    const repository = manager ? manager.getRepository(ProductSubscriptionConfigEntity) : this.repo;
    return repository.find({ where: { productId }, order: { createdAt: 'ASC' } });
  }

  async updateById(
    id: string,
    data: Partial<ProductSubscriptionConfigEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(ProductSubscriptionConfigEntity) : this.repo;
    await repository.update({ id }, data);
  }

  async softDeleteById(id: string, _deletedBy?: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(ProductSubscriptionConfigEntity) : this.repo;
    await repository.softDelete(id);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
