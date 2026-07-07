import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGalleryTable1780854000000 implements MigrationInterface {
  name = 'CreateGalleryTable1780854000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gallery" (
        "id"           uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"       character varying(11)    NOT NULL,
        "filename"     character varying(255)   NOT NULL,
        "url"          character varying(1024)  NOT NULL,
        "mimetype"     character varying(100)   NOT NULL,
        "size"         integer                  NOT NULL,
        "created_by"   character varying(255),
        "updated_by"   character varying(255),
        "created_at"   TIMESTAMPTZ              NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ              NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMPTZ,
        CONSTRAINT "PK_gallery" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gallery_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_gallery_filename" ON "gallery" ("filename")`);
    await queryRunner.query(`CREATE INDEX "IDX_gallery_ref_id" ON "gallery" ("ref_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gallery_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gallery_filename"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gallery"`);
  }
}
