import { MigrationInterface, QueryRunner } from 'typeorm';

const LABEL_SORT_ORDERS: Array<{ names: string[]; sortOrder: number }> = [
  { names: ['Product Highlights', 'Highlights'], sortOrder: 1 },
  { names: ['Expert Advice'], sortOrder: 2 },
  { names: ['Description'], sortOrder: 3 },
  { names: ['Key Benefits'], sortOrder: 4 },
  { names: ['Key Ingredients'], sortOrder: 5 },
  { names: ['Other Ingredients'], sortOrder: 6 },
  { names: ['Preventive Note', 'Preventive Notes'], sortOrder: 7 },
  { names: ['Accessories', 'Accessories Specifications'], sortOrder: 8 },
  { names: ['Direction of Use', 'Directions of Use'], sortOrder: 9 },
  { names: ['Feeding Table'], sortOrder: 10 },
  { names: ['Safety Information'], sortOrder: 11 },
];

export class SetProductInformationLabelSortOrder1780832000000 implements MigrationInterface {
  name = 'SetProductInformationLabelSortOrder1780832000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { names, sortOrder } of LABEL_SORT_ORDERS) {
      await queryRunner.query(
        `
          UPDATE "product_information_labels"
          SET "sort_order" = $1
          WHERE "deleted_at" IS NULL
            AND trim("name") = ANY($2::text[])
        `,
        [sortOrder, names],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const names = LABEL_SORT_ORDERS.flatMap((entry) => entry.names);

    await queryRunner.query(
      `
        UPDATE "product_information_labels"
        SET "sort_order" = 0
        WHERE "deleted_at" IS NULL
          AND trim("name") = ANY($1::text[])
      `,
      [names],
    );
  }
}
