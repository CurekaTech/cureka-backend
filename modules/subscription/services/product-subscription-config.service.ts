import { Injectable, NotFoundException } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import { ProductSubscriptionConfigDto } from '../dto/product-subscription-config.dto';
import { SubscriptionMissedPaymentAction } from '../enums/subscription-missed-payment-action.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { mapProductSubscriptionConfigToResponse } from '../mappers/product-subscription.mapper';
import { IProductSubscriptionConfig } from '../interfaces/product-subscription.interface';
import { ProductSubscriptionConfigsRepository } from '../repositories/product-subscription-configs.repository';

@Injectable()
export class ProductSubscriptionConfigService {
  constructor(private readonly configsRepository: ProductSubscriptionConfigsRepository) {}

  async upsertForProduct(
    productId: string,
    productVariantId: string | null,
    dto: ProductSubscriptionConfigDto,
    actor: string,
  ): Promise<IProductSubscriptionConfig> {
    const existing = await this.configsRepository.findByProductAndVariant(
      productId,
      productVariantId,
    );

    const payload = {
      productId,
      productVariantId,
      enabled: dto.enabled,
      frequencies: dto.frequencies,
      discountType: dto.discountType,
      discountValue: Number(dto.discountValue).toFixed(2),
      minDurationMonths: dto.minDurationMonths ?? null,
      maxDurationMonths: dto.maxDurationMonths ?? null,
      pauseAllowed: dto.pauseAllowed ?? true,
      frequencyChangeAllowed: dto.frequencyChangeAllowed ?? true,
      cancellationAllowed: dto.cancellationAllowed ?? true,
      skipAllowed: dto.skipAllowed ?? true,
      gracePeriodDays: dto.gracePeriodDays ?? 7,
      missedPaymentAction: dto.missedPaymentAction ?? SubscriptionMissedPaymentAction.PAUSE,
      renewalMethod: dto.renewalMethod ?? SubscriptionRenewalMethod.PAYMENT_LINK,
      reminderOffsetsJson: dto.reminderOffsetsJson ?? [7, 2, 0],
      updatedBy: actor,
    };

    if (existing) {
      await this.configsRepository.updateById(existing.id, payload);
      const updated = await this.configsRepository.findById(existing.id);
      if (!updated) throw new NotFoundException('Subscription config not found after update');
      return mapProductSubscriptionConfigToResponse(updated);
    }

    const refId = await generateUniqueRefId('pscfg', (c) => this.configsRepository.existsByRefId(c));
    const created = await this.configsRepository.create({
      ...payload,
      refId,
      createdBy: actor,
    });
    return mapProductSubscriptionConfigToResponse(created);
  }

  async disableForProduct(productId: string, actor = 'system'): Promise<void> {
    const configs = await this.configsRepository.findByProductId(productId);
    await Promise.all(
      configs.map((config) =>
        this.configsRepository.updateById(config.id, { enabled: false, updatedBy: actor }),
      ),
    );
  }

  async findForProductVariant(
    productId: string,
    productVariantId: string | null,
  ): Promise<IProductSubscriptionConfig | null> {
    const config = await this.configsRepository.findForProductVariant(productId, productVariantId);
    return config ? mapProductSubscriptionConfigToResponse(config) : null;
  }

  async findEntityForProductVariant(productId: string, productVariantId: string | null) {
    return this.configsRepository.findForProductVariant(productId, productVariantId);
  }

  async getByProductId(productId: string): Promise<IProductSubscriptionConfig[]> {
    const configs = await this.configsRepository.findByProductId(productId);
    return configs.map(mapProductSubscriptionConfigToResponse);
  }
}
