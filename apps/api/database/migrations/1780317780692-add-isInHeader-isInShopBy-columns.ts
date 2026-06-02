import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsInHeaderIsInShopByColumns1780317780692 implements MigrationInterface {
    name = 'AddIsInHeaderIsInShopByColumns1780317780692'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_parent"`);
        await queryRunner.query(`ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_category_attributes_category"`);
        await queryRunner.query(`ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_category_attributes_attribute"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_hierarchy_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_parent_category_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_hierarchy_level"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_slug"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_position"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_category_attributes_category_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_category_attributes_attribute_id"`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "is_in_header" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "is_in_shop_by" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "attributes" DROP CONSTRAINT "UQ_attributes_name"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "UQ_categories_hierarchy_id"`);
        await queryRunner.query(`ALTER TYPE "public"."category_hierarchy_level_enum" RENAME TO "category_hierarchy_level_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."categories_hierarchy_level_enum" AS ENUM('0', '1', '2', '3')`);
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "hierarchy_level" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "hierarchy_level" TYPE "public"."categories_hierarchy_level_enum" USING "hierarchy_level"::"text"::"public"."categories_hierarchy_level_enum"`);
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "hierarchy_level" SET DEFAULT '0'`);
        await queryRunner.query(`DROP TYPE "public"."category_hierarchy_level_enum_old"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "UQ_categories_slug"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_89afb34fd1fdb2ceb1cea6c57d" ON "attributes" ("name") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9140ad10131157cbc12183a152" ON "categories" ("hierarchy_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_de08738901be6b34d2824a1e24" ON "categories" ("parent_category_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_24717d02c8d42a10cd49fd0cc2" ON "categories" ("position") `);
        await queryRunner.query(`CREATE INDEX "IDX_1aec8cc6d119e6a3e09ca595b1" ON "categories" ("hierarchy_level") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_420d9f679d41281f282f5bc7d0" ON "categories" ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_55050a8a1b2d2f5202f226d4ac" ON "category_attributes" ("category_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_6730826326fa81ff5511cb0981" ON "category_attributes" ("attribute_id") `);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_de08738901be6b34d2824a1e243" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "category_attributes" ADD CONSTRAINT "FK_55050a8a1b2d2f5202f226d4ac1" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "category_attributes" ADD CONSTRAINT "FK_6730826326fa81ff5511cb0981a" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_6730826326fa81ff5511cb0981a"`);
        await queryRunner.query(`ALTER TABLE "category_attributes" DROP CONSTRAINT "FK_55050a8a1b2d2f5202f226d4ac1"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_de08738901be6b34d2824a1e243"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6730826326fa81ff5511cb0981"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_55050a8a1b2d2f5202f226d4ac"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_420d9f679d41281f282f5bc7d0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1aec8cc6d119e6a3e09ca595b1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_24717d02c8d42a10cd49fd0cc2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_de08738901be6b34d2824a1e24"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9140ad10131157cbc12183a152"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_89afb34fd1fdb2ceb1cea6c57d"`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "UQ_categories_slug" UNIQUE ("slug")`);
        await queryRunner.query(`CREATE TYPE "public"."category_hierarchy_level_enum_old" AS ENUM('0', '1', '2', '3')`);
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "hierarchy_level" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "hierarchy_level" TYPE "public"."category_hierarchy_level_enum_old" USING "hierarchy_level"::"text"::"public"."category_hierarchy_level_enum_old"`);
        await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "hierarchy_level" SET DEFAULT '0'`);
        await queryRunner.query(`DROP TYPE "public"."categories_hierarchy_level_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."category_hierarchy_level_enum_old" RENAME TO "category_hierarchy_level_enum"`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "UQ_categories_hierarchy_id" UNIQUE ("hierarchy_id")`);
        await queryRunner.query(`ALTER TABLE "attributes" ADD CONSTRAINT "UQ_attributes_name" UNIQUE ("name")`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "is_in_shop_by"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "is_in_header"`);
        await queryRunner.query(`CREATE INDEX "IDX_category_attributes_attribute_id" ON "category_attributes" ("attribute_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_category_attributes_category_id" ON "category_attributes" ("category_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_categories_position" ON "categories" ("position") `);
        await queryRunner.query(`CREATE INDEX "IDX_categories_slug" ON "categories" ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_categories_hierarchy_level" ON "categories" ("hierarchy_level") `);
        await queryRunner.query(`CREATE INDEX "IDX_categories_parent_category_id" ON "categories" ("parent_category_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_categories_hierarchy_id" ON "categories" ("hierarchy_id") `);
        await queryRunner.query(`ALTER TABLE "category_attributes" ADD CONSTRAINT "FK_category_attributes_attribute" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "category_attributes" ADD CONSTRAINT "FK_category_attributes_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_parent" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
