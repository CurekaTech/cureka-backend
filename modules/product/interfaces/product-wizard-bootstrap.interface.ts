import { ProductWizardMasterType } from '../enums/product-wizard-master-type.enum';

export interface IProductWizardBootstrapResponse<T = unknown> {
  type: ProductWizardMasterType;
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}
