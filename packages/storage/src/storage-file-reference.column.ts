import { storageFileReferenceTransformer } from './storage-file-reference.transformer';

export const storageFileReferenceColumn = (options?: {
  nullable?: boolean;
  name?: string;
}) => ({
  type: 'jsonb' as const,
  nullable: options?.nullable ?? true,
  ...(options?.name ? { name: options.name } : {}),
  transformer: storageFileReferenceTransformer,
});
