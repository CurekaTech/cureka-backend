import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export function normalizeCheckoutCode(code: string): string {
  return code.trim().toUpperCase();
}

export function assertPromotionalCodeShape(code: string): void {
  if (!/^[A-Z0-9]{4,20}$/.test(code)) {
    throw new BadRequestException('Offer code must be 4 to 20 letters or numbers');
  }
}

/**
 * Same-table unique indexes do not cover coupons and promotional_offers together.
 * The lock and both lookups run on the transaction connection that performs the write.
 */
export async function assertCheckoutCodeAvailable(
  manager: EntityManager,
  code: string,
  exclude?: { couponRefId?: string | null; offerId?: string | null },
): Promise<void> {
  const normalized = normalizeCheckoutCode(code);
  await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [
    `checkout-code:${normalized}`,
  ]);
  const coupons: Array<{ ref_id: string }> = await manager.query(
    `SELECT ref_id
     FROM coupons
     WHERE deleted_at IS NULL
       AND UPPER(code) = $1
       AND ($2::varchar IS NULL OR ref_id <> $2)
     LIMIT 1`,
    [normalized, exclude?.couponRefId ?? null],
  );
  const offers: Array<{ id: string }> = await manager.query(
    `SELECT id
     FROM promotional_offers
     WHERE deleted_at IS NULL
       AND code IS NOT NULL
       AND UPPER(code) = $1
       AND ($2::uuid IS NULL OR id <> $2::uuid)
     LIMIT 1`,
    [normalized, exclude?.offerId ?? null],
  );
  if (coupons.length > 0 || offers.length > 0) {
    throw new ConflictException(`Code "${normalized}" is already used`);
  }
}
