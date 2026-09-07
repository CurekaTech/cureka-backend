/**
 * Frequently Bought Together — category-pair mapping.
 *
 * Each rule says: when a cart contains a product whose category name
 * *contains* any entry in `sourceContains`, recommend products whose
 * category name *contains* any entry in `targetContains`.
 *
 * All comparisons are case-insensitive substring matches against the
 * live category rows in the `categories` table (name ILIKE '%...%').
 *
 * Guidelines:
 *   - Keep source patterns specific enough to avoid false positives.
 *   - Target patterns are resolved to DB category IDs at query time;
 *     missing target names simply return no products.
 *   - Manual overrides configured in the admin panel always take priority
 *     over these automatic rules (reserved for future admin UI feature).
 *
 * Runtime fallbacks (see PublicProductsService.findFrequentlyBoughtTogether):
 *   1. These complementary rules
 *   2. Same deepest-category bestsellers (sub-category when set, not the full root)
 *   3. Global bestsellers (empty cart / no seed variantIds)
 */
export interface FbtCategoryRule {
  /** Source patterns — any of these matching the cart variant's category name triggers the rule. */
  sourceContains: string[];
  /** Target patterns — recommend products from categories whose names contain any of these. */
  targetContains: string[];
}

export const FBT_CATEGORY_RULES: readonly FbtCategoryRule[] = [
  // ── Vitamins & Nutrition ──────────────────────────────────────────────────
  {
    sourceContains: ['protein powder'],
    targetContains: ['creatine', 'multivitamin', 'protein bar'],
  },
  {
    sourceContains: ['protein bar'],
    targetContains: ['protein powder', 'health beverage'],
  },
  {
    sourceContains: ['weight gainer'],
    targetContains: ['protein powder', 'workout', 'pre-workout', 'sports nutrition'],
  },
  {
    sourceContains: ['adult daily nutrition'],
    targetContains: ['multivitamin', 'immunity supplement'],
  },
  {
    sourceContains: ['kids daily nutrition', 'kids nutrition', 'children nutrition'],
    targetContains: ['kids multivitamin', 'kids vitamin', 'immunity supplement'],
  },
  {
    sourceContains: ['health beverage', 'health drink'],
    targetContains: ['healthy snack', 'multivitamin'],
  },
  {
    sourceContains: ['calcium supplement', 'calcium'],
    targetContains: ['vitamin d', 'magnesium'],
  },
  {
    sourceContains: ['iron supplement', 'iron'],
    targetContains: ['vitamin c', 'folic acid', 'vitamin b12'],
  },
  {
    sourceContains: ['immunity supplement', 'immunity booster'],
    targetContains: ['zinc', 'vitamin c', 'probiotic'],
  },
  {
    sourceContains: ['multivitamin'],
    targetContains: ['omega', 'probiotic', 'probiotics'],
  },
  {
    sourceContains: ['fish oil', 'omega-3', 'omega 3'],
    targetContains: ['heart health', 'coq10'],
  },
  {
    sourceContains: ['gut health', 'digestive health', 'gut health supplement'],
    targetContains: ['digestive enzyme', 'fibre', 'fiber supplement'],
  },

  // ── Health Conditions ─────────────────────────────────────────────────────
  {
    sourceContains: ['diabetes', 'diabetic'],
    targetContains: ['diabetic supplement', 'diabetic foot', 'sugar-free', 'sugar free', 'bp monitor', 'blood pressure monitor'],
  },
  {
    sourceContains: ['blood pressure', 'bp monitor', 'hypertension'],
    targetContains: ['heart health', 'omega', 'pill organiser', 'pill organizer'],
  },
  {
    sourceContains: ['arthritis'],
    targetContains: ['joint supplement', 'heating pad', 'knee support'],
  },
  {
    sourceContains: ['osteoporosis'],
    targetContains: ['calcium', 'vitamin d', 'magnesium'],
  },
  {
    sourceContains: ['asthma', 'respiratory'],
    targetContains: ['nebulizer', 'respiratory care'],
  },
  {
    sourceContains: ['hair fall', 'hair loss'],
    targetContains: ['hair supplement', 'shampoo', 'hair serum', 'hair oil'],
  },
  {
    sourceContains: ['acne'],
    targetContains: ['face wash', 'moisturiser', 'moisturizer', 'sunscreen'],
  },
  {
    sourceContains: ['stress relief', 'stress'],
    targetContains: ['sleep supplement', 'magnesium'],
  },
  {
    sourceContains: ['insomnia', 'sleep supplement', 'sleep'],
    targetContains: ['sleep supplement', 'stress relief'],
  },

  // ── Women's Care ──────────────────────────────────────────────────────────
  {
    sourceContains: ['pregnancy care', 'prenatal'],
    targetContains: ['maternity', 'pregnancy skin', 'prenatal'],
  },
  {
    sourceContains: ['postpartum', 'lactation'],
    targetContains: ['lactation supplement', 'nursing', 'postnatal'],
  },
  {
    sourceContains: ['period wellness', 'menstrual', 'period care'],
    targetContains: ['pain relief', 'intimate hygiene'],
  },
  {
    sourceContains: ['menopause'],
    targetContains: ['calcium', 'vitamin d', "women's health", 'women health'],
  },

  // ── Baby Care ─────────────────────────────────────────────────────────────
  {
    sourceContains: ['baby shampoo'],
    targetContains: ['baby wash', 'baby lotion'],
  },
  {
    sourceContains: ['baby wash'],
    targetContains: ['baby shampoo', 'baby lotion'],
  },
  {
    sourceContains: ['baby lotion'],
    targetContains: ['baby wash', 'baby shampoo'],
  },
  {
    sourceContains: ['preterm care'],
    targetContains: ['baby essential', 'baby care'],
  },

  // ── Healthcare Devices ────────────────────────────────────────────────────
  {
    sourceContains: ['glucometer'],
    targetContains: ['diabetic supplement', 'diabetic foot', 'sugar-free', 'sugar free'],
  },
  {
    sourceContains: ['blood pressure monitor', 'bp monitor'],
    targetContains: ['heart health', 'omega'],
  },
  {
    sourceContains: ['nebulizer'],
    targetContains: ['respiratory care', 'respiratory supplement'],
  },
  {
    sourceContains: ['thermometer'],
    targetContains: ['immunity supplement', 'first aid'],
  },
  {
    sourceContains: ['pulse oximeter', 'oximeter'],
    targetContains: ['respiratory care', 'thermometer'],
  },

  // ── Supports, Splints & Braces ────────────────────────────────────────────
  {
    sourceContains: ['knee support'],
    targetContains: ['joint supplement', 'heating pad', 'pain relief gel'],
  },
  {
    sourceContains: ['ankle support'],
    targetContains: ['compression sock', 'pain relief gel'],
  },
  {
    sourceContains: ['shoulder support'],
    targetContains: ['pain relief spray', 'heating pad'],
  },
  {
    sourceContains: ['back support', 'lumbar support'],
    targetContains: ['lumbar cushion', 'heating pad'],
  },
  {
    sourceContains: ['neck support', 'cervical collar'],
    targetContains: ['cervical pillow', 'heating pad'],
  },
  {
    sourceContains: ['wrist support'],
    targetContains: ['pain relief gel', 'ergonomic'],
  },

  // ── Personal Care ─────────────────────────────────────────────────────────
  {
    sourceContains: ['face wash'],
    targetContains: ['sunscreen', 'moisturiser', 'moisturizer', 'face serum'],
  },
  {
    sourceContains: ['moisturiser', 'moisturizer'],
    targetContains: ['face wash', 'sunscreen'],
  },
  {
    sourceContains: ['sunscreen'],
    targetContains: ['face wash', 'moisturiser', 'moisturizer', 'lip balm'],
  },
  {
    sourceContains: ['shampoo'],
    targetContains: ['conditioner', 'hair serum', 'hair supplement'],
  },
  {
    sourceContains: ['hair oil'],
    targetContains: ['shampoo', 'hair mask', 'hair supplement'],
  },
  {
    sourceContains: ['hair serum'],
    targetContains: ['shampoo', 'conditioner'],
  },
  {
    sourceContains: ['oral care', 'toothpaste', 'toothbrush', 'mouthwash'],
    targetContains: ['mouthwash', 'toothbrush'],
  },

  // ── Herbal & Ayurveda ─────────────────────────────────────────────────────
  {
    sourceContains: ['herbal supplement', 'ayurvedic supplement'],
    targetContains: ['herbal wellness', 'ayurvedic', 'herbal supplement'],
  },
  {
    sourceContains: ['herbal hair', 'ayurvedic hair'],
    targetContains: ['herbal hair oil', 'herbal shampoo'],
  },
  {
    sourceContains: ['herbal skin', 'ayurvedic skin'],
    targetContains: ['herbal face wash', 'herbal moisturiser'],
  },

  // ── Sexual Wellness ───────────────────────────────────────────────────────
  {
    sourceContains: ['condom'],
    targetContains: ['lubricant'],
  },
  {
    sourceContains: ['intimate hygiene', 'feminine hygiene'],
    targetContains: ["women's health supplement", 'women health supplement'],
  },
  {
    sourceContains: ['lubricant'],
    targetContains: ['condom'],
  },
  {
    sourceContains: ['sexual health', 'sexual wellness'],
    targetContains: ["men's health", 'men health', "women's health", 'women health'],
  },
];
