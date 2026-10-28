import { auditCsvText, classifyCell, parseCsvRecords } from './text-corruption-csv-audit';

describe('text corruption CSV audit', () => {
  it('parses quoted commas and multiline fields', () => {
    const csv = 'A,B\n"x,y","line1\nline2"\n';
    expect(parseCsvRecords(csv)).toEqual([
      ['A', 'B'],
      ['x,y', 'line1\nline2'],
    ]);
  });

  it('classifies stray Â as auto-repair and � as source-required', () => {
    const auto = classifyCell({
      csvRow: 2,
      sku: 'SKU-1',
      productId: 'id-1',
      productName: 'Nestle',
      column: 'Meta Title',
      original: 'NestleÂ Baby Cereal',
    });
    expect(auto.some((item) => item.status === 'SAFE_AUTO_REPAIR')).toBe(true);
    expect(auto[0].suggested).toBe('Nestle Baby Cereal');

    const lost = classifyCell({
      csvRow: 3,
      sku: 'SKU-2',
      productId: 'id-2',
      productName: 'Hair',
      column: 'Search Tags',
      original: 'men\uFFFD\uFFFD\uFFFDs',
    });
    expect(lost.some((item) => item.status === 'SOURCE_REQUIRED')).toBe(true);
    expect(lost.every((item) => item.suggested !== "men's")).toBe(true);
  });

  it('does not guess missing temperature operators', () => {
    const findings = classifyCell({
      csvRow: 4,
      sku: 'SKU-3',
      productId: 'id-3',
      productName: 'Thermometer',
      column: 'FAQ 3 Question',
      original: '36.80.5 °C',
    });
    expect(findings.some((item) => item.category === 'malformed_numeric_expression')).toBe(true);
    expect(findings.every((item) => item.status !== 'SAFE_AUTO_REPAIR')).toBe(true);
  });

  it('summarizes a tiny catalog CSV without inventing rows', () => {
    const csv = [
      'Product Name*,Product SKU Code*,Product Id,Meta Title,FAQ 1 Question',
      'Alpha,SKU-A,pid-a,NestleÂ Baby,What is 36.80.5 °C?',
      'Beta,SKU-B,pid-b,Clean title,Ordinary question',
    ].join('\n');
    const result = auditCsvText(csv, 'memory.csv');
    expect(result.summary.productRecords).toBe(2);
    expect(result.summary.columns).toBe(5);
    expect(result.summary.cellsInspected).toBe(10);
    expect(result.summary.autoRepairableCells).toBe(1);
    expect(result.findings.some((item) => item.sku === 'SKU-A')).toBe(true);
    expect(result.findings.every((item) => item.sku !== 'SKU-B' || item.status !== 'SAFE_AUTO_REPAIR')).toBe(
      true,
    );
  });
});
