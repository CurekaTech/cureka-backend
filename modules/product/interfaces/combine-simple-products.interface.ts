import { AttributeDataType } from '@modules/master/enums/attribute-data-type.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductStatus } from '../enums/product-status.enum';

export interface ICombinePreviewProduct {
  productRefId: string;
  name: string;
  status: ProductStatus;
  variantId: string;
  sku: string;
  externalProductId: string | null;
  sellingPrice: string;
  stock: number;
  outOfStock: boolean;
  brandId: string | null;
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
}

export interface ICombinePreviewAttribute {
  refId: string;
  name: string;
  dataType: AttributeDataType | null;
  values: string[] | null;
  status: MasterStatus;
}

export interface ICombineSimpleProductsPreview {
  products: ICombinePreviewProduct[];
  attributes: ICombinePreviewAttribute[];
}

export interface ICombineSimpleProductsResult {
  targetProductRefId: string;
  productType: 'variable';
  variantIds: string[];
  movedProductRefIds: string[];
}
