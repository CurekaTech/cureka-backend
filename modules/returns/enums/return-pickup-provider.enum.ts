/**
 * Reverse-pickup providers. Approval notifies Unicommerce and Shipway when those
 * integrations are configured. MANUAL is the ops fallback for an AWB booked outside Cureka.
 */
export enum ReturnPickupProvider {
  MANUAL = 'MANUAL',
  SHIPWAY = 'SHIPWAY',
  UNICOMMERCE = 'UNICOMMERCE',
}
