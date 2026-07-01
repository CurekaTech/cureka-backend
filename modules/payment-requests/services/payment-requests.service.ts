import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { buildPaginatedResult, generateUniqueRefId } from '@packages/common';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { UsersService } from '@modules/users/services/users.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import {
  CreatePaymentRequestDto,
  GenerateLinkPrefillDto,
  PaymentRequestItemInputDto,
  PaymentRequestQueryDto,
  UpdatePaymentRequestDto,
} from '../dto/payment-request.dto';
import { PaymentRequestEntity } from '../entities/payment-request.entity';
import { PaymentRequestStatus } from '../enums/payment-request-status.enum';
import { PaymentRequestItemsRepository } from '../repositories/payment-request-items.repository';
import { PaymentRequestsRepository } from '../repositories/payment-requests.repository';
import { RazorpayPaymentLinksService } from './razorpay-payment-links.service';

@Injectable()
export class PaymentRequestsService {
  private readonly logger = new Logger(PaymentRequestsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly ordersService: OrdersService,
    private readonly paymentRequestsRepository: PaymentRequestsRepository,
    private readonly paymentRequestItemsRepository: PaymentRequestItemsRepository,
    private readonly razorpayService: RazorpayPaymentLinksService,
  ) {}

  async create(dto: CreatePaymentRequestDto, createdBy: string): Promise<PaymentRequestEntity> {
    const customerId = await this.resolveCustomerId(dto);
    const pricedItems = await this.resolveAndValidateItems(dto.items);
    const totals = this.computeTotals(pricedItems, dto.discount, dto.tax, dto.shipping, dto.handling, dto.finalAmount);

    return this.dataSource.transaction(async (manager) => {
      const refId = await generateUniqueRefId('pay-request', (candidate) =>
        this.paymentRequestsRepository.existsByRefId(candidate),
      );
      const created = await this.paymentRequestsRepository.create(
        {
          refId,
          customerId,
          status: PaymentRequestStatus.PAYMENT_PENDING,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          shipping: totals.shipping,
          handling: totals.handling,
          totalAmount: totals.totalAmount,
          currency: 'INR',
          notes: dto.notes ?? null,
          createdBy,
          updatedBy: createdBy,
        },
        manager,
      );

      await this.paymentRequestItemsRepository.createMany(
        pricedItems.map((item) => ({
          refId: item.refId,
          paymentRequestId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          total: item.total,
          createdBy,
          updatedBy: createdBy,
        })),
        manager,
      );

      return (await this.paymentRequestsRepository.findById(created.id, manager)) as PaymentRequestEntity;
    });
  }

  async update(id: string, dto: UpdatePaymentRequestDto, updatedBy: string): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (![PaymentRequestStatus.PAYMENT_PENDING, PaymentRequestStatus.LINK_GENERATED].includes(existing.status)) {
      throw new BadRequestException('Payment request can only be edited while pending payment');
    }

    if (existing.status === PaymentRequestStatus.LINK_GENERATED && existing.providerReferenceId) {
      await this.razorpayService.cancelPaymentLink(existing.providerReferenceId);
    }

    const pricedItems = await this.resolveAndValidateItems(dto.items);
    const totals = this.computeTotals(pricedItems, dto.discount, dto.tax, dto.shipping, dto.handling, dto.finalAmount);

    return this.dataSource.transaction(async (manager) => {
      await this.paymentRequestsRepository.updateById(
        existing.id,
        {
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          shipping: totals.shipping,
          handling: totals.handling,
          totalAmount: totals.totalAmount,
          notes: dto.notes ?? existing.notes,
          paymentLink: null,
          providerReferenceId: null,
          paymentReference: null,
          expiresAt: null,
          status: PaymentRequestStatus.PAYMENT_PENDING,
          updatedBy,
        },
        manager,
      );
      await this.paymentRequestItemsRepository.deleteByPaymentRequestId(existing.id, manager);
      await this.paymentRequestItemsRepository.createMany(
        pricedItems.map((item) => ({
          refId: item.refId,
          paymentRequestId: existing.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          total: item.total,
          createdBy: updatedBy,
          updatedBy,
        })),
        manager,
      );

      return (await this.paymentRequestsRepository.findById(existing.id, manager)) as PaymentRequestEntity;
    });
  }

  async findAll(query: PaymentRequestQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.paymentRequestsRepository.findPaginated({
      page,
      limit,
      search: query.search,
      status: query.status,
      customerId: query.customerId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return buildPaginatedResult(data, total, { page, limit, sortOrder: 'DESC' });
  }

  async findOne(id: string): Promise<PaymentRequestEntity> {
    return this.getRequestOrThrow(id);
  }

  async cancel(id: string, updatedBy: string): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new BadRequestException('Paid payment request cannot be cancelled');
    }
    if (existing.providerReferenceId) {
      await this.razorpayService.cancelPaymentLink(existing.providerReferenceId);
    }
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.CANCELLED,
      updatedBy,
    });
    return this.getRequestOrThrow(existing.id);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.getRequestOrThrow(id);
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new BadRequestException('Paid payment request cannot be deleted');
    }
    await this.paymentRequestsRepository.updateById(existing.id, { deletedAt: new Date() });
  }

  async generateLink(
    id: string,
    updatedBy: string,
    prefill?: GenerateLinkPrefillDto,
  ): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (![PaymentRequestStatus.PAYMENT_PENDING, PaymentRequestStatus.LINK_GENERATED].includes(existing.status)) {
      throw new BadRequestException('Payment link can only be generated for pending requests');
    }
    if (!existing.items.length) {
      throw new BadRequestException('Cannot create payment link without products');
    }
    const amountPaise = Math.round(Number(existing.totalAmount) * 100);
    if (amountPaise <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const customer = await this.usersRepository.findById(existing.customerId);

    // Validate prefill if provided
    if (prefill && Object.keys(prefill).length > 0 && !prefill.phone) {
      throw new BadRequestException('phone is mandatory when custom prefill details are provided');
    }

    const finalPhone = prefill?.phone || customer?.mobileNumber;
    const finalEmail = prefill?.email || customer?.email;

    if (!finalPhone) {
      throw new BadRequestException('Customer phone is required for payment link');
    }

    const reference = existing.refId;
    const expireBy = this.razorpayService.getLinkExpiryTimestamp();

    const payload: Record<string, any> = {
      amount: amountPaise,
      currency: existing.currency,
      reference_id: reference,
      expire_by: expireBy,
      customer: {
        name: [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || finalPhone,
        contact: finalPhone,
        email: finalEmail ?? undefined,
      },
      notes: {
        paymentRequestId: existing.id,
        paymentRequestRefId: existing.refId,
        customerId: existing.customerId,
      },
    };

    // Format description and display product details
    const description = this.formatRazorpayDescription(existing);
    if (description) {
      payload.description = description;
    }

    // Add callback redirection URLs if configured
    const callbackUrl = this.razorpayService.getCallbackUrl();
    if (callbackUrl) {
      payload.callback_url = callbackUrl;
      payload.callback_method = 'get';
    }

    const link = await this.razorpayService.createPaymentLink(payload);

    await this.paymentRequestsRepository.updateById(existing.id, {
      paymentLink: String((link['short_url'] as string | undefined) ?? (link['url'] as string | undefined) ?? ''),
      providerReferenceId: String(link['id'] as string),
      paymentReference: String((link['reference_id'] as string | undefined) ?? reference),
      expiresAt: link['expire_by'] ? new Date(Number(link['expire_by']) * 1000) : null,
      status: PaymentRequestStatus.LINK_GENERATED,
      updatedBy,
    });
    this.logger.log(`Payment link created for payment request ${existing.refId}`);
    return this.getRequestOrThrow(existing.id);
  }

  async regenerateLink(
    id: string,
    updatedBy: string,
    prefill?: GenerateLinkPrefillDto,
  ): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new BadRequestException('Cannot regenerate link for paid request');
    }
    if (existing.providerReferenceId) {
      await this.razorpayService.cancelPaymentLink(existing.providerReferenceId);
    }
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.PAYMENT_PENDING,
      paymentLink: null,
      providerReferenceId: null,
      paymentReference: null,
      expiresAt: null,
      updatedBy,
    });
    return this.generateLink(id, updatedBy, prefill);
  }

  private async markRequestAsPaid(
    existing: PaymentRequestEntity,
    providerPaymentId?: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (existing.status === PaymentRequestStatus.PAID) {
      return;
    }

    const runInTransaction = async (txManager: EntityManager) => {
      const fresh = await this.paymentRequestsRepository.findById(existing.id, txManager);
      if (!fresh || fresh.status === PaymentRequestStatus.PAID) {
        return;
      }

      await this.paymentRequestsRepository.updateById(
        fresh.id,
        {
          status: PaymentRequestStatus.PAID,
          paymentReference: providerPaymentId ?? fresh.paymentReference,
          paidAt: new Date(),
          updatedBy: 'razorpay-webhook',
        },
        txManager,
      );

      const shippingVal = Number(fresh.shipping ?? '0') + Number(fresh.handling ?? '0');
      await this.ordersService.createOrderFromPaymentRequest({
        customerId: fresh.customerId,
        paymentRequestId: fresh.id,
        paymentRequestRefId: fresh.refId,
        subtotal: fresh.subtotal,
        discountAmount: fresh.discount,
        shippingAmount: shippingVal.toFixed(2),
        grandTotal: fresh.totalAmount,
        notes: fresh.notes ?? null,
        items: fresh.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.total,
        })),
      });
    };

    if (manager) {
      await runInTransaction(manager);
    } else {
      await this.dataSource.transaction(async (txManager) => {
        await runInTransaction(txManager);
      });
    }

    this.logger.log(`Order created and payment request ${existing.refId} marked as PAID`);
  }

  async handlePaymentLinkPaid(providerReferenceId: string, providerPaymentId?: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing) {
      this.logger.warn(`Payment request not found for provider reference ${providerReferenceId}`);
      return;
    }
    await this.markRequestAsPaid(existing, providerPaymentId);
  }

  async handlePaymentCaptured(paymentRequestId: string, providerPaymentId?: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findById(paymentRequestId);
    if (!existing) {
      this.logger.warn(`Payment request not found for ID ${paymentRequestId}`);
      return;
    }
    await this.markRequestAsPaid(existing, providerPaymentId);
  }

  async handlePaymentFailed(paymentRequestId: string, reason?: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findById(paymentRequestId);
    if (!existing) {
      this.logger.warn(`Payment request not found for ID ${paymentRequestId}`);
      return;
    }
    this.logger.warn(`Payment failed for payment request ${existing.refId}. Reason: ${reason || 'N/A'}`);
  }

  async handlePaymentPending(paymentRequestId: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findById(paymentRequestId);
    if (!existing) {
      this.logger.warn(`Payment request not found for ID ${paymentRequestId}`);
      return;
    }
    this.logger.log(`Payment attempt pending for payment request ${existing.refId}`);
  }

  async handlePaymentLinkCancelled(providerReferenceId: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing || existing.status === PaymentRequestStatus.PAID) return;
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.CANCELLED,
      updatedBy: 'razorpay-webhook',
    });
  }

  async handlePaymentLinkExpired(providerReferenceId: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing || existing.status === PaymentRequestStatus.PAID) return;
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.EXPIRED,
      updatedBy: 'razorpay-webhook',
    });
  }

  formatRazorpayDescription(request: PaymentRequestEntity): string {
    const items = request.items;
    if (!items || items.length === 0) {
      return `Payment Request: ${request.refId}`;
    }

    if (items.length === 1) {
      const item = items[0];
      const prodName = item.product?.name || 'Product';
      const prodDesc = item.product?.description || '';
      const cleanDesc = prodDesc ? ` - ${prodDesc.replace(/<[^>]*>/g, '').slice(0, 150)}` : '';
      const cleanPrice = Number(item.unitPrice).toFixed(2);
      return `${prodName}${cleanDesc} (Qty: ${item.quantity}) · Price: ₹${cleanPrice}`;
    } else {
      const itemsList = items
        .map((item, idx) => `${idx + 1}. ${item.product?.name || 'Product'} (Qty: ${item.quantity})`)
        .join(', ');
      const desc = `Items: ${itemsList}`;
      if (desc.length > 1000) {
        return desc.slice(0, 997) + '...';
      }
      return desc;
    }
  }

  private async getRequestOrThrow(id: string): Promise<PaymentRequestEntity> {
    const request = await this.paymentRequestsRepository.findById(id);
    if (!request) throw new NotFoundException(`Payment request ${id} not found`);
    return request;
  }

  /**
   * Lightweight product + variant search for the payment-request creation wizard.
   * Returns products grouped with their active variants (id, sku, price, stock, attribute label).
   */
  async searchProducts(search: string, limit = 20) {
    type ProductVariantResult = {
      variantId: string;
      sku: string;
      mrp: string;
      sellingPrice: string;
      stock: number;
      attributeLabel: string | null;
    };
    type ProductResult = {
      productId: string;
      productName: string;
      variants: ProductVariantResult[];
    };

    const variants = await this.dataSource
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .where('variant.status = :vStatus', { vStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :pStatus', { pStatus: ProductStatus.PUBLISHED })
      .andWhere(
        '(product.name ILIKE :search OR variant.sku ILIKE :search)',
        { search: `%${search}%` },
      )
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.sku', 'ASC')
      .limit(limit)
      .getMany();

    // Group variants by product
    const productMap = new Map<string, ProductResult>();
    const result: ProductResult[] = [];

    for (const v of variants) {
      if (!productMap.has(v.productId)) {
        const entry: ProductResult = { productId: v.productId, productName: v.product.name, variants: [] };
        productMap.set(v.productId, entry);
        result.push(entry);
      }
      const attrLabel = v.attributeValues?.length
        ? v.attributeValues.map((av) => av.value).join(' / ')
        : null;
      productMap.get(v.productId)!.variants.push({
        variantId: v.id,
        sku: v.sku,
        mrp: v.mrp,
        sellingPrice: v.sellingPrice,
        stock: v.stock,
        attributeLabel: attrLabel,
      });
    }

    return result;
  }
  private async resolveCustomerId(dto: CreatePaymentRequestDto): Promise<string> {
    if (dto.customerId) {
      const customer = await this.usersRepository.findById(dto.customerId);
      if (!customer) throw new BadRequestException('Customer not found');
      return customer.id;
    }
    if (!dto.customerPhone) {
      throw new BadRequestException('customerPhone is required when customerId is not provided');
    }
    const existing = await this.usersRepository.findByMobileNumber(dto.customerPhone);
    if (existing) return existing.id;
    const created = await this.usersService.createFromMobileNumber(dto.customerPhone);
    return created.id;
  }

  private async resolveAndValidateItems(items: PaymentRequestItemInputDto[]) {
    if (!items.length) throw new BadRequestException('At least one product is required');

    return Promise.all(
      items.map(async (item, index) => {
        const variant = await this.dataSource.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId, productId: item.productId },
        });
        if (!variant) {
          throw new BadRequestException(`Invalid product/variant at row ${index + 1}`);
        }
        const unitPrice = Number(item.unitPrice);
        if (unitPrice <= 0) {
          throw new BadRequestException(`Unit price must be greater than zero at row ${index + 1}`);
        }
        const quantity = item.quantity;
        const discount = Number(item.discount ?? '0');
        const tax = Number(item.tax ?? '0');
        const total = unitPrice * quantity - discount + tax;
        if (total <= 0) {
          throw new BadRequestException(`Item total must be greater than zero at row ${index + 1}`);
        }

        const refId = await generateUniqueRefId('pay-item', (candidate) =>
          this.paymentRequestItemsRepository.existsByRefId(candidate),
        );
        return {
          ...item,
          refId,
          unitPrice: unitPrice.toFixed(2),
          discount: discount.toFixed(2),
          tax: tax.toFixed(2),
          total: total.toFixed(2),
        };
      }),
    );
  }

  private computeTotals(
    items: Array<{ total: string }>,
    discount?: string,
    tax?: string,
    shipping?: string,
    handling?: string,
    finalAmount?: string,
  ) {
    const subtotalNum = items.reduce((sum, item) => sum + Number(item.total), 0);
    const discountNum = Number(discount ?? '0');
    const taxNum = Number(tax ?? '0');
    const shippingNum = Number(shipping ?? '0');
    const handlingNum = Number(handling ?? '0');
    const computed = subtotalNum - discountNum + taxNum + shippingNum + handlingNum;
    const totalAmountNum = finalAmount ? Number(finalAmount) : computed;

    if (totalAmountNum <= 0) throw new BadRequestException('Amount must be greater than zero');
    return {
      subtotal: subtotalNum.toFixed(2),
      discount: discountNum.toFixed(2),
      tax: taxNum.toFixed(2),
      shipping: shippingNum.toFixed(2),
      handling: handlingNum.toFixed(2),
      totalAmount: totalAmountNum.toFixed(2),
    };
  }
}

