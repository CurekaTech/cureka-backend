import { BadRequestException } from '@nestjs/common';

export interface ResolvedPriceRange {
  minPrice?: number;
  maxPrice?: number;
}

const parsePrice = (raw: string | undefined): number | undefined => {
  if (!raw?.trim()) return undefined;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`Invalid price value "${raw}"`);
  }
  return value;
};

export const parsePriceRangeString = (priceRange: string): ResolvedPriceRange => {
  const trimmed = priceRange.trim();
  if (!trimmed) return {};

  const separator = trimmed.includes(',') ? ',' : '-';
  const [minRaw, maxRaw] = trimmed.split(separator, 2);

  return {
    minPrice: parsePrice(minRaw),
    maxPrice: parsePrice(maxRaw),
  };
};

export const resolvePublicPriceRange = (query: {
  minPrice?: number;
  maxPrice?: number;
  priceRange?: string;
}): ResolvedPriceRange | undefined => {
  let minPrice = query.minPrice;
  let maxPrice = query.maxPrice;

  if (query.priceRange?.trim()) {
    const parsed = parsePriceRangeString(query.priceRange);
    minPrice = minPrice ?? parsed.minPrice;
    maxPrice = maxPrice ?? parsed.maxPrice;
  }

  if (minPrice === undefined && maxPrice === undefined) {
    return undefined;
  }

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new BadRequestException('minPrice must be less than or equal to maxPrice');
  }

  return { minPrice, maxPrice };
};
