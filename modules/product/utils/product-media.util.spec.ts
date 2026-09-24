import { ProductMediaType } from '../enums/product-media-type.enum';
import { ProductType } from '../enums/product-type.enum';
import {
  collectProductMedia,
  mergeUploadedProductMedia,
} from './product-media.util';

describe('product-media.util multipart simple-product images', () => {
  const baseDto = {
    name: 'Test Age Image',
    slug: 'test-age-image',
    productType: ProductType.SIMPLE,
    categoryRefId: 'HEA20269560',
    brandRefId: 'AIR20269770',
    media: [
      {
        type: ProductMediaType.IMAGE,
        url: { key: 'images/907a98dc-9755-4284-bb86-722cadeb466a.jpg', name: 'cureka-files-prod' },
        sortOrder: 0,
        isPrimary: true,
      },
      {
        type: ProductMediaType.IMAGE,
        sortOrder: 1,
        isPrimary: false,
      },
    ],
    variants: [
      {
        sku: 'HEA/AIR/06219',
        mrp: 400,
        sellingPrice: 200,
        stock: 1,
        images: [
          {
            url: {
              key: 'images/907a98dc-9755-4284-bb86-722cadeb466a.jpg',
              name: 'cureka-files-prod',
            },
            isPrimary: true,
            sortOrder: 0,
          },
          {
            isPrimary: false,
            sortOrder: 1,
          },
        ],
      },
    ],
  };

  it('fills empty media and single-variant image slots from multipart field "images"', () => {
    const merged = mergeUploadedProductMedia(baseDto as never, {
      productImages: ['images/new-upload-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'],
      variantImages: {},
    });

    expect(merged.media).toEqual([
      expect.objectContaining({
        url: 'images/907a98dc-9755-4284-bb86-722cadeb466a.jpg',
        isPrimary: true,
        sortOrder: 0,
      }),
      expect.objectContaining({
        url: 'images/new-upload-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg',
        isPrimary: false,
        sortOrder: 1,
      }),
    ]);

    expect(merged.variants?.[0]?.images).toEqual([
      expect.objectContaining({
        url: 'images/907a98dc-9755-4284-bb86-722cadeb466a.jpg',
        isPrimary: true,
        sortOrder: 0,
      }),
      expect.objectContaining({
        url: 'images/new-upload-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg',
        isPrimary: false,
        sortOrder: 1,
      }),
    ]);
  });

  it('collects both images as variant-scoped rows for simple products', () => {
    const merged = mergeUploadedProductMedia(baseDto as never, {
      productImages: ['images/new-upload-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'],
      variantImages: {},
    });

    const media = collectProductMedia(merged);

    expect(media).toHaveLength(2);
    expect(media.every((item) => item.variantSku === 'HEA/AIR/06219')).toBe(true);
    expect(media.map((item) => item.url)).toEqual([
      'images/907a98dc-9755-4284-bb86-722cadeb466a.jpg',
      'images/new-upload-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg',
    ]);
  });

  it('prefers dedicated variantImages_<sku> over product images for that variant', () => {
    const merged = mergeUploadedProductMedia(baseDto as never, {
      productImages: ['images/product-level.jpg'],
      variantImages: {
        'HEA/AIR/06219': ['images/variant-dedicated.jpg'],
      },
    });

    expect(merged.variants?.[0]?.images?.map((image) => image.url)).toEqual([
      'images/907a98dc-9755-4284-bb86-722cadeb466a.jpg',
      'images/variant-dedicated.jpg',
    ]);
  });
});
