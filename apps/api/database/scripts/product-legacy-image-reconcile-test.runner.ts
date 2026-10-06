/**
 * TechBV / current-environment test for legacy image reconciliation.
 *
 * Uses whatever database and storage the process environment is configured
 * with. It does not select a hardcoded database. Only legacy rows that match
 * a variant in that database are downloaded and updated.
 *
 *   npm run product:reconcile-legacy-images:test
 *   npm run product:reconcile-legacy-images:test -- --dry-run
 *   npm run product:reconcile-legacy-images:test -- --apply
 */
if (!process.argv.includes('--matched-only')) {
  process.argv.push('--matched-only');
}

require('./product-legacy-image-reconcile.runner');
