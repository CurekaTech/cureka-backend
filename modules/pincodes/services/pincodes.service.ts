import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildPaginatedResult, buildPaginationOptions, PaginatedResult } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { EntityManager, In, Repository } from 'typeorm';
import {
  INDIAN_PINCODE_VALIDATION_MESSAGE,
  isValidIndianPincode,
  normalizePincode,
} from '@modules/cod-blocklist/utils/pincode.util';
import { escapeIlikePattern, toIlikeContains } from '@modules/cod-blocklist/utils/ilike-escape.util';
import { ProductVariantPincodeEntity } from '@modules/product/entities/product-variant-pincode.entity';
import { PincodeEntity } from '../entities/pincode.entity';
import { IPincodeSummary, IStorefrontPincodeScope } from '../interfaces/pincode.interface';

@Injectable()
export class PincodesService {
  constructor(
    @InjectRepository(PincodeEntity)
    private readonly pincodes: Repository<PincodeEntity>,
    @InjectRepository(ProductVariantPincodeEntity)
    private readonly mappings: Repository<ProductVariantPincodeEntity>,
  ) {}

  async resolveForStorefront(pincode?: string | null): Promise<IStorefrontPincodeScope> {
    const normalized = pincode?.trim() ? normalizePincode(pincode) : '';
    if (!normalized) {
      return { pincodeId: null, pincode: null };
    }
    if (!isValidIndianPincode(normalized)) {
      throw new BadRequestException(INDIAN_PINCODE_VALIDATION_MESSAGE);
    }
    const row = await this.pincodes.findOne({
      where: { pincode: normalized },
      select: ['id', 'pincode'],
    });
    if (!row) {
      throw new NotFoundException(`Pincode "${normalized}" not found`);
    }
    return { pincodeId: row.id, pincode: row.pincode };
  }

  async findPublicByCode(pincode: string): Promise<IPincodeSummary> {
    const normalized = normalizePincode(pincode);
    if (!isValidIndianPincode(normalized)) {
      throw new BadRequestException(INDIAN_PINCODE_VALIDATION_MESSAGE);
    }
    const row = await this.pincodes.findOne({ where: { pincode: normalized } });
    if (!row) {
      throw new NotFoundException(`Pincode "${normalized}" not found`);
    }
    return this.toSummary(row);
  }

  async searchAdmin(raw: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResult<IPincodeSummary>> {
    const options = buildPaginationOptions({
      page: raw.page,
      limit: raw.limit,
      search: raw.search,
      sortOrder: 'ASC',
    });
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const term = options.search?.trim() ?? '';
    const contains = term ? toIlikeContains(term) : null;
    const prefix = term ? `${escapeIlikePattern(term)}%` : null;
    const where = `
      WHERE $1::text IS NULL
         OR pincode ILIKE $1 ESCAPE '\\'
         OR district ILIKE $1 ESCAPE '\\'
         OR statename ILIKE $1 ESCAPE '\\'
    `;
    const [rows, countRows] = await Promise.all([
      this.pincodes.manager.query<
        Array<{ pincode: string; district: string; statename: string }>
      >(
        `
        SELECT pincode, district, statename
        FROM pincodes
        ${where}
        ORDER BY
          CASE
            WHEN $2::text IS NOT NULL AND pincode ILIKE $2 ESCAPE '\\' THEN 0
            WHEN $2::text IS NOT NULL AND district ILIKE $2 ESCAPE '\\' THEN 1
            WHEN $2::text IS NOT NULL AND statename ILIKE $2 ESCAPE '\\' THEN 2
            WHEN $1::text IS NOT NULL AND district ILIKE $1 ESCAPE '\\' THEN 3
            ELSE 4
          END,
          pincode ASC
        LIMIT $3 OFFSET $4
        `,
        [contains, prefix, take, skip],
      ),
      this.pincodes.manager.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total FROM pincodes ${where}`,
        [contains],
      ),
    ]);

    return buildPaginatedResult(
      rows.map((row) => ({
        pincode: row.pincode,
        city: row.district,
        state: row.statename,
      })),
      Number(countRows[0]?.total ?? 0),
      options,
    );
  }

  async listMappedSummaries(variantId: string): Promise<IPincodeSummary[]> {
    const rows = await this.mappings.find({
      where: { productVariantId: variantId },
      relations: { pincode: true },
      order: { createdAt: 'ASC' },
    });
    return rows
      .map((row) => row.pincode)
      .filter((pincode): pincode is PincodeEntity => Boolean(pincode))
      .map((pincode) => this.toSummary(pincode));
  }

  async listMappedCodes(variantId: string, manager?: EntityManager): Promise<string[]> {
    const repo = manager ? manager.getRepository(ProductVariantPincodeEntity) : this.mappings;
    const rows = await repo.find({
      where: { productVariantId: variantId },
      relations: { pincode: true },
    });
    return rows
      .map((row) => row.pincode?.pincode)
      .filter((code): code is string => Boolean(code))
      .sort();
  }

  async resolveExistingCodes(codes: string[]): Promise<PincodeEntity[]> {
    const unique = [...new Set(codes.map((code) => normalizePincode(code)))];
    const invalid = unique.filter((code) => !isValidIndianPincode(code));
    if (invalid.length) {
      throw new BadRequestException(INDIAN_PINCODE_VALIDATION_MESSAGE);
    }
    if (!unique.length) {
      return [];
    }
    const rows = await this.pincodes.find({ where: { pincode: In(unique) } });
    const found = new Set(rows.map((row) => row.pincode));
    const missing = unique.filter((code) => !found.has(code));
    if (missing.length) {
      throw new BadRequestException(`Unknown pincodes: ${missing.join(', ')}`);
    }
    return rows;
  }

  async replaceMappings(
    manager: EntityManager,
    variantId: string,
    pincodeIds: string[],
  ): Promise<void> {
    await manager.delete(ProductVariantPincodeEntity, { productVariantId: variantId });
    if (!pincodeIds.length) {
      return;
    }
    await manager.insert(
      ProductVariantPincodeEntity,
      pincodeIds.map((pincodeId) => ({ productVariantId: variantId, pincodeId })),
    );
  }

  async clearMappings(manager: EntityManager, variantId: string): Promise<void> {
    await manager.delete(ProductVariantPincodeEntity, { productVariantId: variantId });
  }

  async findMappedCodesByVariantIds(variantIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (!variantIds.length) {
      return result;
    }
    const rows = await this.mappings.find({
      where: { productVariantId: In(variantIds) },
      relations: { pincode: true },
    });
    for (const row of rows) {
      const code = row.pincode?.pincode;
      if (!code) continue;
      const list = result.get(row.productVariantId) ?? [];
      list.push(code);
      result.set(row.productVariantId, list);
    }
    return result;
  }

  private toSummary(row: PincodeEntity): IPincodeSummary {
    return {
      pincode: row.pincode,
      city: row.district,
      state: row.stateName,
    };
  }
}
