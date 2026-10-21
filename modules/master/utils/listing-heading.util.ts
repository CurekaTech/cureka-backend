/** Empty rich text clears the heading so the website falls back to the plain name. */
export const normalizeListingHeading = (value?: string | null): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const text = trimmed
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .trim();
  return text ? trimmed : null;
};
