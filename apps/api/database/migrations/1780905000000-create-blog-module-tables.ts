import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlogModuleTables1780905000000 implements MigrationInterface {
  name = 'CreateBlogModuleTables1780905000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."blog_category_status_enum" AS ENUM('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."blog_post_status_enum" AS ENUM('draft', 'published', 'scheduled', 'archived')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."blog_post_visibility_enum" AS ENUM('public', 'hidden')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."blog_comment_status_enum" AS ENUM('pending', 'approved', 'rejected')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."blog_audit_action_enum" AS ENUM(
        'created', 'updated', 'published', 'unpublished', 'scheduled',
        'status_changed', 'featured', 'unfeatured', 'trending', 'untrending', 'deleted'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_categories" (
        "id"           uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"       character varying(11)                             NOT NULL,
        "name"         character varying(150)                            NOT NULL,
        "slug"         character varying(180)                            NOT NULL,
        "description"  character varying(500),
        "sort_order"   integer                                           NOT NULL DEFAULT 0,
        "status"       "public"."blog_category_status_enum"              NOT NULL DEFAULT 'active',
        "created_by"   character varying(255),
        "updated_by"   character varying(255),
        "created_at"   TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMPTZ,
        CONSTRAINT "PK_blog_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_categories_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_blog_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_posts" (
        "id"                uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"            character varying(11)                             NOT NULL,
        "title"             character varying(255)                            NOT NULL,
        "slug"              character varying(280)                            NOT NULL,
        "excerpt"           character varying(500),
        "content"           text                                              NOT NULL,
        "category_ref_id"   character varying(11)                             NOT NULL,
        "author"            character varying(150),
        "featured_image"    jsonb,
        "featured_video"    jsonb,
        "tags"              text,
        "status"            "public"."blog_post_status_enum"                  NOT NULL DEFAULT 'draft',
        "visibility"        "public"."blog_post_visibility_enum"              NOT NULL DEFAULT 'public',
        "is_featured"       boolean                                           NOT NULL DEFAULT false,
        "is_trending"       boolean                                           NOT NULL DEFAULT false,
        "meta_title"        character varying(255),
        "meta_description"  character varying(500),
        "meta_keywords"     character varying(500),
        "published_at"      TIMESTAMPTZ,
        "scheduled_at"      TIMESTAMPTZ,
        "views"             integer                                           NOT NULL DEFAULT 0,
        "created_by"        character varying(255),
        "updated_by"        character varying(255),
        "created_at"        TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"        TIMESTAMPTZ,
        CONSTRAINT "PK_blog_posts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_posts_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_blog_posts_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_post_products" (
        "id"              uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"          character varying(11)                             NOT NULL,
        "blog_post_id"    uuid                                              NOT NULL,
        "product_ref_id"  character varying(11)                             NOT NULL,
        "sort_order"      integer                                           NOT NULL DEFAULT 0,
        "created_by"      character varying(255),
        "updated_by"      character varying(255),
        "created_at"      TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_blog_post_products" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_post_products_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_blog_post_products_post" FOREIGN KEY ("blog_post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_comments" (
        "id"                uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"            character varying(11)                             NOT NULL,
        "blog_post_id"      uuid                                              NOT NULL,
        "blog_post_ref_id"  character varying(11)                             NOT NULL,
        "user_id"           uuid,
        "guest_name"        character varying(150),
        "guest_email"       character varying(255),
        "content"           text                                              NOT NULL,
        "status"            "public"."blog_comment_status_enum"               NOT NULL DEFAULT 'pending',
        "moderated_by"      character varying(255),
        "moderated_at"      TIMESTAMPTZ,
        "created_by"        character varying(255),
        "updated_by"        character varying(255),
        "created_at"        TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"        TIMESTAMPTZ,
        CONSTRAINT "PK_blog_comments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_comments_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_blog_comments_post" FOREIGN KEY ("blog_post_id")
          REFERENCES "blog_posts"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_audit_logs" (
        "id"            uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "blog_post_id"  uuid                                              NOT NULL,
        "action"        "public"."blog_audit_action_enum"                 NOT NULL,
        "performed_by"  character varying(255)                            NOT NULL,
        "details"       jsonb,
        "created_at"    TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blog_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_blog_categories_status" ON "blog_categories" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_posts_category_ref_id" ON "blog_posts" ("category_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_posts_status" ON "blog_posts" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_posts_visibility" ON "blog_posts" ("visibility")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_posts_is_featured" ON "blog_posts" ("is_featured")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_posts_is_trending" ON "blog_posts" ("is_trending")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_posts_published_at" ON "blog_posts" ("published_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_post_products_blog_post_id" ON "blog_post_products" ("blog_post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_post_products_product_ref_id" ON "blog_post_products" ("product_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_comments_blog_post_id" ON "blog_comments" ("blog_post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_comments_blog_post_ref_id" ON "blog_comments" ("blog_post_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_comments_status" ON "blog_comments" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_audit_logs_blog_post_id" ON "blog_audit_logs" ("blog_post_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_audit_logs_blog_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_comments_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_comments_blog_post_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_comments_blog_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_post_products_product_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_post_products_blog_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_posts_published_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_posts_is_trending"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_posts_is_featured"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_posts_visibility"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_posts_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_posts_category_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_categories_status"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "blog_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_post_products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_posts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_categories"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."blog_audit_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."blog_comment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."blog_post_visibility_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."blog_post_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."blog_category_status_enum"`);
  }
}
