import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames legacy `faqs` table to `product_faqs` for environments that ran
 * CreateProductModuleTables1780508000000 before the table was renamed in-place.
 */
export class RenameFaqsToProductFaqs1780509000000 implements MigrationInterface {
  name = 'RenameFaqsToProductFaqs1780509000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasLegacyTable = await queryRunner.hasTable('faqs');
    if (!hasLegacyTable) return;

    await queryRunner.query(`ALTER TABLE "faqs" RENAME TO "product_faqs"`);
    await queryRunner.query(
      `ALTER TYPE "public"."faqs_status_enum" RENAME TO "product_faqs_status_enum"`,
    );
    await queryRunner.query(`ALTER INDEX "IDX_faqs_status" RENAME TO "IDX_product_faqs_status"`);
    await queryRunner.query(
      `ALTER TABLE "product_faqs" RENAME CONSTRAINT "PK_faqs" TO "PK_product_faqs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_faqs" RENAME CONSTRAINT "UQ_faqs_ref_id" TO "UQ_product_faqs_ref_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "product_faq_mappings" RENAME COLUMN "faq_id" TO "product_faq_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_faq_mappings" DROP CONSTRAINT "FK_product_faq_mappings_faq"`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_faq_mappings"
      ADD CONSTRAINT "FK_product_faq_mappings_product_faq"
      FOREIGN KEY ("product_faq_id") REFERENCES "product_faqs"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasProductFaqsTable = await queryRunner.hasTable('product_faqs');
    const hasLegacyTable = await queryRunner.hasTable('faqs');
    if (!hasProductFaqsTable || hasLegacyTable) return;

    await queryRunner.query(
      `ALTER TABLE "product_faq_mappings" DROP CONSTRAINT "FK_product_faq_mappings_product_faq"`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_faq_mappings"
      ADD CONSTRAINT "FK_product_faq_mappings_faq"
      FOREIGN KEY ("product_faq_id") REFERENCES "product_faqs"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(
      `ALTER TABLE "product_faq_mappings" RENAME COLUMN "product_faq_id" TO "faq_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "product_faqs" RENAME CONSTRAINT "UQ_product_faqs_ref_id" TO "UQ_faqs_ref_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_faqs" RENAME CONSTRAINT "PK_product_faqs" TO "PK_faqs"`,
    );
    await queryRunner.query(`ALTER INDEX "IDX_product_faqs_status" RENAME TO "IDX_faqs_status"`);
    await queryRunner.query(
      `ALTER TYPE "public"."product_faqs_status_enum" RENAME TO "faqs_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "product_faqs" RENAME TO "faqs"`);
  }
}
