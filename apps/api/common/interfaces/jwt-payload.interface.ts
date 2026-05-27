export interface IJwtPayload {
  /** Admin user UUID */
  sub: string;
  email: string;
  role: string;
}
