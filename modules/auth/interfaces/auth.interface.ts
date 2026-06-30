import { IAdminUser } from '@modules/admin-users/interfaces/admin-user.interface';
import { IRole } from '@modules/roles/interfaces/role.interface';
import { IUser } from '@modules/users/interfaces/user.interface';
export type { IJwtPayload, IAdminJwtPayload } from '@packages/auth';

// ── Admin Auth (JWT cookie) ──────────────────────────────────────────────────

export interface IAdminAuthResponse {
  accessToken: string;
  user: IAdminUser;
  role?: IRole;
  permissions: string[];
}

// ── User Auth (opaque session cookie — no JWT) ─────────────────────────────

export interface IUserAuthResponse {
  sessionId: string;
  isRegistered: boolean;
  user: IUser;
  token?: string | null;
}

export interface IGuestAuthResponse {
  sessionId: string;
  user: IUser;
}

export interface IRefreshAuthResponse {
  sessionId: string;
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
