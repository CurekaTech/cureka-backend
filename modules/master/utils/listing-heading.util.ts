/** Empty rich text clears the heading so the website falls back to the plain name. */
export const normalizeListingHeading = (value?: string | null): string | null => {
  if (value == null) return null;
  return value.trim() ? value : null;
};
