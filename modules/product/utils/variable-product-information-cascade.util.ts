import { CreateProductDto } from '../dto/product.dto';
import { ProductEntity } from '../entities/product.entity';
import { IProductInformationItem } from '../interfaces/product-information.interface';

const cloneProductInformation = (
  items: IProductInformationItem[] | undefined,
): IProductInformationItem[] =>
  items?.length ? (JSON.parse(JSON.stringify(items)) as IProductInformationItem[]) : [];

/**
 * When admin updates product-level productInformation on a variable product, copy the
 * normalized JSON onto every variant.
 */
export const pickVariableProductInformationCascade = (
  dto: Partial<CreateProductDto>,
  payload: Partial<ProductEntity>,
): IProductInformationItem[] | null => {
  if (dto.productInformation === undefined) {
    return null;
  }

  return cloneProductInformation(payload.productInformation ?? []);
};
