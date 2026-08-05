/** DLT allows max 40 characters per variable slot. */
export const DLT_VARIABLE_MAX_LENGTH = 40;

/**
 * Exact MSG91 Flow / DLT-approved order thank-you template (##var## placeholders).
 * Override via MSG91_ORDER_THANKYOU_TEMPLATE_TEXT when portal text changes.
 */
export const DEFAULT_ORDER_THANKYOU_TEMPLATE_TEXT =
  'Thank you for ordering on Cureka.com. Your Order ##var1## is under ##var2## and the shipment tracking id will be shared soon. Contact 9655928004 for any queries.';

export type DltVariableCheck = {
  key: string;
  value: string;
  length: number;
  withinLimit: boolean;
};

/**
 * Renders the final SMS body MSG91/DLT will scrub (for log comparison with DLT portal).
 */
export function renderMsg91TemplatePreview(
  templateText: string,
  variables: Record<string, string>,
): string {
  let rendered = templateText;
  for (const [key, value] of Object.entries(variables)) {
    const replacement = value ?? '';
    rendered = rendered.split(`##${key}##`).join(replacement);
    rendered = rendered.split(`{#${key}#}`).join(replacement);
  }
  return rendered;
}

export function checkDltVariableLengths(
  variables: Record<string, string>,
): DltVariableCheck[] {
  return Object.entries(variables).map(([key, value]) => ({
    key,
    value,
    length: value.length,
    withinLimit: value.length <= DLT_VARIABLE_MAX_LENGTH,
  }));
}
