export const formatDateToISO = (date: Date): string => date.toISOString();

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const stripSensitiveFields = <T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): Omit<T, (typeof fields)[number]> => {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result as Omit<T, (typeof fields)[number]>;
};
