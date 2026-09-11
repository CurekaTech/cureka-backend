import { ValidationError } from 'class-validator';

export interface ValidationErrorDetail {
  property: string;
  constraints: string[];
  children?: ValidationErrorDetail[];
}

/** Nested FAQ paths such as faqs.0.question or details.customFaqs.1.answer */
const FAQ_NESTED_PROPERTY_PATH =
  /(?:^|\.)(?:faqs|customFaqs)\.(?<index>\d+)\.(?<field>question|answer)$/i;

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

/**
 * Prefer user-facing FAQ messages (no technical property paths like faqs.0.question).
 * Custom FAQ constraint messages are expected to start with "FAQ".
 */
export const formatPropertyConstraintMessage = (property: string, message: string): string => {
  if (/^faq\b/i.test(message)) {
    const match = FAQ_NESTED_PROPERTY_PATH.exec(property);
    if (match?.groups?.index !== undefined) {
      const faqNumber = Number(match.groups.index) + 1;
      return message.replace(/^FAQ\b/i, `FAQ #${faqNumber}`);
    }
    return message;
  }

  return property ? `${property}: ${message}` : message;
};

export const formatValidationErrorMessage = (errors: ValidationError[]): string => {
  const details = flattenValidationErrors(errors);
  const messages = details.flatMap((detail) =>
    detail.constraints.map((message) => formatPropertyConstraintMessage(detail.property, message)),
  );

  return messages.join('; ') || 'Validation failed';
};

export const formatValidationErrorsForLog = (errors: ValidationError[]): string =>
  JSON.stringify(flattenValidationErrors(errors));
