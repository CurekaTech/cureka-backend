export interface IResolvedProductMasters {
  productNatureId: string;
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  brandId: string | null;
  manufacturerId: string | null;
  packerId: string | null;
  importerId: string | null;
  healthConcernIds: string[];
  faqIds: string[];
}

export interface IProductCreationContext {
  dto: import('../dto/product.dto').CreateProductDto;
  masters: IResolvedProductMasters;
  createdBy: string;
}
