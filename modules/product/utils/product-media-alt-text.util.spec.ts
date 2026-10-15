import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductMediaDto, VariantImageDto } from '../dto/variant.dto';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { parseCommonMediaColumns, parsePrimaryAndGalleryImages } from './bulk-upload-image.util';
import {
  ALT_TEXT_MAX_LENGTH,
  applyAltTextBackfillBatch,
  applyPreservedAltText,
  buildProductMediaAltText,
  normalizeIncomingAltText,
} from './product-media-alt-text.util';

describe('normalizeIncomingAltText', () => {
  it('trims text and keeps an empty string', () => {
    expect(normalizeIncomingAltText('  Cetaphil cleanser  ')).toBe('Cetaphil cleanser');
    expect(normalizeIncomingAltText('   ')).toBe('');
    expect(normalizeIncomingAltText(undefined)).toBeUndefined();
    expect(normalizeIncomingAltText(null)).toBeUndefined();
  });

  it('caps stored text at 250 characters', () => {
    const long = 'a'.repeat(ALT_TEXT_MAX_LENGTH + 10);
    expect(normalizeIncomingAltText(long)).toHaveLength(ALT_TEXT_MAX_LENGTH);
  });
});

describe('product media alt text DTOs', () => {
  it('rejects alt text longer than 250 characters', async () => {
    const dto = plainToInstance(CreateProductMediaDto, {
      type: ProductMediaType.IMAGE,
      url: 'images/cleanser.webp',
      altText: 'x'.repeat(251),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'altText')).toBe(true);
  });

  it('trims variant image alt text and accepts an empty string', async () => {
    const dto = plainToInstance(VariantImageDto, {
      url: 'images/cleanser.webp',
      altText: '  236 ml  ',
    });
    expect(dto.altText).toBe('236 ml');
    expect(await validate(dto)).toEqual([]);

    const decorative = plainToInstance(VariantImageDto, {
      url: 'images/cleanser.webp',
      altText: '   ',
    });
    expect(decorative.altText).toBe('');
    expect(await validate(decorative)).toEqual([]);
  });
});

describe('applyPreservedAltText', () => {
  const existing = [
    {
      variantId: 'var-1',
      storageKey: 'images/cleanser.webp',
      altText: 'Cetaphil Gentle Skin Cleanser, 236 ml',
    },
    {
      variantId: null,
      storageKey: 'images/common.webp',
      altText: '',
    },
  ];

  it('keeps the stored alt text when the replace omits the field', () => {
    const [row] = applyPreservedAltText(
      [
        {
          variantId: 'var-1',
          storageKey: 'images/cleanser.webp',
        },
      ],
      existing,
    );
    expect(row?.altText).toBe('Cetaphil Gentle Skin Cleanser, 236 ml');
  });

  it('stores an empty string when the client sends one', () => {
    const [row] = applyPreservedAltText(
      [
        {
          variantId: 'var-1',
          storageKey: 'images/cleanser.webp',
          altText: '',
        },
      ],
      existing,
    );
    expect(row?.altText).toBe('');
  });

  it('does not copy alt text onto a different variant', () => {
    const [row] = applyPreservedAltText(
      [
        {
          variantId: 'var-2',
          storageKey: 'images/cleanser.webp',
        },
      ],
      existing,
    );
    expect(row?.altText).toBeNull();
  });
});

describe('bulk upload alt columns', () => {
  const headerMap = new Map<string, number>([
    ['primary_image_url', 0],
    ['primary_image_alt', 1],
    ['gallery_image_2_url', 2],
    ['common_media_1_url', 3],
    ['common_media_1_alt', 4],
  ]);

  it('reads optional alt columns and ignores blanks', () => {
    const values: Record<string, string> = {
      primary_image_url: 'https://cdn.example/cleanser.webp',
      primary_image_alt: '  Cetaphil Gentle Skin Cleanser  ',
      gallery_image_2_url: 'https://cdn.example/gallery.webp',
      gallery_image_2_alt: '   ',
      common_media_1_url: 'https://cdn.example/common.webp',
      common_media_1_alt: 'Shared bottle',
    };
    const getVal = (name: string) => values[name] ?? '';
    const images = parsePrimaryAndGalleryImages(getVal, (names) => {
      for (const name of names) {
        if (values[name]) return values[name];
      }
      return '';
    });
    expect(images[0]?.altText).toBe('Cetaphil Gentle Skin Cleanser');
    expect(images[1]?.altText).toBeUndefined();

    const common = parseCommonMediaColumns(getVal, headerMap);
    expect(common[0]?.altText).toBe('Shared bottle');
  });
});

describe('buildProductMediaAltText', () => {
  it('joins brand, product name, and pack label', () => {
    expect(
      buildProductMediaAltText({
        brandName: 'Cetaphil',
        productName: 'Gentle Skin Cleanser',
        packLabel: '236 ml',
      }),
    ).toBe('Cetaphil Gentle Skin Cleanser, 236 ml');
  });

  it('returns null when the product name is missing', () => {
    expect(buildProductMediaAltText({ brandName: 'Cetaphil', packLabel: '236 ml' })).toBeNull();
  });
});

describe('applyAltTextBackfillBatch', () => {
  const blank = {
    id: 'row-1',
    altText: null,
    brandName: 'Cetaphil',
    productName: 'Gentle Skin Cleanser',
    packLabel: '236 ml',
  };
  const named = {
    id: 'row-2',
    altText: 'Already labeled',
    productName: 'Gentle Skin Cleanser',
  };
  const decorative = {
    id: 'row-3',
    altText: '',
    productName: 'Gentle Skin Cleanser',
  };
  const missing = {
    id: 'row-4',
    altText: null,
    productName: '  ',
  };

  it('writes nothing on a dry run', async () => {
    const persist = jest.fn();
    const counts = await applyAltTextBackfillBatch([blank], { apply: false, overwrite: false }, persist);
    expect(persist).not.toHaveBeenCalled();
    expect(counts).toMatchObject({ scanned: 1, eligible: 1, updated: 0, failed: 0 });
  });

  it('fills null alt text and keeps existing text, including an empty string', async () => {
    const stored = new Map<string, string | null>();
    const persist = jest.fn(async (id: string, altText: string) => {
      stored.set(id, altText);
    });
    const first = await applyAltTextBackfillBatch(
      [blank, named, decorative, missing],
      { apply: true, overwrite: false },
      persist,
    );
    expect(first).toMatchObject({
      scanned: 4,
      missing: 1,
      eligible: 1,
      updated: 1,
      skipped: 3,
      failed: 0,
    });
    expect(stored.get('row-1')).toBe('Cetaphil Gentle Skin Cleanser, 236 ml');
    expect(stored.has('row-2')).toBe(false);
    expect(stored.has('row-3')).toBe(false);

    const second = await applyAltTextBackfillBatch(
      [{ ...blank, altText: stored.get('row-1') ?? null }, named, decorative],
      { apply: true, overwrite: false },
      persist,
    );
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(3);
  });

  it('continues after one row fails', async () => {
    const persist = jest.fn(async (id: string) => {
      if (id === 'row-1') throw new Error('db down');
    });
    const counts = await applyAltTextBackfillBatch(
      [blank, { ...blank, id: 'row-5' }],
      { apply: true, overwrite: false },
      persist,
    );
    expect(counts.updated).toBe(1);
    expect(counts.failed).toBe(1);
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
