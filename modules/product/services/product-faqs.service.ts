import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { generateUniqueRefId } from '@packages/common';
import { ProductFaqEntity } from '../entities/product-faq.entity';
import { CreateProductFaqDto } from '../dto/product-support.dto';
import { ProductFaqStatus } from '../enums/product-faq-status.enum';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';
import { ProductsRepository } from '../repositories/products.repository';

@Injectable()
export class ProductFaqsService {
  constructor(
    @InjectRepository(ProductFaqEntity)
    private readonly productFaqRepo: Repository<ProductFaqEntity>,
    private readonly dataSource: DataSource,
    private readonly productsRepository: ProductsRepository,
    private readonly relationsRepository: ProductRelationsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createProductFaq(dto: CreateProductFaqDto, createdBy: string) {
    const entity = this.productFaqRepo.create({
      question: dto.question,
      answer: dto.answer,
      status: dto.status ?? ProductFaqStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.question.slice(0, 20), async (refId) => {
        return (await this.productFaqRepo.count({ where: { refId } })) > 0;
      }),
      createdBy,
    });
    return this.productFaqRepo.save(entity);
  }

  async mapFaqsToProduct(productRefId: string, faqRefIds: string[], updatedBy: string): Promise<void> {
    const product = await this.productsRepository.findByRefId(productRefId);
    if (!product) throw new NotFoundException(`Product with refId ${productRefId} not found`);

    const productFaqIds: string[] = [];
    for (const refId of faqRefIds) {
      const productFaq = await this.relationsRepository.requireProductFaqByRefId(refId);
      productFaqIds.push(productFaq.id);
    }

    await this.dataSource.transaction(async (manager) => {
      await this.relationsRepository.syncProductFaqs(manager, product.id, productFaqIds);
    });
    await this.productsRepository.updateByRefId(productRefId, { updatedBy });
    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(productRefId, 'updated'),
    );
  }
}
