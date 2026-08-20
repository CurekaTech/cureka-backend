import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrdersService } from '@modules/orders/services/orders.service';
import { ShipmentsRepository } from '@modules/shipping/repositories/shipments.repository';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { UsersService } from '@modules/users/services/users.service';
import { BobCancelOrderDto } from '../dto/bob.dto';
import { BobOrderPayload, BobPersonalDetails } from '../interfaces/bob.interface';
import { mapBobOrder, mapBobPersonalDetails } from '../mappers/bob.mapper';
import { toBobIndianMobile } from '../utils/bob.util';

@Injectable()
export class BobBrandService {
  private readonly logger = new Logger(BobBrandService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    private readonly userAddressesService: UserAddressesService,
    private readonly shipmentsRepository: ShipmentsRepository,
  ) {}

  async getOrder(orderId: string): Promise<BobOrderPayload> {
    const order = await this.findOrder(orderId);
    if (!order) {
      this.logger.warn({ orderId }, '[BOB] order not found');
      throw new NotFoundException('Bad Request!!');
    }
    const shipment = await this.shipmentsRepository.findByOrderId(order.id);
    return mapBobOrder(order, shipment);
  }

  async getLastThreeOrders(phone: string): Promise<BobOrderPayload[]> {
    const user = await this.usersService.findByMobileNumber(toBobIndianMobile(phone));
    if (!user) {
      return [];
    }
    const orders = await this.ordersRepository.findRecentPlacedByUserId(user.id, 3);
    return Promise.all(
      orders.map(async (order) => {
        const shipment = await this.shipmentsRepository.findByOrderId(order.id);
        return mapBobOrder(order, shipment);
      }),
    );
  }

  async getPersonalDetailsByPhone(phone: string): Promise<BobPersonalDetails> {
    const user = await this.usersService.findByMobileNumber(toBobIndianMobile(phone));
    if (!user) {
      throw new NotFoundException('Bad request!!');
    }
    return this.buildPersonalDetails(user.id);
  }

  async getPersonalDetailsByEmail(email: string): Promise<BobPersonalDetails> {
    if (!email?.trim()) {
      throw new BadRequestException('Bad request!!');
    }
    const user = await this.usersService.findByEmail(email.trim().toLowerCase());
    if (!user) {
      throw new NotFoundException('Bad request!!');
    }
    return this.buildPersonalDetails(user.id);
  }

  async cancelOrder(dto: BobCancelOrderDto): Promise<BobPersonalDetails> {
    const reason = (dto.cancellationReason ?? '').trim();
    const safeReason = reason.length >= 3 ? reason : 'Cancelled via WhatsApp bot';
    const existing = await this.findOrder(dto.id.trim());
    if (!existing) {
      throw new NotFoundException('Bad payload!!');
    }
    await this.ordersService.cancelForAdmin(existing.id, { reason: safeReason }, 'bob');
    return this.buildPersonalDetails(existing.userId);
  }

  private async buildPersonalDetails(userId: string): Promise<BobPersonalDetails> {
    const user = await this.usersService.findById(userId);
    const [addresses, stats, recent] = await Promise.all([
      this.userAddressesService.findAll(userId),
      this.ordersRepository.getCustomerOrderStats(userId),
      this.ordersRepository.findRecentPlacedByUserId(userId, 1),
    ]);
    const last = recent[0];
    const shipment = last ? await this.shipmentsRepository.findByOrderId(last.id) : null;
    const defaultAddress = addresses.find((row) => row.isDefault) ?? addresses[0] ?? null;
    return mapBobPersonalDetails({
      user,
      address: defaultAddress,
      ordersCount: stats.count,
      totalSpent: stats.totalSpent,
      lastOrder: last ? mapBobOrder(last, shipment) : null,
    });
  }

  private async findOrder(orderId: string) {
    const trimmed = orderId.replace(/^#/, '').trim();
    return (
      (await this.ordersRepository.findByOrderNumber(trimmed)) ??
      (await this.ordersRepository.findByIdOrRefId(trimmed))
    );
  }
}
