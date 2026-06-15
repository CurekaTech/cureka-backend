import { EntityManager } from 'typeorm';
import { ProductEntity } from '../../entities/product.entity';
import { ProductType } from '../../enums/product-type.enum';
import { CreateProductDto } from '../../dto/product.dto';
import { IResolvedProductMasters } from '../../interfaces/product-creation-context.interface';

export interface IProductCreationStrategy {
  supports(productType: ProductType): boolean;
  createVariants(
    manager: EntityManager,
    product: ProductEntity,
    dto: CreateProductDto,
    masters: IResolvedProductMasters,
    attributeIdByRefId: Map<string, string>,
  ): Promise<void>;
}
