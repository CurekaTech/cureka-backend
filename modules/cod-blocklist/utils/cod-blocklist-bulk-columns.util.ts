export const COD_BLOCKLIST_BULK_HEADERS = [
  'Pincode',
  'Mobile Number',
  'Is Active',
  'Reason',
] as const;

export const normalizeCodBulkHeader = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, ' ');

export const resolveCodBulkColumnKey = (header: string): string | null => {
  const key = normalizeCodBulkHeader(header);
  if (key === 'pincode' || key === 'pin code' || key === 'pin') return 'pincode';
  if (
    key === 'mobile number' ||
    key === 'mobile' ||
    key === 'phone' ||
    key === 'phone number'
  ) {
    return 'mobileNumber';
  }
  if (key === 'is active' || key === 'active' || key === 'enabled' || key === 'status') {
    return 'isActive';
  }
  if (key === 'reason' || key === 'remarks' || key === 'note') return 'reason';
  return null;
};

export const parseIsActiveCell = (raw: string): boolean | null => {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (['yes', 'true', '1', 'active', 'enabled', 'y'].includes(v)) return true;
  if (['no', 'false', '0', 'inactive', 'disabled', 'n'].includes(v)) return false;
  return null;
};
