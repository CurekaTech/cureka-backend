import { buildUnifiedBulkUploadHeaders } from './bulk-upload-columns.util';
import {
  buildVariableTemplateExtraHeaders,
  getMaxAttributeDetailsColumnIndex,
  resolveBulkUploadAttributeSlotCount,
  VARIABLE_TEMPLATE_ATTRIBUTE_COUNT,
} from './bulk-upload-variable.util';
import { countProductExportAttributes, mapProductsToBulkExportRows } from './bulk-upload-export.mapper';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductType } from '../enums/product-type.enum';

describe('bulk upload attribute slots', () => {
  it('keeps sample default at 5 slots', () => {
    const headers = buildVariableTemplateExtraHeaders();
    expect(headers.filter((h) => /^Attribute Details \d+$/.test(h))).toHaveLength(
      VARIABLE_TEMPLATE_ATTRIBUTE_COUNT,
    );
    expect(headers.filter((h) => /^att_attribute_\d+_value_1$/.test(h))).toHaveLength(
      VARIABLE_TEMPLATE_ATTRIBUTE_COUNT,
    );
  });

  it('expands shared headers for 7 and 10+ attributes', () => {
    for (const count of [1, 5, 7, 12]) {
      const slotCount = resolveBulkUploadAttributeSlotCount(count);
      const expected = Math.max(VARIABLE_TEMPLATE_ATTRIBUTE_COUNT, count);
      expect(slotCount).toBe(expected);

      const headers = buildUnifiedBulkUploadHeaders([], [], slotCount);
      expect(headers.filter((h) => /^Attribute Details \d+$/.test(h))).toHaveLength(expected);
      expect(headers.filter((h) => /^att_attribute_\d+_value_1$/.test(h))).toHaveLength(expected);
    }
  });

  it('parser max index reads Attribute Details beyond 5', () => {
    const headerMap = new Map<string, number>([
      ['attribute details 1', 0],
      ['attribute details 7', 1],
      ['attribute details 10', 2],
    ]);
    expect(getMaxAttributeDetailsColumnIndex(headerMap)).toBe(10);
  });

  it('exports all attribute names/values when headers include enough slots', () => {
    const attributeNames = Array.from({ length: 7 }, (_, i) => `Attr${i + 1}`);
    const headers = buildUnifiedBulkUploadHeaders(
      [],
      [],
      resolveBulkUploadAttributeSlotCount(7),
    );
    const product = {
      refId: 'var-1',
      name: 'Multi Attr',
      productType: ProductType.VARIABLE,
      status: ProductStatus.PUBLISHED,
      createdAt: new Date('2024-01-01'),
      attributeMappings: attributeNames.map((name, index) => ({
        attribute: { name, refId: `a${index}` },
      })),
      variants: [
        {
          sku: 'VAR-SKU',
          createdAt: new Date('2024-01-01'),
          mrp: '10',
          sellingPrice: '9',
          attributeValues: attributeNames.map((name, index) => ({
            value: `V${index + 1}`,
            attribute: { name, refId: `a${index}` },
          })),
        },
      ],
    } as any;

    expect(countProductExportAttributes(product)).toBe(7);
    const rows = mapProductsToBulkExportRows([product], headers);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    for (let i = 0; i < 7; i++) {
      const nameIdx = headers.indexOf(`Attribute Details ${i + 1}`);
      const valueIdx = headers.indexOf(`att_attribute_${i + 1}_value_1`);
      expect(row[nameIdx]).toBe(`Attr${i + 1}`);
      expect(row[valueIdx]).toBe(`V${i + 1}`);
    }
  });
});
