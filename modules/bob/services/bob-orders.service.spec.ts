import { BadRequestException } from '@nestjs/common';
import { OrdersService } from '@modules/orders/services/orders.service';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { UsersService } from '@modules/users/services/users.service';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { BobCreateOrderDto } from '../dto/bob.dto';
import { BobOrdersService } from './bob-orders.service';
import { BobProductResolver } from './bob-product-resolver.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_UUID = '5a545f0f-f96c-44b5-bea5-88542d7796b6';
const PRODUCT_UUID = 'c4e9b094-30f1-4ca5-aaec-0e0b60631ab6';

function draftDto(): BobCreateOrderDto {
  return {
    customerName: 'Testing test',
    customerPhone: '917411920739',
    customerEmail: 'test@businessonbot.com',
    paymentType: 'ONLINE',
    total_amount: '161.00',
    shipping_amount: '0.00',
    tax_amount: '0.00',
    discount_amount: '0.00',
    note: 'Order drafted by BusinessOnBot',
    cart: [
      {
        id: '101047',
        title: 'Chicco Toothpaste Strawberry- No Flouride(12m+)(50ml)',
        variant: {
          id: '101047',
          price: '161.00',
          quantity: 1,
          title: '',
        },
      },
    ],
    shippingAddress: {
      firstName: 'Testing',
      lastName: 'test',
      phone: '917411920739',
      address1: 'Testing test',
      city: 'Bangalore',
      province: 'KA',
      zip: '560032',
    },
  };
}

describe('BobOrdersService.createDraft', () => {
  let ordersService: { createBobDraftOrder: jest.Mock };
  let usersService: { findByMobileNumber: jest.Mock; createFromMobileNumber: jest.Mock };
  let usersRepository: { update: jest.Mock };
  let userAddressesService: { create: jest.Mock };
  let productsRepository: { findPublishedById: jest.Mock; findWithTagsById: jest.Mock };
  let bobProductResolver: { findActiveVariantByBobId: jest.Mock };
  let service: BobOrdersService;

  beforeEach(() => {
    ordersService = {
      createBobDraftOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    };
    usersService = {
      findByMobileNumber: jest.fn().mockResolvedValue({
        id: USER_ID,
        firstName: 'Testing',
        lastName: 'test',
        email: 'test@businessonbot.com',
      }),
      createFromMobileNumber: jest.fn(),
    };
    usersRepository = { update: jest.fn() };
    userAddressesService = { create: jest.fn().mockResolvedValue({}) };
    productsRepository = {
      findPublishedById: jest.fn().mockResolvedValue({
        id: PRODUCT_UUID,
        name: 'Chicco Toothpaste',
        status: ProductStatus.PUBLISHED,
      }),
      findWithTagsById: jest.fn(),
    };
    bobProductResolver = { findActiveVariantByBobId: jest.fn() };
    service = new BobOrdersService(
      ordersService as unknown as OrdersService,
      usersService as unknown as UsersService,
      usersRepository as unknown as UsersRepository,
      userAddressesService as unknown as UserAddressesService,
      productsRepository as unknown as ProductsRepository,
      bobProductResolver as unknown as BobProductResolver,
    );
  });

  it('resolves a numeric catalogue variant id to the internal UUID before creating a draft', async () => {
    bobProductResolver.findActiveVariantByBobId.mockResolvedValue({
      id: VARIANT_UUID,
      productId: PRODUCT_UUID,
      sku: 'CHI/TOO/101047',
      slug: 'chicco-toothpaste',
      sellingPrice: '161.00',
      status: VariantStatus.ACTIVE,
      deletedAt: null,
    } as unknown as ProductVariantEntity);

    await expect(service.createDraft(draftDto())).resolves.toEqual({
      OrderId: 'order-1',
      status: 'pending',
    });

    expect(bobProductResolver.findActiveVariantByBobId).toHaveBeenCalledWith('101047');
    expect(ordersService.createBobDraftOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            productId: PRODUCT_UUID,
            variantId: VARIANT_UUID,
          }),
        ],
      }),
    );
  });

  it('returns SKU not found instead of querying Postgres with a non-UUID', async () => {
    bobProductResolver.findActiveVariantByBobId.mockResolvedValue(null);

    await expect(service.createDraft(draftDto())).rejects.toBeInstanceOf(BadRequestException);
    expect(ordersService.createBobDraftOrder).not.toHaveBeenCalled();
  });
});
