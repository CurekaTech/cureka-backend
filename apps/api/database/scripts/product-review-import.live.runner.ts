/**
 * Live review sheet. Dry-run unless --apply --confirm-live.
 * --apply also requires REVIEW_IMPORT_LIVE_DATABASE to equal the database name in DATABASE_URL.
 * A missing or different name stops the script before any insert.
 *
 * Changing a SKU changes import_key. See product-review-import.shared.ts.
 * This task does not execute this script.
 *
 *   npm run review:import:live
 *   npm run review:import:live -- --apply --confirm-live
 */
import { parseReviewImportArgs, runProductReviewImport } from './product-review-import.shared';

const FILE = 'docs/Master-Data-Sheets/product-review-final.xlsx';

runProductReviewImport(parseReviewImportArgs(process.argv.slice(2), 'live', FILE)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
