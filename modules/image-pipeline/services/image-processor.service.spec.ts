import { ImageProcessorService } from './image-processor.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp');

describe('ImageProcessorService', () => {
  const processor = new ImageProcessorService();

  it('should preserve aspect ratio, transparency, and avoid upscaling', async () => {
    const source = await sharp({
      create: {
        width: 400,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const inspected = await processor.inspect(source, 40_000_000);
    expect(inspected.width).toBe(400);
    expect(inspected.height).toBe(200);
    expect(inspected.hasAlpha).toBe(true);
    expect(inspected.unsupportedReason).toBeUndefined();

    const encoded = await processor.encodeWebp({
      buffer: source,
      requestedWidth: 800,
      quality: 80,
      timeoutMs: 10_000,
      maxDecodedPixels: 40_000_000,
    });

    expect(encoded.width).toBe(400);
    expect(encoded.height).toBe(200);
    expect(encoded.format).toBe('webp');
    expect(encoded.bytes).toBeGreaterThan(0);

    const webpMeta = await sharp(encoded.buffer).metadata();
    expect(webpMeta.hasAlpha).toBe(true);
  });

  it('should apply EXIF orientation', async () => {
    const source = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const encoded = await processor.encodeWebp({
      buffer: source,
      requestedWidth: 300,
      quality: 80,
      timeoutMs: 10_000,
      maxDecodedPixels: 40_000_000,
    });

    expect(encoded.width).toBe(100);
    expect(encoded.height).toBe(300);
  });

  it('should reject corrupt bytes', async () => {
    await expect(processor.inspect(Buffer.from('not-an-image'), 40_000_000)).rejects.toMatchObject({
      code: 'unsupported',
      permanent: true,
    });
  });

  it('should not rasterize SVG', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    const inspected = await processor.inspect(svg, 40_000_000);
    expect(inspected.unsupportedReason).toBe('svg');
  });

  it('should mark animated gif as unsupported', async () => {
    const frame = await sharp({
      create: { width: 8, height: 8, channels: 3, background: 'red' },
    })
      .gif()
      .toBuffer();
    const inspected = await processor.inspect(frame, 40_000_000);
    expect(['gif', 'unknown', inspected.format]).toContain(inspected.format);
  });

  it('should measure representative reductions', async () => {
    const product = await sharp({
      create: {
        width: 1500,
        height: 1500,
        channels: 3,
        background: { r: 220, g: 40, b: 40 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const hero = await sharp({
      create: {
        width: 2875,
        height: 1025,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const widths = [100, 160, 240, 480, 800, 1200, 1600];
    const report: Array<Record<string, number | string>> = [];

    for (const [label, buffer] of [
      ['product-1500', product],
      ['hero-2875x1025', hero],
    ] as const) {
      for (const width of widths) {
        const encoded = await processor.encodeWebp({
          buffer,
          requestedWidth: width,
          quality: 80,
          timeoutMs: 15_000,
          maxDecodedPixels: 40_000_000,
        });
        report.push({
          source: label,
          sourceBytes: buffer.length,
          requestedWidth: width,
          outputWidth: encoded.width,
          outputHeight: encoded.height,
          outputBytes: encoded.bytes,
          reductionPct: Number((100 - (encoded.bytes / buffer.length) * 100).toFixed(1)),
        });
      }
    }

    const product240 = report.find(
      (row) => row.source === 'product-1500' && row.requestedWidth === 240,
    );
    const hero800 = report.find(
      (row) => row.source === 'hero-2875x1025' && row.requestedWidth === 800,
    );

    expect(product240?.outputBytes).toBeLessThan(Number(product240?.sourceBytes));
    expect(hero800?.outputBytes).toBeLessThan(Number(hero800?.sourceBytes));
    expect(report.length).toBe(widths.length * 2);
  });
});
