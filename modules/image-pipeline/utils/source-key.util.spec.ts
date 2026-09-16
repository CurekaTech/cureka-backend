import {
  assertSafeJobPayload,
  isBlockedRemoteUrl,
  isSafeObjectKey,
  shouldSkipSourceKey,
} from './source-key.util';

describe('source-key.util', () => {
  it('should reject path traversal and absolute paths', () => {
    expect(isSafeObjectKey('../etc/passwd')).toBe(false);
    expect(isSafeObjectKey('/etc/passwd')).toBe(false);
    expect(isSafeObjectKey('images/ok.webp')).toBe(true);
  });

  it('should skip derivative objects and private folders', () => {
    expect(shouldSkipSourceKey('derivatives/v1/abc/w240.webp', 'derivatives')).toBe(true);
    expect(shouldSkipSourceKey('return-evidence/a.jpg', 'derivatives')).toBe(true);
    expect(shouldSkipSourceKey('images/a.jpg', 'derivatives')).toBe(false);
  });

  it('should reject private/metadata remote URLs', () => {
    expect(isBlockedRemoteUrl('http://127.0.0.1/image.jpg')).toBe(true);
    expect(isBlockedRemoteUrl('http://169.254.169.254/latest/meta-data')).toBe(true);
    expect(isBlockedRemoteUrl('https://user:pass@cdn.example.com/a.jpg')).toBe(true);
    expect(isBlockedRemoteUrl('https://cdn.example.com/a.jpg')).toBe(false);
  });

  it('should reject arbitrary job payloads', () => {
    expect(() =>
      assertSafeJobPayload({
        sourceBucket: 'bucket',
        sourceKey: '../secret',
        processToken: 'not-a-uuid',
        pipelineVersion: 'v1',
      }),
    ).toThrow('Invalid image job payload');
  });
});
