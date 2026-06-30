import { registerAs } from '@nestjs/config';

function normalizeHost(host: string | undefined): string | null {
  if (!host?.trim()) {
    return null;
  }

  const trimmed = host.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export const typesenseConfig = registerAs('typesense', () => ({
  host: normalizeHost(process.env['TYPESENSE_HOST']),
  adminApiKey: process.env['TYPESENSE_API_KEY'] ?? null,
  searchApiKey: process.env['TYPESENSE_SEARCH_API_KEY'] ?? null,
  collection: process.env['TYPESENSE_COLLECTION'] ?? 'products',
  enabled: Boolean(
    normalizeHost(process.env['TYPESENSE_HOST']) && process.env['TYPESENSE_API_KEY']?.trim(),
  ),
}));
