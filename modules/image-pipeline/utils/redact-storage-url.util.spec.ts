import { redactStorageUrl, sanitizeErrorMessage } from './redact-storage-url.util';

describe('redact-storage-url.util', () => {
  it('should strip signed query parameters', () => {
    expect(
      redactStorageUrl(
        'https://storage.googleapis.com/bucket/images/a.jpg?X-Goog-Signature=secret&X-Goog-Credential=cred',
      ),
    ).toBe('https://storage.googleapis.com/bucket/images/a.jpg');
  });

  it('should not leak URLs in error text', () => {
    const message = sanitizeErrorMessage(
      new Error('failed https://storage.googleapis.com/b/k?X-Goog-Signature=abc'),
    );
    expect(message).not.toContain('X-Goog-Signature');
    expect(message).toContain('[redacted-url]');
  });
});
