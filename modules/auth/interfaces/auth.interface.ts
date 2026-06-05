import { IAdminUser } from '@modules/admin-users/interfaces/admin-user.interface';
import { IUser } from '@modules/users/interfaces/user.interface';

// ── JWT Payload ──────────────────────────────────────────────────────────────

export interface IJwtPayload {
  /** Subject — the authenticated entity's UUID (admin or user) */
  sub: string;
  /** Present only on user tokens — true for guest sessions */
  isGuest?: boolean;
  /** Present only on admin tokens */
  email?: string;
  /** Present only on admin tokens */
  role?: string;
}

/** Narrowed payload for admin-protected routes — email and role are always present in admin JWTs */
export interface IAdminJwtPayload extends IJwtPayload {
  email: string;
  role: string;
}

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
