import { ReasonMasterEntity } from '@modules/master/entities/reason-master.entity';

export const mapStorefrontOrderSupportReason = (entity: ReasonMasterEntity) => ({
  refId: entity.refId,
  title: entity.title,
  code: entity.code,
  description: entity.description,
  pickupMode: entity.pickupMode,
  isMandatory: entity.isMandatory,
  commentsRequired: entity.commentsRequired,
  imagesRequired: entity.imagesRequired,
  videoRequired: entity.videoRequired,
  sortOrder: entity.sortOrder,
});
