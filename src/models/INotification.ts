import {
  IAmount,
  IPaymentMethodData,
  IPaymentStatus,
  IReceipt,
  IWebHookEvent,
} from '@a2seven/yoo-checkout';

export interface INotification {
  type: 'notification';
  event: IWebHookEvent;
  object: {
    id: string;
    status: IPaymentStatus;
    amount: IAmount;
    description: string;
    recipient: IReceipt;
    payment_method: IPaymentMethodData;
    created_at: string;
    expires_at: string;
    test: boolean;
    paid: boolean;
    refundable: boolean;
    metadata: { orderId: number; userId: number; planId: number };
    authorization_details: {
      rrn: string;
      auth_code: string;
      three_d_secure: any;
    };
  };
}
