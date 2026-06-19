import { ValueTransformer } from 'typeorm';
import { IStorageFileReference, isStorageFileReference } from './storage-file-reference.interface';
import { normalizeStorageKey } from './storage-path.util';

/** Parse a jsonb column value (or legacy string) into a file reference. */
export const parseStorageFileReference = (value: unknown): IStorageFileReference | null => {
  if (value == null) return null;

  if (isStorageFileReference(value)) {
    const key = normalizeStorageKey(value.key);
    if (!key) return null;
    return { key, name: value.name };
  }

  if (typeof value === 'string') {
    const key = normalizeStorageKey(value);
    if (!key) return null;
    return { key, name: 'legacy' };
  }

  return null;
};

export const storageFileReferenceTransformer: ValueTransformer = {
  to: (value: IStorageFileReference | null | undefined) => {
    if (value == null) return null;
    if (!isStorageFileReference(value)) {
      throw new TypeError('Expected IStorageFileReference for storage column');
    }
    const key = normalizeStorageKey(value.key);
    if (!key) return null;
    return { key, name: value.name };
  },
  from: (value: unknown) => parseStorageFileReference(value),
};
