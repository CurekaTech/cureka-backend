import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { AddCartItemDto, UpdateCartItemDto } from '../dto/cart.dto';
import { CartItemEntity } from '../entities/cart-item.entity';
import { CartEntity } from '../entities/cart.entity';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { CartsRepository } from '../repositories/carts.repository';

type CartSummaryItem = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  stock: number;
};

type CartSummary = {
  cartId: string;
  items: CartSummaryItem[];
  subtotal: number;
  totalItems: number;
};

@Injectable()
export class CartService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartsRepository: CartsRepository,
    private readonly cartItemsRepository: CartItemsRepository,
  ) {}

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartSummary> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.getOrCreateActiveCart(userId, manager);
      const variant = await this.getValidVariant(dto.productId, dto.variantId, manager);

      const existing = await this.cartItemsRepository.findByCartAndVariant(cart.id, dto.variantId, manager);
      if (existing) {
        const nextQty = existing.quantity + dto.quantity;
        this.assertStockAvailable(nextQty, variant.stock);
        await this.cartItemsRepository.updateById(existing.id, { quantity: nextQty }, manager);
      } else {
        this.assertStockAvailable(dto.quantity, variant.stock);
        const refId = await generateUniqueRefId('cart-item', (candidate) =>
          this.cartItemsRepository.existsByRefId(candidate),
        );
        await this.cartItemsRepository.create(
          {
            refId,
            cartId: cart.id,
            productId: dto.productId,
            variantId: dto.variantId,
            quantity: dto.quantity,
            createdBy: userId,
            updatedBy: userId,
          },
          manager,
        );
      }

      return this.getCart(userId, manager);
    });
  }

  async getCart(userId: string, manager = this.dataSource.manager): Promise<CartSummary> {
    const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
    if (!cart) {
      return { cartId: '', items: [], subtotal: 0, totalItems: 0 };
    }

    return this.toCartSummary(cart);
  }

  async updateQuantity(userId: string, itemId: string, dto: UpdateCartItemDto): Promise<CartSummary> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) throw new NotFoundException('Active cart not found');
      const item = cart.items.find((x) => x.id === itemId);
      if (!item) throw new NotFoundException(`Cart item ${itemId} not found`);

      const variant = await this.getValidVariant(item.productId, item.variantId, manager);
      this.assertStockAvailable(dto.quantity, variant.stock);

      await this.cartItemsRepository.updateById(itemId, { quantity: dto.quantity }, manager);
      return this.getCart(userId, manager);
    });
  }

  async removeItem(userId: string, itemId: string): Promise<CartSummary> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) throw new NotFoundException('Active cart not found');
      const item = cart.items.find((x) => x.id === itemId);
      if (!item) throw new NotFoundException(`Cart item ${itemId} not found`);

      await this.cartItemsRepository.deleteById(itemId, manager);
      return this.getCart(userId, manager);
    });
  }

  async clear(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) return;
      await this.cartItemsRepository.clearByCartId(cart.id, manager);
    });
  }

  async getActiveCartEntity(userId: string, manager = this.dataSource.manager): Promise<CartEntity | null> {
    return this.cartsRepository.findActiveByUserId(userId, manager);
  }

  async getOrCreateActiveCart(userId: string, manager = this.dataSource.manager): Promise<CartEntity> {
    const existing = await this.cartsRepository.findActiveByUserId(userId, manager);
    if (existing) return existing;

    const refId = await generateUniqueRefId('cart', (candidate) => this.cartsRepository.existsByRefId(candidate));
    return this.cartsRepository.create(
      {
        refId,
        userId,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
      manager,
    );
  }

  private async getValidVariant(
    productId: string,
    variantId: string,
    manager = this.dataSource.manager,
  ): Promise<ProductVariantEntity> {
    const repo = manager.getRepository(ProductVariantEntity);
    const variant = await repo
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .where('variant.id = :variantId', { variantId })
      .andWhere('variant.productId = :productId', { productId })
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :productStatus', { productStatus: ProductStatus.PUBLISHED })
      .getOne();

    if (!variant) {
      throw new BadRequestException('Product/variant not found or inactive');
    }
    return variant;
  }

  private assertStockAvailable(requiredQty: number, stock: number): void {
    if (requiredQty > stock) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }
  }

  private toCartSummary(cart: CartEntity): CartSummary {
    const items = (cart.items ?? []).map((item): CartSummaryItem => {
      const variant = item.variant as ProductVariantEntity | undefined;
      const product = item.product as ProductEntity | undefined;
      const unitPrice = variant ? parseFloat(variant.sellingPrice) : 0;
      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: product?.name ?? '',
        sku: variant?.sku ?? '',
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
        stock: variant?.stock ?? 0,
      };
    });

    return {
      cartId: cart.id,
      items,
      subtotal: items.reduce((sum, x) => sum + x.totalPrice, 0),
      totalItems: items.reduce((sum, x) => sum + x.quantity, 0),
    };
  }
}
