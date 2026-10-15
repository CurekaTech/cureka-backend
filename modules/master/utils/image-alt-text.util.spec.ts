import {
  applyCmsAltBackfillBatch,
  assignStoredAltText,
  mergeJsonImageAlt,
  resolveStoredAltText,
} from './image-alt-text.util';

const sameFile = { key: 'banners/hero.png', name: 'hero.png' };

describe('CMS image alt text', () => {
  it('keeps stored alt text when the field is omitted for the same file', () => {
    expect(
      resolveStoredAltText({
        incoming: undefined,
        previousAlt: 'Hero banner',
        previousFile: sameFile,
        nextFile: sameFile,
      }),
    ).toBeUndefined();
    expect(
      resolveStoredAltText({
        incoming: null,
        previousAlt: 'Hero banner',
        previousFile: sameFile,
        nextFile: sameFile,
      }),
    ).toBeUndefined();

    const payload: { imageAltText?: string | null } = {};
    assignStoredAltText(payload, 'imageAltText', {
      incoming: undefined,
      previousAlt: 'Hero banner',
      previousFile: sameFile,
      nextFile: sameFile,
    });
    expect(payload).toEqual({});
  });

  it('stores an empty string as decorative alt text', () => {
    expect(
      resolveStoredAltText({
        incoming: '   ',
        previousAlt: 'Hero banner',
        previousFile: sameFile,
        nextFile: sameFile,
      }),
    ).toBe('');
  });

  it('clears alt text when the file key changes and alt text is omitted', () => {
    expect(
      resolveStoredAltText({
        incoming: undefined,
        previousAlt: 'Hero banner',
        previousFile: sameFile,
        nextFile: { key: 'banners/next.png', name: 'next.png' },
      }),
    ).toBeNull();
  });

  it('clears JSON alt text when the file key changes', () => {
    expect(
      mergeJsonImageAlt({
        incoming: undefined,
        previousAlt: 'Festive offer',
        previousFile: sameFile,
        nextFile: { key: 'banners/next.png', name: 'next.png' },
      }),
    ).toBeNull();
  });

  it('merges JSON alt text without replacing the rest of the object', () => {
    const banner = {
      imageUrl: sameFile,
      linkUrl: '/shop',
      variant: 'festive',
    };
    const imageAltText = mergeJsonImageAlt({
      incoming: undefined,
      previousAlt: 'Festive offer',
      previousFile: sameFile,
      nextFile: banner.imageUrl,
    });

    expect({ ...banner, imageAltText }).toEqual({
      imageUrl: sameFile,
      linkUrl: '/shop',
      variant: 'festive',
      imageAltText: 'Festive offer',
    });
  });

  it('dry-runs without writing, skips decorative text, and stays idempotent', async () => {
    const persist = jest.fn();
    const counts = await applyCmsAltBackfillBatch(
      [
        { id: '1', altText: null, label: 'Banner' },
        { id: '2', altText: '', label: 'Banner' },
        { id: '3', altText: 'Banner', label: 'Banner' },
        { id: '4', altText: null, label: '   ' },
      ],
      { apply: false, overwrite: false },
      persist,
    );

    expect(persist).not.toHaveBeenCalled();
    expect(counts).toEqual({
      scanned: 4,
      missing: 1,
      eligible: 1,
      updated: 0,
      skipped: 3,
      failed: 0,
    });
  });

  it('continues after one slot fails', async () => {
    const persist = jest.fn(async (id: string) => {
      if (id === 'bad') throw new Error('write failed');
    });
    const counts = await applyCmsAltBackfillBatch(
      [
        { id: 'bad', altText: null, label: 'First' },
        { id: 'good', altText: null, label: 'Second' },
      ],
      { apply: true, overwrite: false },
      persist,
    );

    expect(counts.updated).toBe(1);
    expect(counts.failed).toBe(1);
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
