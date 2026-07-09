import { MasterStatus } from '../enums/master-status.enum';
import { ReasonPickupMode } from '../enums/reason-pickup-mode.enum';
import { ReasonWorkflow } from '../enums/reason-workflow.enum';

export interface IReasonMaster {
  id: string;
  refId: string;
  title: string;
  code: string;
  description: string | null;
  workflows: ReasonWorkflow[];
  categoryRefIds: string[];
  skuRefs: string[];
  pickupMode: ReasonPickupMode;
  isMandatory: boolean;
  commentsRequired: boolean;
  imagesRequired: boolean;
  videoRequired: boolean;
  qcRequired: boolean;
  autoApprovalEligible: boolean;
  sortOrder: number;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
