import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '@packages/common';
import { StorageService } from '@packages/storage';

@Injectable()
export class StorageUrlEnricher {
  constructor(private readonly storageService: StorageService) {}

  async resolve(value: string | null | undefined): Promise<string | null> {
    return this.storageService.resolveAccessibleUrl(value);
  }

  async enrichFields<T extends object>(item: T, fields: Array<keyof T & string>): Promise<T> {
    const enriched = { ...item } as Record<string, unknown>;

    for (const field of fields) {
      const value = item[field];
      if (typeof value === 'string') {
        enriched[field] = (await this.resolve(value)) ?? value;
      }
    }

    return enriched as T;
  }

  async enrichManyFields<T extends object>(
    items: T[],
    fields: Array<keyof T & string>,
  ): Promise<T[]> {
    return Promise.all(items.map((item) => this.enrichFields(item, fields)));
  }

  async enrichPaginated<T extends object>(
    result: PaginatedResult<T>,
    fields: Array<keyof T & string>,
  ): Promise<PaginatedResult<T>> {
    return {
      ...result,
      data: await this.enrichManyFields(result.data, fields),
    };
  }
}
