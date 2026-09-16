import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PaginatedResult } from '@packages/common';
import {
  IStorageFileReference,
  IStorageFileReferenceResponse,
  StorageService,
} from '@packages/storage';
import { ImageDeliveryService } from '@modules/image-pipeline/services/image-delivery.service';

@Injectable()
export class StorageUrlEnricher {
  constructor(
    private readonly storageService: StorageService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async toReference(
    value: string | IStorageFileReference | null | undefined,
  ): Promise<IStorageFileReferenceResponse | null> {
    const persisted = this.storageService.persistFileReference(value);
    if (!persisted) return null;
    const signed = await this.storageService.toFileReferenceResponse(persisted);
    const delivery = this.delivery();
    if (!delivery) return signed;
    return delivery.attachToResponse(persisted, signed);
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
    const collected: IStorageFileReference[] = [];
    this.collectRefs(value, collected);
    if (collected.length === 0) return value;

    const unique = this.uniqueRefs(collected);
    const signed = await this.storageService.toFileReferenceResponses(unique);
    const delivery = this.delivery();
    const attached = delivery ? await delivery.attachToMany(unique, signed) : signed;
    const byIdentity = new Map<string, IStorageFileReferenceResponse | null>();
    unique.forEach((ref, index) => {
      byIdentity.set(`${ref.name}\0${ref.key}`, attached[index] ?? null);
    });

    return this.rewriteRefs(value, byIdentity);
  }

  private collectRefs(value: unknown, collected: IStorageFileReference[]): void {
    if (Array.isArray(value)) {
      for (const item of value) this.collectRefs(item, collected);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return;

    const record = value as Record<string, unknown>;
    if (typeof record['key'] === 'string' && typeof record['name'] === 'string') {
      collected.push({ key: record['key'], name: record['name'] });
      return;
    }
    for (const item of Object.values(record)) {
      this.collectRefs(item, collected);
    }
  }

  private rewriteRefs(
    value: unknown,
    byIdentity: Map<string, IStorageFileReferenceResponse | null>,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.rewriteRefs(item, byIdentity));
    }
    if (!value || typeof value !== 'object') return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;

    const record = value as Record<string, unknown>;
    if (typeof record['key'] === 'string' && typeof record['name'] === 'string') {
      return byIdentity.get(`${record['name']}\0${record['key']}`) ?? value;
    }

    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      next[key] = this.rewriteRefs(item, byIdentity);
    }
    return next;
  }

  private uniqueRefs(refs: IStorageFileReference[]): IStorageFileReference[] {
    const seen = new Set<string>();
    const unique: IStorageFileReference[] = [];
    for (const ref of refs) {
      const identity = `${ref.name}\0${ref.key}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      unique.push(ref);
    }
    return unique;
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

    const persisted = items.map((item) =>
      this.storageService.persistFileReference(pickReference(item)),
    );
    const signed = await this.storageService.toFileReferenceResponses(persisted);
    const delivery = this.delivery();
    const attached = delivery ? await delivery.attachToMany(persisted, signed) : signed;

    return items.map((item, index) => assignReference(item, attached[index] ?? null));
  }

  async enrichFields<T extends object>(item: T, fields: Array<keyof T & string>): Promise<T> {
    const persisted = fields.map((field) => {
      const value = item[field];
      if (typeof value === 'string' || (value && typeof value === 'object')) {
        return this.storageService.persistFileReference(
          value as string | IStorageFileReference | null | undefined,
        );
      }
      return null;
    });
    const signed = await this.storageService.toFileReferenceResponses(persisted);
    const delivery = this.delivery();
    const attached = delivery ? await delivery.attachToMany(persisted, signed) : signed;

    const enriched = { ...item } as Record<string, unknown>;
    fields.forEach((field, index) => {
      if (persisted[index]) {
        enriched[field] = attached[index] ?? null;
      }
    });
    return enriched as T;
  }

  async enrichManyFields<T extends object>(
    items: T[],
    fields: Array<keyof T & string>,
  ): Promise<T[]> {
    if (!items.length) return items;
    const persisted: Array<IStorageFileReference | null> = [];
    const indexMap: Array<{ item: number; field: string }> = [];

    items.forEach((item, itemIndex) => {
      for (const field of fields) {
        const value = item[field];
        if (typeof value === 'string' || (value && typeof value === 'object')) {
          persisted.push(
            this.storageService.persistFileReference(
              value as string | IStorageFileReference | null | undefined,
            ),
          );
          indexMap.push({ item: itemIndex, field });
        }
      }
    });

    const signed = await this.storageService.toFileReferenceResponses(persisted);
    const delivery = this.delivery();
    const attached = delivery ? await delivery.attachToMany(persisted, signed) : signed;

    return items.map((item, itemIndex) => {
      const enriched = { ...item } as Record<string, unknown>;
      indexMap.forEach((entry, persistedIndex) => {
        if (entry.item !== itemIndex) return;
        enriched[entry.field] = attached[persistedIndex] ?? null;
      });
      return enriched as T;
    });
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

  private delivery(): ImageDeliveryService | null {
    try {
      return this.moduleRef.get(ImageDeliveryService, { strict: false });
    } catch {
      return null;
    }
  }
}
