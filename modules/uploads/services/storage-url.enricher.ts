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

    return items.map((item, index) => {
      const reference = references[index] ?? null;
      if (!reference) return item;
      return assignReference(item, reference);
    });
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

