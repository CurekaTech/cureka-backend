import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SavedForLaterService } from './saved-for-later.service';
import { CART_ITEM_NOT_FOUND, SAVE_FOR_LATER_ITEM_NOT_FOUND } from '../constants/saved-for-later.constants';

const emptyCart = {
  cartId: 'cart-1',
  items: [],
  totalItems: 0,
  subtotal: 0,
};

describe('SavedForLaterService', () => {
  const repository = {
    lockByUserAndIdentity: jest.fn(),
    lockByIdForUser: jest.fn(),
    updateById: jest.fn(),
    create: jest.fn(),
    existsByRefId: jest.fn(),
    deleteById: jest.fn(),
    findByIdForUser: jest.fn(),
    findAllPaginated: jest.fn(),
    countByUserId: jest.fn(),
  };
  const cartItemsRepository = {
    lockOwnedById: jest.fn(),
    deleteById: jest.fn(),
  };
  const cartService = {
    getCart: jest.fn(),
    addItemInTransaction: jest.fn(),
    touchCustomerActivity: jest.fn().mockResolvedValue(undefined),
  };
  const storageUrlEnricher = {
    toReference: jest.fn().mockResolvedValue(null),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) => fn({})),
  };

  const service = new SavedForLaterService(
    dataSource as never,
    repository as never,
    cartItemsRepository as never,
    cartService as never,
    storageUrlEnricher as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.existsByRefId.mockResolvedValue(false);
    cartService.getCart.mockResolvedValue(emptyCart);
    storageUrlEnricher.toReference.mockResolvedValue(null);
  });

  describe('saveFromCart', () => {
    it('moves a cart item to Save for Later and removes it from the cart', async () => {
      cartItemsRepository.lockOwnedById.mockResolvedValue({
        id: 'ci-1',
        cartId: 'cart-1',
        productId: 'p-1',
        variantId: 'v-1',
        quantity: 2,
        isSubscription: false,
        frequency: null,
      });
      repository.lockByUserAndIdentity.mockResolvedValue(null);
      repository.create.mockResolvedValue({ id: 'sfl-1', quantity: 2 });
      repository.findByIdForUser.mockResolvedValue({
        id: 'sfl-1',
        productId: 'p-1',
        variantId: 'v-1',
        quantity: 2,
        isSubscription: false,
        frequency: null,
        createdAt: new Date(),
        product: { name: 'Vitamin C', slug: 'vitamin-c', status: 'published', brand: null },
        variant: {
          id: 'v-1',
          sku: 'SKU',
          sellingPrice: '100',
          mrp: '120',
          stock: 5,
          status: 'active',
          attributeValues: [],
        },
      });
      cartService.getCart.mockResolvedValue({
        ...emptyCart,
        items: [],
        totalItems: 0,
        subtotal: 0,
      });

      const result = await service.saveFromCart('user-1', 'ci-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          productId: 'p-1',
          variantId: 'v-1',
          quantity: 2,
          identityKey: 'v-1:0:',
        }),
        {},
      );
      expect(cartItemsRepository.deleteById).toHaveBeenCalledWith('ci-1', {});
      expect(result.savedItem.quantity).toBe(2);
      expect(result.cart.totalItems).toBe(0);
    });

    it('merges quantity into an existing saved row instead of duplicating', async () => {
      cartItemsRepository.lockOwnedById.mockResolvedValue({
        id: 'ci-1',
        cartId: 'cart-1',
        productId: 'p-1',
        variantId: 'v-1',
        quantity: 2,
        isSubscription: false,
        frequency: null,
      });
      repository.lockByUserAndIdentity.mockResolvedValue({ id: 'sfl-1', quantity: 3 });
      repository.findByIdForUser.mockResolvedValue({
        id: 'sfl-1',
        productId: 'p-1',
        variantId: 'v-1',
        quantity: 5,
        isSubscription: false,
        frequency: null,
        createdAt: new Date(),
        product: { name: 'Vitamin C', slug: 'vitamin-c', status: 'published' },
        variant: { id: 'v-1', sku: 'SKU', sellingPrice: '100', stock: 9, status: 'active' },
      });

      const result = await service.saveFromCart('user-1', 'ci-1');

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.updateById).toHaveBeenCalledWith(
        'sfl-1',
        expect.objectContaining({ quantity: 5 }),
        {},
      );
      expect(result.savedItem.quantity).toBe(5);
    });

    it('returns 404 when the cart item is missing or belongs to another customer', async () => {
      cartItemsRepository.lockOwnedById.mockResolvedValue(null);
      await expect(service.saveFromCart('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.saveFromCart('user-1', 'missing')).rejects.toMatchObject({
        response: expect.objectContaining({ code: CART_ITEM_NOT_FOUND }),
      });
      expect(cartItemsRepository.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns only the current user page and live product data', async () => {
      repository.findAllPaginated.mockResolvedValue({
        data: [
          {
            id: 'sfl-1',
            productId: 'p-1',
            variantId: 'v-1',
            quantity: 1,
            isSubscription: false,
            frequency: null,
            createdAt: new Date(),
            product: { name: 'Serum', slug: 'serum', status: 'published' },
            variant: { id: 'v-1', sku: 'S1', sellingPrice: '200', stock: 0, status: 'active' },
          },
        ],
        total: 1,
      });

      const result = await service.list('user-1', { page: 1, limit: 20 });
      expect(repository.findAllPaginated).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ page: 1, limit: 20 }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.product.title).toBe('Serum');
      expect(result.total).toBe(1);
    });
  });

  describe('moveToCart', () => {
    it('reuses add-to-cart and deletes the saved row only after success', async () => {
      repository.lockByIdForUser.mockResolvedValue({
        id: 'sfl-1',
        productId: 'p-1',
        variantId: 'v-1',
        quantity: 2,
        isSubscription: false,
        frequency: null,
      });
      cartService.addItemInTransaction.mockResolvedValue({
        ...emptyCart,
        totalItems: 2,
        subtotal: 200,
      });

      const result = await service.moveToCart('user-1', 'sfl-1');

      expect(cartService.addItemInTransaction).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ productId: 'p-1', variantId: 'v-1', quantity: 2 }),
        {},
      );
      expect(repository.deleteById).toHaveBeenCalledWith('sfl-1', {});
      expect(result.cart.totalItems).toBe(2);
    });

    it('keeps the saved item when add-to-cart fails', async () => {
      repository.lockByIdForUser.mockResolvedValue({
        id: 'sfl-1',
        productId: 'p-1',
        variantId: 'v-1',
        quantity: 1,
        isSubscription: false,
        frequency: null,
      });
      cartService.addItemInTransaction.mockRejectedValue(
        new BadRequestException('Product/variant not found or inactive'),
      );

      await expect(service.moveToCart('user-1', 'sfl-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.deleteById).not.toHaveBeenCalled();
    });

    it('returns 404 for another customer’s saved item', async () => {
      repository.lockByIdForUser.mockResolvedValue(null);
      await expect(service.moveToCart('user-1', 'sfl-x')).rejects.toMatchObject({
        response: expect.objectContaining({ code: SAVE_FOR_LATER_ITEM_NOT_FOUND }),
      });
      expect(cartService.addItemInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the owned saved item and does not touch the cart', async () => {
      repository.findByIdForUser.mockResolvedValue({ id: 'sfl-1' });
      repository.countByUserId.mockResolvedValue(0);
      const result = await service.remove('user-1', 'sfl-1');
      expect(repository.deleteById).toHaveBeenCalledWith('sfl-1');
      expect(cartService.addItemInTransaction).not.toHaveBeenCalled();
      expect(result.count).toBe(0);
    });

    it('returns 404 when the item is missing', async () => {
      repository.findByIdForUser.mockResolvedValue(null);
      await expect(service.remove('user-1', 'missing')).rejects.toMatchObject({
        response: expect.objectContaining({ code: SAVE_FOR_LATER_ITEM_NOT_FOUND }),
      });
    });
  });
});
