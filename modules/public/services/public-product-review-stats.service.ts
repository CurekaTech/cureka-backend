import { Injectable } from '@nestjs/common';
import { ProductReviewsRepository } from '@modules/product/repositories/product-reviews.repository';

export interface ApprovedReviewStats {
  averageRating: number;
  reviewCount: number;
}

@Injectable()
export class PublicProductReviewStatsService {
  constructor(private readonly reviewsRepository: ProductReviewsRepository) {}

  async attach<T extends { id: string }>(cards: T[]): Promise<Array<T & ApprovedReviewStats>> {
    const stats = await this.reviewsRepository.summarizeApprovedByProductIds(
      cards.map((card) => card.id),
    );
    return cards.map((card) => {
      const stat = stats.get(card.id);
      return {
        ...card,
        averageRating: stat?.averageRating ?? 0,
        reviewCount: stat?.reviewCount ?? 0,
      };
    });
  }

  /** Mutates product-card-shaped objects nested in a public payload. */
  async attachDeep(value: unknown): Promise<void> {
    const cards: Array<{ id: string; averageRating?: number; reviewCount?: number }> = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      const record = node as Record<string, unknown>;
      if (
        typeof record['id'] === 'string' &&
        record['pricing'] &&
        typeof record['pricing'] === 'object' &&
        typeof record['slug'] === 'string'
      ) {
        cards.push(record as { id: string; averageRating?: number; reviewCount?: number });
      }
      for (const child of Object.values(record)) walk(child);
    };
    walk(value);
    if (!cards.length) return;
    const stats = await this.reviewsRepository.summarizeApprovedByProductIds(
      cards.map((card) => card.id),
    );
    for (const card of cards) {
      const stat = stats.get(card.id);
      card.averageRating = stat?.averageRating ?? 0;
      card.reviewCount = stat?.reviewCount ?? 0;
    }
  }
}
