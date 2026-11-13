import { BadRequestException } from '@nestjs/common';
import { CashfreeHostedCheckoutController } from './cashfree-hosted-checkout.controller';

describe('CashfreeHostedCheckoutController', () => {
  const cashfree = { getEnv: jest.fn(() => 'production') };
  const controller = new CashfreeHostedCheckoutController(cashfree as never);

  it('rejects a missing session id', () => {
    expect(() => controller.hostedCheckout(undefined, { type: () => ({ send: jest.fn() }) } as never)).toThrow(
      BadRequestException,
    );
  });

  it('sends an auto-post HTML form to Cashfree sessions checkout', () => {
    const send = jest.fn();
    const type = jest.fn(() => ({ send }));
    controller.hostedCheckout('session_abc', { type } as never);
    expect(type).toHaveBeenCalledWith('text/html; charset=utf-8');
    expect(String(send.mock.calls[0][0])).toContain('https://api.cashfree.com/pg/view/sessions/checkout');
    expect(String(send.mock.calls[0][0])).toContain('session_abc');
  });
});
