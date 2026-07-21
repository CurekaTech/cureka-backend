import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Testimonials was created after ExpandRefIdLength1780910000000 ran in some envs,
 * so its ref_id stayed at varchar(11) while generateUniqueRefId emits 13-char IDs.
 */
export class ExpandTestimonialsRefIdLength1780914000000 implements MigrationInterface {
  name = 'ExpandTestimonialsRefIdLength1780914000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "testimonials"
      ALTER COLUMN "ref_id" TYPE character varying(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "testimonials"
      ALTER COLUMN "ref_id" TYPE character varying(11)
    `);
  }
}
