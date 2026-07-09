import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReasonFieldsToSupportTickets1780904200000 implements MigrationInterface {
  name = 'AddReasonFieldsToSupportTickets1780904200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        ADD COLUMN IF NOT EXISTS "reason_ref_id" character varying(11),
        ADD COLUMN IF NOT EXISTS "reason_title" character varying(255),
        ADD COLUMN IF NOT EXISTS "workflow" character varying(20),
        ADD COLUMN IF NOT EXISTS "pickup_mode" character varying(30)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_tickets_reason_ref_id"
      ON "support_tickets" ("reason_ref_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_tickets_workflow"
      ON "support_tickets" ("workflow")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_tickets_workflow"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_tickets_reason_ref_id"`);
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        DROP COLUMN IF EXISTS "pickup_mode",
        DROP COLUMN IF EXISTS "workflow",
        DROP COLUMN IF EXISTS "reason_title",
        DROP COLUMN IF EXISTS "reason_ref_id"
    `);
  }
}
