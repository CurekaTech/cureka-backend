export type UnicommerceAuthStatus = 'SUCCESS' | 'INVALID_CREDENTIALS';

export interface IUnicommerceAuthResponse {
  status: UnicommerceAuthStatus;
  accessToken?: string;
}
