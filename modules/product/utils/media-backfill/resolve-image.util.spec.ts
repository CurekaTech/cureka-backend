import { resolveImageSource } from './resolve-image.util';
import { ManifestIndex } from './types';

jest.mock('./http-fetch.util', () => ({
  fetchImageWithRetry: jest.fn(),
}));

import { fetchImageWithRetry } from './http-fetch.util';

const fetchMock = fetchImageWithRetry as jest.MockedFunction<typeof fetchImageWithRetry>;

describe('resolveImageSource', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('reports MALFORMED_URL without fetching', async () => {
    const result = await resolveImageSource('https://legacy.cureka.com/wp-');
    expect(result.status).toBe('MALFORMED_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses exact URL on success', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      buffer: jpeg,
      contentType: 'image/jpeg',
      finalUrl: 'https://legacy.cureka.com/wp-content/uploads/2024/12/a.jpg',
    });
    const result = await resolveImageSource(
      'https://www.cureka.com/wp-content/uploads/2024/12/a.jpg',
    );
    expect(result.status).toBe('SUCCESS');
    expect(result.candidatePaths).toEqual([]);
  });

  it('reports AMBIGUOUS_SOURCE when basename has multiple candidates', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'HTTP 404',
      retryable: false,
      finalUrl: 'https://legacy.cureka.com/wp-content/uploads/2024/12/p74-2.jpg',
    });
    const manifest: ManifestIndex = {
      byBasename: new Map([
        [
          'p74-2.jpg',
          [
            'wp-content/uploads/2024/10/p74-2.jpg',
            'wp-content/uploads/2024/11/p74-2.jpg',
          ],
        ],
      ]),
      entryCount: 2,
      fingerprint: 'f',
    };
    const result = await resolveImageSource(
      'https://www.cureka.com/wp-content/uploads/2024/12/p74-2.jpg',
      { manifest },
    );
    expect(result.status).toBe('AMBIGUOUS_SOURCE');
    expect(result.candidatePaths.length).toBe(2);
  });

  it('retries unique manifest candidate after 404', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        error: 'HTTP 404',
        retryable: false,
        finalUrl: 'https://legacy.cureka.com/wp-content/uploads/2024/12/unique.jpg',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        buffer: jpeg,
        contentType: 'image/jpeg',
        finalUrl: 'https://legacy.cureka.com/wp-content/uploads/2025/01/unique.jpg',
      });
    const manifest: ManifestIndex = {
      byBasename: new Map([
        ['unique.jpg', ['wp-content/uploads/2025/01/unique.jpg']],
      ]),
      entryCount: 1,
      fingerprint: 'f',
    };
    const result = await resolveImageSource(
      'https://www.cureka.com/wp-content/uploads/2024/12/unique.jpg',
      { manifest },
    );
    expect(result.status).toBe('SUCCESS');
    expect(result.candidatePaths).toEqual(['wp-content/uploads/2025/01/unique.jpg']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports MISSING_SOURCE when 404 and no manifest hit', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'HTTP 404',
      retryable: false,
      finalUrl: 'https://legacy.cureka.com/wp-content/uploads/2025/02/gone.jpg',
    });
    const result = await resolveImageSource(
      'https://www.cureka.com/wp-content/uploads/2025/02/gone.jpg',
      { manifest: { byBasename: new Map(), entryCount: 0, fingerprint: 'f' } },
    );
    expect(result.status).toBe('MISSING_SOURCE');
  });
});
