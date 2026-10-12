import path from 'node:path';
import { ReleaseNoteError } from './errors.mjs';

/** Release ids become a single directory name under reports/releases/. */
export const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function assertSafeReleaseId(releaseId) {
  if (typeof releaseId !== 'string' || !RELEASE_ID_PATTERN.test(releaseId)) {
    throw new ReleaseNoteError(
      'PATH_ESCAPE',
      `Release id "${releaseId}" is not a safe directory name. Use letters, numbers, dots, underscores, or hyphens.`,
    );
  }
  if (releaseId === '.' || releaseId === '..' || releaseId.includes('..')) {
    throw new ReleaseNoteError('PATH_ESCAPE', `Release id "${releaseId}" would escape reports/releases/.`);
  }
  return releaseId;
}

export function resolveReleaseOutputDir(repoRoot, releaseId) {
  assertSafeReleaseId(releaseId);
  const root = path.resolve(repoRoot);
  const reportsRoot = path.resolve(root, 'reports', 'releases');
  const destination = path.resolve(reportsRoot, releaseId);
  const relative = path.relative(reportsRoot, destination);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).includes('..')) {
    throw new ReleaseNoteError(
      'PATH_ESCAPE',
      `Refusing to write outside reports/releases/. Resolved path: ${destination}`,
    );
  }
  return destination;
}

export function assertInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ReleaseNoteError('PATH_ESCAPE', `Refusing to write outside ${parent}.`);
  }
  return path.resolve(child);
}
