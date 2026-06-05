import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefIdUpdatedByColumns1780309081337 implements MigrationInterface {
    name = 'AddRefIdUpdatedByColumns1780309081337'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── users ─────────────────────────────────────────────────────────────
        // Step 1: Add nullable — safe even when rows exist
        await queryRunner.query(`ALTER TABLE "users" ADD "ref_id" character varying(11)`);

        // Step 2: Back-fill existing rows with deterministic unique ref IDs.
        //   Format: [first-3-alpha-chars-of-full_name][year][4-digit-row-number]
        //   ROW_NUMBER guarantees uniqueness; RPAD('X') handles names shorter than 3 chars.
        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    id,
                    UPPER(RPAD(LEFT(REGEXP_REPLACE(full_name, '[^a-zA-Z]', '', 'g'), 3), 3, 'X'))
                    || TO_CHAR(NOW(), 'YYYY')
                    || LPAD(((ROW_NUMBER() OVER (ORDER BY created_at) - 1) % 10000)::text, 4, '0')
                    AS ref_id_value
                FROM "users"
            )
            UPDATE "users"
            SET "ref_id" = ranked.ref_id_value
            FROM ranked
            WHERE "users".id = ranked.id
        `);

        // Step 3: Enforce NOT NULL now that every row has a value
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "ref_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_a28b52ea8291c2c68f472d57e9f" UNIQUE ("ref_id")`);

        // updated_by is nullable — safe to add directly
        await queryRunner.query(`ALTER TABLE "users" ADD "updated_by" character varying(255)`);

        // ── admin_users ───────────────────────────────────────────────────────
        await queryRunner.query(`ALTER TABLE "admin_users" ADD "ref_id" character varying(11)`);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    id,
                    UPPER(RPAD(LEFT(REGEXP_REPLACE(full_name, '[^a-zA-Z]', '', 'g'), 3), 3, 'X'))
                    || TO_CHAR(NOW(), 'YYYY')
                    || LPAD(((ROW_NUMBER() OVER (ORDER BY created_at) - 1) % 10000)::text, 4, '0')
                    AS ref_id_value
                FROM "admin_users"
            )
            UPDATE "admin_users"
            SET "ref_id" = ranked.ref_id_value
            FROM ranked
            WHERE "admin_users".id = ranked.id
        `);

        await queryRunner.query(`ALTER TABLE "admin_users" ALTER COLUMN "ref_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "admin_users" ADD CONSTRAINT "UQ_26aeea1597941a4487894a2e5be" UNIQUE ("ref_id")`);
        await queryRunner.query(`ALTER TABLE "admin_users" ADD "updated_by" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admin_users" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "admin_users" DROP CONSTRAINT IF EXISTS "UQ_26aeea1597941a4487894a2e5be"`);
        await queryRunner.query(`ALTER TABLE "admin_users" DROP COLUMN "ref_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_a28b52ea8291c2c68f472d57e9f"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "ref_id"`);
    }
}
