import { IStorageFileReference, isStorageFileReference } from '@packages/storage';

export const collectStorageReferences = (value: unknown): IStorageFileReference[] => {
  const collected: IStorageFileReference[] = [];
  walk(value, collected);
  return collected;
};

const walk = (value: unknown, collected: IStorageFileReference[]): void => {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, collected);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return;

  const record = value as Record<string, unknown>;
  if (typeof record['key'] === 'string' && typeof record['name'] === 'string') {
    if (isStorageFileReference(record)) {
      collected.push({ key: record.key, name: record.name });
    }
    return;
  }

  for (const item of Object.values(record)) {
    walk(item, collected);
  }
};
