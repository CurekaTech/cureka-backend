export interface IDeviceContext {
  deviceId: string;
  deviceName?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
}

export interface IUserSessionInfo {
  id: string;
  deviceName?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  lastActivity: Date;
  createdAt: Date;
  isCurrent: boolean;
}

/** Opaque cookie session — no JWT. */
export interface ISessionCookieResult {
  sessionToken: string;
  sessionId: string;
}

import { UserStatus } from '@modules/users/enums/user-status.enum';
import { IUser } from '@modules/users/interfaces/user.interface';

/** Attached to request.user after SessionCookieGuard validates the cookie. */
export interface IUserSessionContext {
  sub: string;
  sessionId: string;
  role: string;
  isGuest: boolean;
  isRegistered: boolean;
  status: UserStatus;
  /** Loaded once during session resolve — avoids a second user query on /auth/me. */
  profile: IUser;
}
