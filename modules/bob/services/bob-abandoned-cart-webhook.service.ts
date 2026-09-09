import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAbandonedCartsService } from '@modules/orders/services/admin-abandoned-carts.service';
import { BobAbandonedCartPayload } from '../interfaces/bob.interface';
import { mapCurekaAbandonedCartToBob } from '../mappers/bob.mapper';
import { BobAbandonedCartWebhookQueryDto } from '../dto/bob-abandoned-cart-webhook.dto';

@Injectable()
export class BobAbandonedCartWebhookService {
  private readonly logger = new Logger(BobAbandonedCartWebhookService.name);

  constructor(
    private readonly abandonedCartsService: AdminAbandonedCartsService,
    private readonly configService: ConfigService,
  ) {}

  async list(query: BobAbandonedCartWebhookQueryDto): Promise<{
    carts: BobAbandonedCartPayload[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.abandonedCartsService.findAll({
      page,
      limit,
      search: query.search,
      fromDate: query.fromDate,
      toDate: query.toDate,
      sortBy: 'lastActivityAt',
      sortOrder: 'DESC',
    });

    const recoveryBase = this.recoveryBaseUrl();
    const carts: BobAbandonedCartPayload[] = [];

    for (const row of result.data) {
      try {
        const detail = await this.abandonedCartsService.findOne(row.refId);
        carts.push(
          mapCurekaAbandonedCartToBob({
            detail,
            recoveryUrl: `${recoveryBase}/cart`,
            storefrontUrl: recoveryBase,
          }),
        );
      } catch (error) {
        this.logger.warn(
          {
            cartRefId: row.refId,
            error: error instanceof Error ? error.message : String(error),
          },
          '[BOB webhook] skip abandoned cart — detail load failed',
        );
      }
    }

    return {
      carts,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async getOne(refId: string): Promise<BobAbandonedCartPayload> {
    try {
      const detail = await this.abandonedCartsService.findOne(refId);
      return mapCurekaAbandonedCartToBob({
        detail,
        recoveryUrl: `${this.recoveryBaseUrl()}/cart`,
        storefrontUrl: this.recoveryBaseUrl(),
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Abandoned cart not found');
    }
  }

  private recoveryBaseUrl(): string {
    return (
      this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '') ??
      'https://cureka.com'
    );
  }
}
