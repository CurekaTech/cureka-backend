import { ReasonMasterEntity } from '../entities/reason-master.entity';
import { IReasonMaster } from '../interfaces/reason-master.interface';

export const mapReasonMasterEntityToResponse = (
  entity: ReasonMasterEntity,
): IReasonMaster => ({
  id: entity.id,
  refId: entity.refId,
  title: entity.title,
  code: entity.code,
  description: entity.description,
  internalDescription: entity.internalDescription,
  workflows: entity.workflows ?? [],
  categoryRefIds: entity.categoryRefIds ?? [],
  skuRefs: entity.skuRefs ?? [],
  pickupMode: entity.pickupMode,
  isMandatory: entity.isMandatory,
  commentsRequired: entity.commentsRequired,
  imagesRequired: entity.imagesRequired,
  videoRequired: entity.videoRequired,
  qcRequired: entity.qcRequired,
  autoApprovalEligible: entity.autoApprovalEligible,
  minImages: entity.minImages,
  maxImages: entity.maxImages,
  minVideos: entity.minVideos,
  maxVideos: entity.maxVideos,
  isCustomerVisible: entity.isCustomerVisible,
  sortOrder: entity.sortOrder,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapReasonMasterEntitiesToResponse = (
  entities: ReasonMasterEntity[],
): IReasonMaster[] => entities.map(mapReasonMasterEntityToResponse);
