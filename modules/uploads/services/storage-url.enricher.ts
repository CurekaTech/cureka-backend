import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '@packages/common';
import {
  IStorageFileReference,
  IStorageFileReferenceResponse,
  StorageService,
} from '@packages/storage';

@Injectable()
export class StorageUrlEnricher {
  constructor(private readonly storageService: StorageService) {}

  async toReference(
    value: string | IStorageFileReference | null | undefined,
  ): Promise<IStorageFileReferenceResponse | null> {
    const persisted = this.storageService.persistFileReference(value);
    if (!persisted) return null;
    return this.storageService.toFileReferenceResponse(persisted);
  }

  /**
   * Recursively walks a value and signs every storage reference (`{ key, name }`)
   * it finds, returning `{ key, name, url }`. Use this to enrich cached payloads
   * AFTER reading them from Redis, so short-lived signed URLs are never persisted
   * in a cache that outlives them.
   */
  async enrichDeep<T>(value: T): Promise<T> {
    return (await this.enrichDeepValue(value)) as T;
  }

  private async enrichDeepValue(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.enrichDeepValue(item)));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    // Only traverse plain objects; leave Dates, class instances, etc. untouched.
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return value;
    }

    const record = value as Record<string, unknown>;

    if (typeof record['key'] === 'string' && typeof record['name'] === 'string') {
      return this.toReference(record as unknown as IStorageFileReference);
    }

    const entries = await Promise.all(
      Object.entries(record).map(
        async ([key, item]) => [key, await this.enrichDeepValue(item)] as const,
      ),
    );

    return Object.fromEntries(entries);
  }

  /** Normalize upload paths or references before saving to the database. */
  persist(
    value: string | IStorageFileReference | null | undefined,
  ): IStorageFileReference | null {
    return this.storageService.persistFileReference(value);
  }

  async enrichReferences<T>(
    items: T[],
    pickReference: (item: T) => string | IStorageFileReference | null | undefined,
    assignReference: (item: T, reference: IStorageFileReferenceResponse | null) => T,
  ): Promise<T[]> {
    if (!items.length) return items;

    const references = await this.storageService.toFileReferenceResponses(
      items.map((item) => this.storageService.persistFileReference(pickReference(item))),
    );

    return items.map((item, index) => assignReference(item, references[index] ?? null));
  }

  async enrichFields<T extends object>(item: T, fields: Array<keyof T & string>): Promise<T> {
    const enriched = { ...item } as Record<string, unknown>;

    await Promise.all(
      fields.map(async (field) => {
        const value = item[field];
        if (typeof value === 'string' || (value && typeof value === 'object')) {
          enriched[field] = await this.toReference(
            value as string | IStorageFileReference | null | undefined,
          );
        }
      }),
    );

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

