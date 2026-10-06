import { createHash } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export type BackfillCheckpoint = {
  version: 1;
  spreadsheetFingerprint: string;
  manifestFingerprint: string | null;
  completedProductIds: string[];
  updatedAt: string;
};

export const fileSha256 = (filePath: string): string => {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
};

export const loadCheckpoint = (filePath: string): BackfillCheckpoint | null => {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as BackfillCheckpoint;
    if (raw?.version !== 1 || !Array.isArray(raw.completedProductIds)) return null;
    return raw;
  } catch {
    return null;
  }
};

/** Atomic write: temp file then rename. */
export const saveCheckpointAtomic = (filePath: string, data: BackfillCheckpoint): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
};

export const assertCheckpointFingerprints = (
  checkpoint: BackfillCheckpoint,
  spreadsheetFingerprint: string,
  manifestFingerprint: string | null,
): void => {
  if (checkpoint.spreadsheetFingerprint !== spreadsheetFingerprint) {
    throw new Error(
      'Checkpoint spreadsheet fingerprint mismatch — refuse --resume with a different Excel file',
    );
  }
  if ((checkpoint.manifestFingerprint ?? null) !== (manifestFingerprint ?? null)) {
    throw new Error(
      'Checkpoint manifest fingerprint mismatch — refuse --resume with a different manifest',
    );
  }
};
