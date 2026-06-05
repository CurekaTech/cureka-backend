import { IAdminUser } from '@modules/admin-users/interfaces/admin-user.interface';
import { IUser } from '@modules/users/interfaces/user.interface';
export type { IJwtPayload, IAdminJwtPayload } from '@packages/auth';

// ── Admin Auth ───────────────────────────────────────────────────────────────

export interface IAdminAuthResponse {
  accessToken: string;
  user: IAdminUser;
}

// ── User Auth ────────────────────────────────────────────────────────────────

export interface IUserAuthResponse {
  token: string;
  isRegistered: boolean;
  user: IUser;
}

export interface IGuestAuthResponse {
  token: string;
  user: IUser;
}
