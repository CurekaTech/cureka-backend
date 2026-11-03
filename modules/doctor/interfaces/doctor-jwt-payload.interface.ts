export interface IDoctorJwtPayload {
  sub: string;
  type: 'doctor';
  sessionId: string;
  category: string;
  email?: string;
}
