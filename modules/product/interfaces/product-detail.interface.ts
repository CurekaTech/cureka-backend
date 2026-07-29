import { IBrand } from '@modules/master/interfaces/brand.interface';
import { ICategoryForProduct } from '@modules/master/interfaces/category.interface';
import { ICountry } from '@modules/master/interfaces/country.interface';
import { IHealthConcern } from '@modules/master/interfaces/health-concern.interface';
import { IImporter } from '@modules/master/interfaces/importer.interface';
import { IManufacturer } from '@modules/master/interfaces/manufacturer.interface';
import { IPacker } from '@modules/master/interfaces/packer.interface';
import { IProductNature } from '@modules/master/interfaces/product-nature.interface';
import { IProduct } from './product.interface';

export interface IProductCategoryHierarchyDetail {
  category: ICategoryForProduct | null;
  subCategory: ICategoryForProduct | null;
  subSubCategory: ICategoryForProduct | null;
  subSubSubCategory: ICategoryForProduct | null;
  sortOrder: number;
}

export interface IProductDetail extends IProduct {
  category: ICategoryForProduct | null;
  subCategory: ICategoryForProduct | null;
  subSubCategory: ICategoryForProduct | null;
  subSubSubCategory: ICategoryForProduct | null;
  /** Full nested objects for every category hierarchy (same order as `categories`). */
  categoryHierarchies: IProductCategoryHierarchyDetail[];
  brand: IBrand | null;
  productNature: IProductNature | null;
  manufacturer: IManufacturer | null;
  packer: IPacker | null;
  importer: IImporter | null;
  countryOfOrigin: ICountry | null;
  healthConcerns: IHealthConcern[];
}
