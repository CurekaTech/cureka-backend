/**
 * Permission codes for promotional landing pages.
 *
 * Names follow the existing `{module}.{action}` catalogue (`read` is view,
 * `status` is publish/unpublish). Preview is a separate code because the
 * permission action enum has no preview value; it is stored as action `read`,
 * the same way report export permissions are stored.
 *
 * Rows are inserted by migration. Keep these codes in sync with
 * `ADMIN_PERMISSION_SEEDS`.
 */
export const PROMOTIONAL_PAGE_PERMISSIONS = {
  READ: 'promotional_landing_pages.read',
  CREATE: 'promotional_landing_pages.create',
  UPDATE: 'promotional_landing_pages.update',
  STATUS: 'promotional_landing_pages.status',
  DELETE: 'promotional_landing_pages.delete',
  PREVIEW: 'promotional_landing_pages.preview',
} as const;

export const PROMOTIONAL_PAGE_AUDIT_ENTITY = 'promotional_page';
