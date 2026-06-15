import { ProductStatus } from '../enums/product-status.enum';
import { ProductCreationStep } from '../enums/product-creation-step.enum';
import { IProduct } from './product.interface';

export interface IWizardStepStatus {
  step: ProductCreationStep;
  label: string;
  completed: boolean;
  missingFields: string[];
}

export interface IProductWizardState {
  refId: string;
  status: ProductStatus;
  creationStep: number;
  rejectionReason: string | null;
  steps: IWizardStepStatus[];
  canSubmit: boolean;
  canPublish: boolean;
  product: IProduct;
}
