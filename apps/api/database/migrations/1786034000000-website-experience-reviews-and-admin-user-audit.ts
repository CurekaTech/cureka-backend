import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Storefront website-experience reviews (one per order) plus:
 * - admin permission/menu for listing them
 * - capture `deleted_at` in field-level audit history so soft-deletes (admin users)
 *   still have before/after details
 */
export class WebsiteExperienceReviewsAndAdminUserAudit1786034000000
  implements MigrationInterface
{
  name = 'WebsiteExperienceReviewsAndAdminUserAudit1786034000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "website_experience_reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "order_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "order_number" character varying(30) NOT NULL,
        "customer_name" character varying(200) NOT NULL,
        "customer_email" character varying(255),
        "rating" smallint NOT NULL,
        "feedback" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_website_experience_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_website_experience_reviews_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_website_experience_reviews_order_id" UNIQUE ("order_id"),
        CONSTRAINT "CHK_website_experience_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_website_experience_reviews_user_id" ON "website_experience_reviews" ("user_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "website_experience_reviews"
      ADD CONSTRAINT "FK_website_experience_reviews_order_id"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "website_experience_reviews"
      ADD CONSTRAINT "FK_website_experience_reviews_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_cureka_audit_capture
      AFTER INSERT OR UPDATE OR DELETE ON website_experience_reviews
      FOR EACH ROW EXECUTE PROCEDURE cureka_audit_capture_row()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cureka_audit_capture_row() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        capture_id text;
        previous jsonb;
        nxt jsonb;
        rec_id uuid;
        rec_key jsonb;
        col text;
        skip_cols text[] := ARRAY[
          'created_at','updated_at','created_by','updated_by',
          'password','password_hash','hashed_password','passwd',
          'otp','pin','secret','token','access_token','refresh_token',
          'session_token','remember_token','authorization','api_key','apikey'
        ];
      BEGIN
        capture_id := nullif(current_setting('app.audit_request_id', true), '');
        IF capture_id IS NULL THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        IF TG_OP = 'DELETE' THEN
          previous := to_jsonb(OLD);
          nxt := '{}'::jsonb;
        ELSIF TG_OP = 'INSERT' THEN
          previous := '{}'::jsonb;
          nxt := to_jsonb(NEW);
        ELSE
          previous := to_jsonb(OLD);
          nxt := to_jsonb(NEW);
        END IF;

        rec_key := COALESCE(nxt, previous);
        BEGIN
          IF rec_key ? 'id' AND (rec_key->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            rec_id := (rec_key->>'id')::uuid;
          END IF;
        EXCEPTION WHEN others THEN
          rec_id := NULL;
        END;

        FOR col IN SELECT jsonb_object_keys(previous || nxt)
        LOOP
          IF col = ANY(skip_cols) THEN
            CONTINUE;
          END IF;
          IF lower(col) LIKE '%password%' OR lower(col) LIKE '%token%' OR lower(col) LIKE '%secret%' THEN
            CONTINUE;
          END IF;
          IF (previous -> col) IS NOT DISTINCT FROM (nxt -> col) THEN
            CONTINUE;
          END IF;
          INSERT INTO audit_log_changes (
            audit_log_id, request_id, table_name, record_id, record_key, column_name, field,
            change_type, operation, old_value, new_value
          ) VALUES (
            NULL,
            left(capture_id, 64),
            TG_TABLE_NAME,
            rec_id,
            jsonb_build_object('id', rec_key->'id'),
            left(col, 64),
            left(col, 64),
            CASE TG_OP
              WHEN 'INSERT' THEN 'created'
              WHEN 'DELETE' THEN 'deleted'
              ELSE 'updated'
            END,
            TG_OP,
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE previous -> col END,
            CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE nxt -> col END
          );
        END LOOP;

        RETURN COALESCE(NEW, OLD);
      END;
      $$
    `);

    const [{ max_ref }] = (await queryRunner.query(`
      SELECT COALESCE(MAX(SUBSTRING("ref_id" FROM 4)::bigint), 0) AS max_ref
      FROM "permissions"
      WHERE "ref_id" ~ '^PER[0-9]{8}$'
    `)) as Array<{ max_ref: string }>;
    const nextRef = Number(max_ref) + 1;
    const refId = `PER${String(nextRef).padStart(8, '0')}`;

    await queryRunner.query(
      `
      INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
      SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
      WHERE NOT EXISTS (
        SELECT 1 FROM "permissions"
        WHERE LOWER("code") = LOWER($2::varchar) AND "deleted_at" IS NULL
      )
    `,
      [
        refId,
        'website_experience_reviews.read',
        'View Website Experience Reviews',
        'website_experience_reviews',
        'read',
      ],
    );

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" = 'website_experience_reviews.read'
       AND p."deleted_at" IS NULL
      WHERE r."deleted_at" IS NULL
        AND r."slug" IN ('super_admin', 'admin')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT rp."role_id", scoped."id"
      FROM "role_permissions" rp
      JOIN "permissions" product_reviews
        ON product_reviews."id" = rp."permission_id"
       AND product_reviews."code" = 'product_reviews.read'
       AND product_reviews."deleted_at" IS NULL
      JOIN "permissions" scoped
        ON scoped."code" = 'website_experience_reviews.read'
       AND scoped."deleted_at" IS NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "code" = 'website_experience_reviews.read'
      )
    `);
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" = 'website_experience_reviews.read'`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_cureka_audit_capture ON website_experience_reviews`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "website_experience_reviews"`);
  }
}
