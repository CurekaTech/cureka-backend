import {
  buildDerivativeObjectKey,
  requiredWidthsForSource,
  selectOutputWidth,
} from './derivative-key.util';

describe('derivative-key.util', () => {
  it('should build deterministic keys from source identity', () => {
    const a = buildDerivativeObjectKey({
      prefix: 'derivatives',
      pipelineVersion: 'v1',
      sourceHash: 'abc123',
      width: 240,
      format: 'webp',
    });
    const b = buildDerivativeObjectKey({
      prefix: 'derivatives',
      pipelineVersion: 'v1',
      sourceHash: 'abc123',
      width: 240,
      format: 'webp',
    });
    expect(a).toBe('derivatives/v1/abc123/w240.webp');
    expect(a).toBe(b);
  });

  it('should change key when source hash or pipeline version changes', () => {
    const original = buildDerivativeObjectKey({
      prefix: 'derivatives',
      pipelineVersion: 'v1',
      sourceHash: 'aaa',
      width: 240,
      format: 'webp',
    });
    const replaced = buildDerivativeObjectKey({
      prefix: 'derivatives',
      pipelineVersion: 'v1',
      sourceHash: 'bbb',
      width: 240,
      format: 'webp',
    });
    expect(original).not.toBe(replaced);
  });

  it('should not require widths larger than the source', () => {
    expect(selectOutputWidth(180, 240)).toBe(180);
    expect(requiredWidthsForSource(180, [100, 160, 240, 480])).toEqual([100, 160]);
  });
});
