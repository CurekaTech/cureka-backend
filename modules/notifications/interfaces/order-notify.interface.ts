export interface IOrderNotifyInput {
  phoneNumber: string;
  customerName: string;
  orderNumber: string;
  grandTotal: string;
  paymentMethod: string;
  orderStatus: string;
  source: string;
  cancelReason?: string;
}
