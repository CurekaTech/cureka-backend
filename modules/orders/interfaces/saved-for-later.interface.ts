import { IStorageFileReferenceResponse } from '@packages/storage';
import { CartResponse } from './cart-pricing.interface';
import { SavedForLaterUnavailableReason } from '../constants/saved-for-later.constants';

export type SavedForLaterListItem = {
  id: string;
  productId: string;
  productVariantId: string;
  quantity: number;
  isSubscription: boolean;
  frequency: string | null;
  product: {
    slug: string | null;
    title: string;
    image: IStorageFileReferenceResponse | null;
    brand: string | null;
  };
  variant: {
    id: string | null;
    title: string | null;
    sku: string | null;
    currentPrice: number | null;
    originalPrice: number | null;
    discount: number | null;
    stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
    availableQuantity: number;
    isActive: boolean;
  };
  canMoveToCart: boolean;
  unavailableReason: SavedForLaterUnavailableReason | null;
  savedAt: Date;
};

export type SaveForLaterFromCartResponse = {
  savedItem: SavedForLaterListItem;
  cart: CartResponse;
};

export type MoveSavedItemToCartResponse = {
  cart: CartResponse;
};
