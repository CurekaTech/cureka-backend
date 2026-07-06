import { IAttribute } from '@modules/master/interfaces/attribute.interface';
import { IBrand } from '@modules/master/interfaces/brand.interface';
import { ICategory } from '@modules/master/interfaces/category.interface';
import { ICountry } from '@modules/master/interfaces/country.interface';
import { IHealthConcern } from '@modules/master/interfaces/health-concern.interface';
import { IImporter } from '@modules/master/interfaces/importer.interface';
import { IManufacturer } from '@modules/master/interfaces/manufacturer.interface';
import { IPacker } from '@modules/master/interfaces/packer.interface';
import { IUnit } from '@modules/master/interfaces/unit.interface';
import { IWellnessGoal } from '@modules/master/interfaces/wellness-goal.interface';
import { IProductInformationLabel } from './product-information-label.interface';
import { IProductTagMaster } from './product-tag-master.interface';

export interface IProductWizardBootstrap {
  brands: IBrand[];
  categories: ICategory[];
  healthConcerns: IHealthConcern[];
  wellnessGoals: IWellnessGoal[];
  productTags: IProductTagMaster[];
  units: IUnit[];
  attributes: IAttribute[];
  productInformationLabels: IProductInformationLabel[];
  manufacturers: IManufacturer[];
  packers: IPacker[];
  importers: IImporter[];
  countries: ICountry[];
}
