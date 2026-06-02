import { AttributeDataType } from '../enums/attribute-data-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

export interface IAttribute {
  id: string;
  refId: string;
  name: string;
  dataType: AttributeDataType | null;
  values: string[] | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
