import { repairText } from '@database/scripts/text-corruption-repair';

/**
 * UTF-8 bytes that were decoded as Windows-1252 (â€“, Womenâ€™s, Ã©, Â).
 * Uses the shared mixed-safe repair engine so catalog import and cleanup
 * apply the same restorations. Ambiguous leftovers are left unchanged.
 */
export const repairUtf8Mojibake = (value: string): string => repairText(value).value;
