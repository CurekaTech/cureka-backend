import { ValidationError } from 'class-validator';

export interface ValidationErrorDetail {
  property: string;
  constraints: string[];
  children?: ValidationErrorDetail[];
}

/** Flatten class-validator errors into a structured list for logs and API messages. */
export const flattenValidationErrors = (
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] =>
  errors.flatMap((error) => {
    const property = parentPath ? `${parentPath}.${error.property}` : error.property;
    const constraints = Object.values(error.constraints ?? {});
    const children = error.children?.length
      ? flattenValidationErrors(error.children, property)
      : undefined;

    const entry: ValidationErrorDetail = {
      property,
      constraints,
      ...(children?.length ? { children } : {}),
    };

    if (constraints.length) {
      return [entry, ...(children ?? [])];
    }

    return children ?? [entry];
  });

export const formatValidationErrorMessage = (errors: ValidationError[]): string => {
  const details = flattenValidationErrors(errors);
  const messages = details.flatMap((detail) =>
    detail.constraints.map((message) =>
      detail.property ? `${detail.property}: ${message}` : message,
    ),
  );

  return messages.join('; ') || 'Validation failed';
};

export const formatValidationErrorsForLog = (errors: ValidationError[]): string =>
  JSON.stringify(flattenValidationErrors(errors));
