import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoriesTable1780311000000 implements MigrationInterface {
  name = 'CreateCategoriesTable1780311000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------------------------------------------------------------------------
    // 1. Enum type for hierarchy level (stored as numeric strings: '0'..'3')
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "public"."category_hierarchy_level_enum"
      AS ENUM ('0', '1', '2', '3')
    `);

    // -------------------------------------------------------------------------
    // 2. Categories table
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id"                 uuid                                          NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"             character varying(11)                         NOT NULL,
        "name"               character varying(255)                        NOT NULL,
        "hierarchy_id"       integer                                       NOT NULL,
        "parent_category_id" uuid,
        "position"           integer                                       NOT NULL DEFAULT 0,
        "hierarchy_level"    "public"."category_hierarchy_level_enum"      NOT NULL DEFAULT '0',
        "image"              character varying(500),
        "banner"             character varying(500),
        "slug"               character varying(300)                        NOT NULL,
        "meta_title"         character varying(255),
        "meta_description"   text,
        "meta_keywords"      text[],
        "updated_by"         character varying(255),
        "created_at"         TIMESTAMPTZ                                   NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMPTZ                                   NOT NULL DEFAULT now(),
        "deleted_at"         TIMESTAMPTZ,
        CONSTRAINT "PK_categories"                PRIMARY KEY ("id"),
        CONSTRAINT "UQ_categories_ref_id"         UNIQUE ("ref_id"),
        CONSTRAINT "UQ_categories_hierarchy_id"   UNIQUE ("hierarchy_id"),
        CONSTRAINT "UQ_categories_slug"           UNIQUE ("slug")
      )
    `);

    // -------------------------------------------------------------------------
    // 3. Indexes on categories
    // -------------------------------------------------------------------------
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_hierarchy_id" ON "categories" ("hierarchy_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_parent_category_id" ON "categories" ("parent_category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_hierarchy_level" ON "categories" ("hierarchy_level")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_slug" ON "categories" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_position" ON "categories" ("position")`,
    );

    // -------------------------------------------------------------------------
    // 4. Self-referencing foreign key
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD CONSTRAINT "FK_categories_parent"
      FOREIGN KEY ("parent_category_id")
      REFERENCES "categories" ("id")
      ON DELETE SET NULL
    `);

    // -------------------------------------------------------------------------
    // 5. Junction table: category_attributes
    // -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "category_attributes" (
        "category_id"  uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        CONSTRAINT "PK_category_attributes" PRIMARY KEY ("category_id", "attribute_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_category_attributes_category_id"  ON "category_attributes" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_category_attributes_attribute_id" ON "category_attributes" ("attribute_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "category_attributes"
      ADD CONSTRAINT "FK_category_attributes_category"
      FOREIGN KEY ("category_id")
      REFERENCES "categories" ("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "category_attributes"
      ADD CONSTRAINT "FK_category_attributes_attribute"
      FOREIGN KEY ("attribute_id")
      REFERENCES "attributes" ("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove junction table
    await queryRunner.query(
      `ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_category_attributes_attribute"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_category_attributes_category"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_category_attributes_attribute_id"`);
    await queryRunner.query(`DROP INDEX "IDX_category_attributes_category_id"`);
    await queryRunner.query(`DROP TABLE "category_attributes"`);

    // Remove categories table
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_parent"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_categories_position"`);
    await queryRunner.query(`DROP INDEX "IDX_categories_slug"`);
    await queryRunner.query(`DROP INDEX "IDX_categories_hierarchy_level"`);
    await queryRunner.query(`DROP INDEX "IDX_categories_parent_category_id"`);
    await queryRunner.query(`DROP INDEX "IDX_categories_hierarchy_id"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TYPE "public"."category_hierarchy_level_enum"`);
  }
}
