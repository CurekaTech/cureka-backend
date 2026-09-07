export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string | string[];
  statusCode: number;
  timestamp: string;
  path: string;
  code?: string;
  minimumOrderAmount?: number;
  maximumOrderAmount?: number;
}

export const buildSuccessResponse = <T>(data: T, message?: string): ApiResponse<T> => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString(),
});
