export interface IBundleOosVariant {
  sku: string;
  name: string;
}

/** Persisted on `products.bundle_oos_components` and returned as admin `oosComponents`. */
export interface IBundleOosComponent {
  refId: string;
  name: string;
  variants: IBundleOosVariant[];
}

export interface IBundleAvailabilityVariant {
  sku: string;
  name: string | null;
  status: 'INS' | 'OOS';
  inCurekaInventory: boolean;
}

export interface IBundleAvailabilityComponent {
  refId: string;
  name: string;
  quantity: number;
  status: 'INS' | 'OOS';
  inCurekaInventory: boolean;
  variants: IBundleAvailabilityVariant[];
}

export interface IBundleAvailability {
  status: 'INS' | 'OOS';
  sku: string | null;
  inCurekaInventory: boolean;
  reason: string | null;
  oosComponents: IBundleOosComponent[];
  components: IBundleAvailabilityComponent[];
}
