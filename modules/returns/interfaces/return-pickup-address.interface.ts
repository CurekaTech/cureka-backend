/** Address the courier collects the returned item from. */
export interface IReturnPickupAddress {
  recipientName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}
