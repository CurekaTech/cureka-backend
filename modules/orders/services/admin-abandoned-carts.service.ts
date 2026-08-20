import { Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginatedResult, buildPaginationOptions, PaginatedResult } from '@packages/common';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { UsersService } from '@modules/users/services/users.service';
import { AdminAbandonedCartQueryDto } from '../dto/abandoned-cart.dto';
import { CartEntity } from '../entities/cart.entity';
import {
  IAbandonedCartDetail,
  IAbandonedCartListItem,
} from '../interfaces/abandoned-cart.interface';
import { mapAbandonedCartListRow } from '../mappers/abandoned-cart.mapper';
import { CartsRepository } from '../repositories/carts.repository';
import { CartService } from './cart.service';

@Injectable()
export class AdminAbandonedCartsService {
  constructor(
    private readonly cartsRepository: CartsRepository,
    private readonly cartService: CartService,
    private readonly usersService: UsersService,
    private readonly userAddressesService: UserAddressesService,
  ) {}

  async findAll(query: AdminAbandonedCartQueryDto): Promise<PaginatedResult<IAbandonedCartListItem>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.cartsRepository.findAbandonedPaginated({
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      fromDate: query.fromDate,
      toDate: query.toDate,
      minAmount: query.minAmount,
      maxAmount: query.maxAmount,
      sortBy: query.sortBy ?? paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
    });

    return buildPaginatedResult(data.map(mapAbandonedCartListRow), total, paginationOptions);
  }

  async findOne(idOrRefId: string): Promise<IAbandonedCartDetail> {
    const cart = await this.cartsRepository.findActiveByIdOrRefId(idOrRefId);
    if (!cart || !(cart.items?.length)) {
      throw new NotFoundException('Abandoned cart not found');
    }

    const [customer, addresses, cartResponse] = await Promise.all([
      this.usersService.findById(cart.userId),
      this.userAddressesService.findAll(cart.userId),
      this.cartService.getCartResponseSnapshot(cart),
    ]);

    return {
      id: cart.id,
      refId: cart.refId,
      lastActivityAt: this.resolveLastActivityAt(cart),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      customer,
      addresses,
      defaultAddress: addresses.find((address) => address.isDefault) ?? null,
      cart: cartResponse,
    };
  }

  private resolveLastActivityAt(cart: CartEntity): Date {
    const timestamps = [
      cart.updatedAt.getTime(),
      ...(cart.items ?? []).map((item) => item.updatedAt.getTime()),
    ];
    return new Date(Math.max(...timestamps));
  }
}
