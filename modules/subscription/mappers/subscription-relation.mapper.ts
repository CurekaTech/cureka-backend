import { UserEntity } from '@modules/users/entities/user.entity';
import { ISubscriptionUserSummary } from '../interfaces/product-subscription.interface';

export const mapSubscriptionUserSummary = (user: UserEntity): ISubscriptionUserSummary => ({
  id: user.id,
  refId: user.refId,
  firstName: user.firstName ?? null,
  lastName: user.lastName ?? null,
  email: user.email ?? null,
  mobileNumber: user.mobileNumber ?? null,
});
