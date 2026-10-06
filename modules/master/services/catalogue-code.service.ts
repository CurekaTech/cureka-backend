import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { allocateCatalogueCode } from '../utils/catalogue-code.util';

/** Stable lock so two brand/category creates cannot take the same code. */
const CATALOGUE_CODE_LOCK = 81420106;

@Injectable()
export class CatalogueCodeService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Picks a code that no brand or category already has, then runs `persist`
   * in the same transaction so the code cannot be taken twice.
   */
  async createWithCode<T>(
    name: string,
    fallback: string,
    persist: (skuCode: string, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [CATALOGUE_CODE_LOCK]);
      const rows: Array<{ sku_code: string | null }> = await manager.query(`
        SELECT sku_code FROM brands WHERE sku_code IS NOT NULL
        UNION
        SELECT sku_code FROM categories WHERE sku_code IS NOT NULL
      `);
      const taken = new Set(
        rows.map((row) => row.sku_code).filter((code): code is string => Boolean(code)),
      );
      return persist(allocateCatalogueCode(name, taken, fallback), manager);
    });
  }
}
