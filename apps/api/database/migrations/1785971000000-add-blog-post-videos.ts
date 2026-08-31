import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBlogPostVideos1785971000000 implements MigrationInterface {
  name = 'AddBlogPostVideos1785971000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      ADD COLUMN IF NOT EXISTS "videos" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      UPDATE "blog_posts"
      SET "videos" = jsonb_build_array(
        jsonb_build_object('type', 'file', 'file', "featured_video")
      )
      WHERE "featured_video" IS NOT NULL
        AND jsonb_typeof("featured_video") = 'object'
        AND COALESCE("featured_video"->>'key', '') <> ''
    `);

    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      DROP COLUMN IF EXISTS "featured_video"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      ADD COLUMN IF NOT EXISTS "featured_video" jsonb
    `);

    await queryRunner.query(`
      UPDATE "blog_posts"
      SET "featured_video" = (
        SELECT elem->'file'
        FROM jsonb_array_elements(COALESCE("videos", '[]'::jsonb)) AS elem
        WHERE elem->>'type' = 'file'
          AND elem->'file' IS NOT NULL
          AND jsonb_typeof(elem->'file') = 'object'
        LIMIT 1
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      DROP COLUMN IF EXISTS "videos"
    `);
  }
}
