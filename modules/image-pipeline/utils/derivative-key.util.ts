export const buildDerivativeObjectKey = (input: {
  prefix: string;
  pipelineVersion: string;
  sourceHash: string;
  width: number;
  format: 'webp';
}): string => {
  const prefix = input.prefix.replace(/^\/+|\/+$/g, '');
  const version = input.pipelineVersion.replace(/[^a-z0-9._-]/gi, '');
  const hash = input.sourceHash.replace(/[^a-f0-9]/gi, '').slice(0, 64);
  return `${prefix}/${version}/${hash}/w${input.width}.${input.format}`;
};

export const selectOutputWidth = (sourceWidth: number, requestedWidth: number): number => {
  if (sourceWidth <= 0 || requestedWidth <= 0) return sourceWidth;
  return Math.min(sourceWidth, requestedWidth);
};

export const requiredWidthsForSource = (
  sourceWidth: number,
  allowedWidths: number[],
): number[] => {
  const applicable = allowedWidths.filter((width) => width <= sourceWidth);
  if (applicable.length === 0 && sourceWidth > 0) {
    return [sourceWidth];
  }
  return applicable;
};
