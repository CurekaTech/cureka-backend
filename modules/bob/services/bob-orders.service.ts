import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UserAddressType } from '@modules/users/enums/user-address-type.enum';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { UsersService } from '@modules/users/services/users.service';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { ProductVariantsRepository } from '@modules/product/repositories/product-variants.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { OrdersService } from '@modules/orders/services/orders.service';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { parseMoneyAmount, toBobIndianMobile } from '../utils/bob.util';
import { BobCreateOrderDto, BobPlaceOrderDto } from '../dto/bob.dto';

@Injectable()
export class BobOrdersService {
  private readonly logger = new Logger(BobOrdersService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly userAddressesService: UserAddressesService,
    private readonly productVariantsRepository: ProductVariantsRepository,
    private readonly productsRepository: ProductsRepository,
  ) {}

  async createDraft(dto: BobCreateOrderDto): Promise<{ OrderId: string; status: 'pending' }> {
    const phone = toBobIndianMobile(dto.customerPhone);
    const addressPhone = dto.shippingAddress.phone
      ? toBobIndianMobile(dto.shippingAddress.phone)
      : phone;

    let user = await this.usersService.findByMobileNumber(phone);
    if (!user) {
      user = await this.usersService.createFromMobileNumber(phone);
    }

    const names = this.splitName(dto.customerName, dto.shippingAddress.firstName, dto.shippingAddress.lastName);
    await this.usersRepository.update(user.id, {
      ...(names.firstName && !user.firstName ? { firstName: names.firstName } : {}),
      ...(names.lastName && !user.lastName ? { lastName: names.lastName } : {}),
      ...(dto.customerEmail && !user.email ? { email: dto.customerEmail.trim().toLowerCase() } : {}),
      updatedBy: user.id,
    });

    const pincode = (dto.shippingAddress.zip ?? '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(pincode)) {
      throw new BadRequestException('Bad Request!!');
    }

    const recipientName =
      [dto.shippingAddress.firstName, dto.shippingAddress.lastName].filter(Boolean).join(' ') ||
      dto.customerName?.trim() ||
      names.firstName ||
      phone;

    await this.userAddressesService.create(user.id, {
      recipientName,
      phoneNumber: addressPhone,
      pincode,
      addressLine1: dto.shippingAddress.address1?.trim() || 'Address via WhatsApp',
      addressLine2: dto.shippingAddress.address2,
      city: dto.shippingAddress.city?.trim() || 'NA',
      state: dto.shippingAddress.province?.trim() || 'NA',
      addressType: UserAddressType.HOME,
    });

    const items: Array<{
      productId: string;
      variantId: string;
      sku: string;
      productName: string;
      variantName: string | null;
      quantity: number;
      unitPrice: number;
    }> = [];
    for (const line of dto.cart) {
      const variant = await this.productVariantsRepository.findById(line.variant.id);
      if (!variant?.productId || variant.status !== VariantStatus.ACTIVE || variant.deletedAt) {
        this.logger.warn({ variantId: line.variant.id }, '[BOB order] variant not found');
        throw new BadRequestException(`SKU not found: ${line.variant.id}`);
      }
      const product =
        (await this.productsRepository.findPublishedById(variant.productId)) ??
        (await this.productsRepository.findWithTagsById(variant.productId));
      if (!product) {
        throw new BadRequestException(`SKU not found: ${line.variant.id}`);
      }
      items.push({
        productId: variant.productId,
        variantId: variant.id,
        sku: variant.sku,
        productName: product.name,
        variantName: line.variant.title ?? variant.slug ?? null,
        quantity: line.variant.quantity,
        unitPrice: Number(variant.sellingPrice),
      });
    }

    const order = await this.ordersService.createBobDraftOrder({
      userId: user.id,
      address: {
        recipientName,
        phoneNumber: addressPhone,
        pincode,
        addressLine1: dto.shippingAddress.address1?.trim() || 'Address via WhatsApp',
        addressLine2: dto.shippingAddress.address2 ?? null,
        city: dto.shippingAddress.city?.trim() || 'NA',
        state: dto.shippingAddress.province?.trim() || 'NA',
      },
      items,
      notes: dto.note ?? dto.description ?? 'Order drafted by BusinessOnBot',
      shippingAmount: parseMoneyAmount(dto.shipping_amount),
      taxAmount: parseMoneyAmount(dto.tax_amount),
      discountAmount: parseMoneyAmount(dto.discount_amount, dto.discount?.value ?? 0),
      grandTotal: dto.total_amount ? parseMoneyAmount(dto.total_amount) : undefined,
    });

    return { OrderId: order.id, status: 'pending' };
  }

  async place(
    dto: BobPlaceOrderDto,
  ): Promise<{ id: string; name: string; status: 'processing' }> {
    const orderId = (dto.OrderId ?? dto.orderId ?? '').replace(/^#/, '').trim();
    if (!orderId) {
      throw new BadRequestException('Bad Request!!');
    }

    const paymentPending = dto.paymentPending === true;
    const paymentId = dto.paymentId?.trim() || null;
    const order = await this.ordersService.placeBobOrder({
      orderId,
      paymentId: paymentPending ? null : paymentId,
    });

    return {
      id: `#${order.orderNumber}`,
      name: `#${order.orderNumber}`,
      status: 'processing',
    };
  }

  private splitName(
    customerName?: string,
    firstName?: string,
    lastName?: string,
  ): { firstName: string; lastName: string } {
    if (firstName || lastName) {
      return { firstName: firstName?.trim() ?? '', lastName: lastName?.trim() ?? '' };
    }
    const parts = (customerName ?? '').trim().split(/\s+/).filter(Boolean);
    return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
  }
}
