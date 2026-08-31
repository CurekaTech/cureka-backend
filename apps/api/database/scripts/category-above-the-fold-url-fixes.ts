/**
 * Old → corrected /product-category/ path suffixes for the above-the-fold workbook.
 * Paths are compared case-insensitively after `/product-category/`.
 */
export const CATEGORY_ABOVE_THE_FOLD_URL_PATH_FIXES: ReadonlyArray<{
  from: string;
  to: string;
}> = [
  {
    from: 'healthcare-devices/daily-living-aids/smart-wearables',
    to: 'healthcare-devices/daily-living-aids/smart-bands',
  },
  {
    from: 'healthcare-devices/medical-equipments/nebulizers-vaporizers',
    to: 'healthcare-devices/medical-equipments/nebulizer',
  },
  {
    from: 'healthcare-devices/mobility-aids/cerebral-palsy',
    to: 'healthcare-devices/mobility-aids/cerebral-palsy-special-aids',
  },
  { from: 'healthcare-devices/pain-management', to: 'healthcare-devices/pain-relief' },
  {
    from: 'healthcare-devices/pain-management/heating-pads-massager',
    to: 'healthcare-devices/pain-relief/heating-pads-massager',
  },
  {
    from: 'healthcare-devices/pain-management/hot-cold-pack',
    to: 'healthcare-devices/pain-relief/hot-cold-pack',
  },
  {
    from: 'healthcare-devices/pain-management/topical-pain-relief',
    to: 'healthcare-devices/pain-relief/topical-pain-relief',
  },
  {
    from: 'healthcare-devices/pain-management/weight-cuff',
    to: 'healthcare-devices/pain-relief/weight-cuff',
  },
  {
    from: 'healthcare-devices/pain-management/wound-care-dressings',
    to: 'healthcare-devices/pain-relief/wound-care-dressings',
  },
  {
    from: 'herbal-ayurveda/herbal-care/herbal-joint-care-2',
    to: 'herbal-ayurveda/herbal-care/herbal-joint-care',
  },
  {
    from: 'herbal-ayurveda/herbal-supplements/prostate-2',
    to: 'herbal-ayurveda/herbal-supplements/prostate',
  },
  { from: 'nutrition/vitamins-supplements', to: 'nutrition/supplements' },
  {
    from: 'nutrition/vitamins-supplements/amino-acids',
    to: 'nutrition/supplements/amino-acids',
  },
  {
    from: 'nutrition/vitamins-supplements/antioxidants',
    to: 'nutrition/supplements/antioxidants',
  },
  { from: 'nutrition/vitamins-supplements/biotin', to: 'nutrition/supplements/biotin' },
  { from: 'nutrition/vitamins-supplements/calcium', to: 'nutrition/supplements/calcium' },
  { from: 'nutrition/vitamins-supplements/immunity', to: 'nutrition/supplements/immunity' },
  { from: 'nutrition/vitamins-supplements/iron', to: 'nutrition/supplements/iron' },
  {
    from: 'nutrition/vitamins-supplements/kids-syrup-drops',
    to: 'nutrition/supplements/kids-syrup-drops',
  },
  { from: 'nutrition/vitamins-supplements/minerals', to: 'nutrition/supplements/minerals' },
  {
    from: 'nutrition/vitamins-supplements/multivitamins',
    to: 'nutrition/supplements/multivitamins',
  },
  {
    from: 'nutrition/vitamins-supplements/other-vitamins',
    to: 'nutrition/supplements/other-vitamins',
  },
  {
    from: 'nutrition/vitamins-supplements/speciality-supplements',
    to: 'nutrition/supplements/speciality-supplements',
  },
  {
    from: 'personal-care/hair-care/hair-care-supplements-2',
    to: 'personal-care/hair-care/hair-care-supplements',
  },
  {
    from: 'sexual-wellness/massage-oil',
    to: 'sexual-wellness/massage-oil-sexual-wellness',
  },
  {
    from: 'women-care/postpartum-care/breast-pump-2',
    to: 'women-care/postpartum-care/breast-pump',
  },
];
