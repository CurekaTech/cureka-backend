import { IAdminUser } from '@modules/admin-users/interfaces/admin-user.interface';

export interface IJwtPayload {
  /** Subject — the authenticated user's UUID */
  sub: string;
  email: string;
  role: string;
}

export interface IAdminAuthResponse {
  accessToken: string;
  user: IAdminUser;
}
