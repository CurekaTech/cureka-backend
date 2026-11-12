import { BadRequestException } from '@nestjs/common';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderSource } from '../enums/order-source.enum';
import { OrdersService } from './orders.service';

describe('OrdersService.checkout pincode gate', () => {
  const checkoutService = {
    assertCartDeliverableToAddress: jest.fn(),
    validateCheckout: jest.fn(),
  };
  const checkoutResolver = {
    resolveProvider: jest.fn(),
  };
  const cartService = {
    setPreferredOrderSource: jest.fn(),
  };
  const paymentRequestsService = {
    checkoutFromCart: jest.fn(),
    checkoutModalFromCart: jest.fn(),
  };

  const service = new OrdersService(
    ...([
      {},
      {},
      {},
      {},
      {},
      cartService,
      checkoutService,
      checkoutResolver,
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      paymentRequestsService,
      {},
      {},
      {},
      {},
      { recordWrite: jest.fn() },
      {},
      {},
      {},
      { find: jest.fn() },
    ] as unknown as ConstructorParameters<typeof OrdersService>),
  );

  const summary = { items: [{ variantId: 'var-1' }], subtotal: 100 };

  beforeEach(() => {
    jest.clearAllMocks();
    checkoutResolver.resolveProvider.mockResolvedValue('legacy');
    checkoutService.assertCartDeliverableToAddress.mockResolvedValue(undefined);
    checkoutService.validateCheckout.mockResolvedValue(summary);
    cartService.setPreferredOrderSource.mockResolvedValue(undefined);
  });

  it('requires an address on the existing non-optional path before any pincode check', async () => {
    await expect(service.checkout('user-1', {})).rejects.toThrow(
      'addressId is required for this checkout path',
    );
    expect(checkoutService.assertCartDeliverableToAddress).not.toHaveBeenCalled();
    expect(checkoutService.validateCheckout).not.toHaveBeenCalled();
    expect(paymentRequestsService.checkoutFromCart).not.toHaveBeenCalled();
  });

  it('skips product checks and continues when GoKwik checkout has no address', async () => {
    checkoutResolver.resolveProvider.mockResolvedValue('gokwik');

    const result = await service.checkout('user-1', {});

    expect(checkoutService.assertCartDeliverableToAddress).toHaveBeenCalledWith('user-1', undefined);
    expect(checkoutService.validateCheckout).toHaveBeenCalledWith('user-1', {}, { applyPromotionalOffers: false });
    expect(result).toEqual({
      ...summary,
      checkoutProvider: 'gokwik',
      orderSource: null,
    });
    expect(paymentRequestsService.checkoutFromCart).not.toHaveBeenCalled();
    expect(paymentRequestsService.checkoutModalFromCart).not.toHaveBeenCalled();
  });

  it('does not price the cart, update order source, or start payment when pincode validation fails', async () => {
    checkoutService.assertCartDeliverableToAddress.mockRejectedValue(
      new BadRequestException({
        code: 'PRODUCTS_NOT_DELIVERABLE_TO_PINCODE',
        message: 'Some products in your cart are not deliverable to pincode 380001.',
      }),
    );

    await expect(
      service.checkout('user-1', {
        addressId: 'address-1',
        orderSource: OrderSource.WEBSITE,
        paymentMethod: OrderPaymentMethod.COD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(checkoutService.validateCheckout).not.toHaveBeenCalled();
    expect(cartService.setPreferredOrderSource).not.toHaveBeenCalled();
    expect(paymentRequestsService.checkoutFromCart).not.toHaveBeenCalled();
    expect(paymentRequestsService.checkoutModalFromCart).not.toHaveBeenCalled();
  });

  it('returns the existing checkout summary when every product is deliverable', async () => {
    const result = await service.checkout('user-1', {
      addressId: 'address-1',
      orderSource: OrderSource.WEBSITE,
      paymentMethod: OrderPaymentMethod.COD,
    });

    expect(checkoutService.assertCartDeliverableToAddress).toHaveBeenCalledWith(
      'user-1',
      'address-1',
    );
    expect(checkoutService.validateCheckout).toHaveBeenCalledWith(
      'user-1',
      {
        addressId: 'address-1',
        orderSource: OrderSource.WEBSITE,
        paymentMethod: OrderPaymentMethod.COD,
      },
      { applyPromotionalOffers: true },
    );
    expect(cartService.setPreferredOrderSource).toHaveBeenCalledWith('user-1', OrderSource.WEBSITE);
    expect(result).toEqual({
      ...summary,
      checkoutProvider: 'legacy',
      orderSource: OrderSource.WEBSITE,
    });
  });
});
