/**
 * Test review sheet. Dry-run unless --apply.
 * --apply is refused when the database name equals REVIEW_IMPORT_LIVE_DATABASE.
 *
 * Changing a SKU changes import_key. See product-review-import.shared.ts.
 *
 *   npm run review:import:test
 *   npm run review:import:test -- --apply
 */
import { parseReviewImportArgs, runProductReviewImport } from './product-review-import.shared';

const FILE = 'docs/Master-Data-Sheets/test-product-review.xlsx';

runProductReviewImport(parseReviewImportArgs(process.argv.slice(2), 'test', FILE)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
