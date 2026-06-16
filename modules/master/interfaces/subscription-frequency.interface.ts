import { MasterStatus } from '../enums/master-status.enum';
import { SubscriptionFrequencyUnit } from '../enums/subscription-frequency-unit.enum';

export interface ISubscriptionFrequency {
  id: string;
  refId: string;
  name: string;
  value: number;
  unit: SubscriptionFrequencyUnit;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
