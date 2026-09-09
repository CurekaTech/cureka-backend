import { CodBlockMatchedBy, CodBlockReasonCode } from '../enums/cod-block-reason-code.enum';
import { CodBlocklistType } from '../enums/cod-blocklist-type.enum';

export type CodBlockEvaluation = {
  blocked: boolean;
  reasonCode: CodBlockReasonCode | null;
  message: string | null;
  matchedBy: CodBlockMatchedBy | null;
  matchedEntryId?: string | null;
};

export type EvaluateCodBlockParams = {
  customerId?: string | null;
  mobileNumber?: string | null;
  pincode?: string | null;
};

export type ICodBlocklistListItem = {
  id: string;
  refId: string;
  type: CodBlocklistType;
  pincode: string | null;
  customerId: string | null;
  customerName: string | null;
  mobileNumber: string | null;
  reason: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ICodBlocklistCustomerSearchItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  mobileNumber: string | null;
  email: string | null;
  alreadyBlocked: boolean;
  activeBlocklistEntryId: string | null;
};
