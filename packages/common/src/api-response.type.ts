export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface UnavailableCheckoutComponent {
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string;
}

export interface UnavailableCheckoutProduct {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  pincode: string;
  unavailableComponents?: UnavailableCheckoutComponent[];
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
  pincode?: string;
  unavailableProducts?: UnavailableCheckoutProduct[];
}

export const buildSuccessResponse = <T>(data: T, message?: string): ApiResponse<T> => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString(),
});
