import { IAdminUser } from '@modules/admin-users/interfaces/admin-user.interface';
import { IRole } from '@modules/roles/interfaces/role.interface';
import { IUser } from '@modules/users/interfaces/user.interface';
import { MenuItem } from '../services/admin-auth.service';
export type { IJwtPayload, IAdminJwtPayload } from '@packages/auth';

// ── Admin Auth (JWT cookie) ──────────────────────────────────────────────────

export interface IAdminAuthResponse {
  accessToken: string;
  user: IAdminUser;
  role?: IRole;
  permissions: string[];
  menu?: MenuItem[];
}

// ── User Auth (opaque session cookie — no JWT) ─────────────────────────────

export interface IUserAuthResponse {
  sessionId: string;
  isRegistered: boolean;
  user: IUser;
  /**
   * Opaque session token — also set as `user_session` cookie.
   * On verify-otp: present only when `isRegistered` is true; otherwise null until complete-registration.
   * Use as `Authorization: Bearer <token>` for non-cookie clients.
   */
  token: string | null;
}

export interface IGuestAuthResponse {
  sessionId: string;
  user: IUser;
  token: string;
}

export interface IRefreshAuthResponse {
  sessionId: string;
  token: string;
}

export interface IUserAuthTokensResult {
  sessionToken: string;
  sessionId: string;
  isRegistered: boolean;
  user: IUser;
}

export interface IGuestAuthTokensResult {
  sessionToken: string;
  sessionId: string;
  user: IUser;
}

export interface IRefreshTokensResult {
  sessionToken: string;
  sessionId: string;
}
