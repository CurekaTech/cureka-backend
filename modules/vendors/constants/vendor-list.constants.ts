/** Allowed `sortBy` query values for admin vendor list. */
export const VENDOR_LIST_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'companyName',
  'contactPerson',
  'email',
  'mobileNumber',
  'status',
  'source',
  'gstNumber',
  'panNumber',
  'warehousePincode',
  'refId',
] as const;

export type VendorListSortField = (typeof VENDOR_LIST_SORT_FIELDS)[number];
