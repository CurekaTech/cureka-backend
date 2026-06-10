import { IUser } from '@modules/users/interfaces/user.interface';
import { IUserSessionContext } from '../interfaces/session.interface';

type DateLike = Date | string | undefined;

const reviveDate = (value: DateLike): Date | undefined => {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
};

const reviveUserProfile = (profile: IUser): IUser => ({
  ...profile,
  lastLoginAt: reviveDate(profile.lastLoginAt),
  dateOfBirth: reviveDate(profile.dateOfBirth),
  createdAt: reviveDate(profile.createdAt) ?? new Date(),
  updatedAt: reviveDate(profile.updatedAt) ?? new Date(),
  deletedAt: reviveDate(profile.deletedAt),
});

/** Restores Date fields after JSON round-trip through Redis. */
export const reviveSessionContextFromCache = (
  cached: IUserSessionContext,
): IUserSessionContext => ({
  ...cached,
  profile: reviveUserProfile(cached.profile),
});
