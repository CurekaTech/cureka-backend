import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { AdminBlogCategoriesController } from './controllers/admin-blog-categories.controller';
import { AdminBlogCommentsController } from './controllers/admin-blog-comments.controller';
import { AdminBlogPostsController } from './controllers/admin-blog-posts.controller';
import { PublicBlogController } from './controllers/public-blog.controller';
import { BlogAuditLogEntity } from './entities/blog-audit-log.entity';
import { BlogCategoryEntity } from './entities/blog-category.entity';
import { BlogCommentEntity } from './entities/blog-comment.entity';
import { BlogPostEntity } from './entities/blog-post.entity';
import { BlogPostProductEntity } from './entities/blog-post-product.entity';
import { BlogAuditLogsRepository } from './repositories/blog-audit-logs.repository';
import { BlogCategoriesRepository } from './repositories/blog-categories.repository';
import { BlogCommentsRepository } from './repositories/blog-comments.repository';
import { BlogPostProductsRepository } from './repositories/blog-post-products.repository';
import { BlogPostsRepository } from './repositories/blog-posts.repository';
import { BlogCategoriesService } from './services/blog-categories.service';
import { BlogCommentsService } from './services/blog-comments.service';
import { BlogPostsService } from './services/blog-posts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BlogCategoryEntity,
      BlogPostEntity,
      BlogPostProductEntity,
      BlogCommentEntity,
      BlogAuditLogEntity,
      AdminUserEntity,
    ]),
    UploadsModule,
    ProductModule,
  ],
  controllers: [
    AdminBlogCategoriesController,
    AdminBlogPostsController,
    AdminBlogCommentsController,
    PublicBlogController,
  ],
  providers: [
    BlogCategoriesRepository,
    BlogPostsRepository,
    BlogPostProductsRepository,
    BlogCommentsRepository,
    BlogAuditLogsRepository,
    BlogCategoriesService,
    BlogPostsService,
    BlogCommentsService,
  ],
  exports: [BlogCategoriesService, BlogPostsService, BlogCommentsService],
})
export class BlogModule {}
