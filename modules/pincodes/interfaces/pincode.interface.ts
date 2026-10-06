export interface IPincodeSummary {
  pincode: string;
  city: string;
  state: string;
}

export interface IStorefrontPincodeScope {
  /** Canonical pincode id, or null when the shopper has not selected one. */
  pincodeId: string | null;
  pincode: string | null;
}

export interface IProductPincodeAvailability {
  isPincodeManaged: boolean;
  pincodes: IPincodeSummary[];
}
