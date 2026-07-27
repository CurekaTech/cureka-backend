import { BlogCategoryEntity } from '../entities/blog-category.entity';
import { BlogCommentEntity } from '../entities/blog-comment.entity';
import { BlogPostEntity } from '../entities/blog-post.entity';

export const mapBlogCategory = (entity: BlogCategoryEntity) => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  description: entity.description,
  icon: entity.icon,
  sortOrder: entity.sortOrder,
  status: entity.status,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

const mapBlogFaqs = (entity: BlogPostEntity) =>
  (entity.faqs ?? [])
    .filter((faq) => faq?.question?.trim() && faq?.answer?.trim())
    .map((faq) => ({
      question: faq.question.trim(),
      answer: faq.answer.trim(),
    }));

export const mapBlogPost = (
  entity: BlogPostEntity,
  extras?: { productRefIds?: string[] },
) => ({
  refId: entity.refId,
  title: entity.title,
  slug: entity.slug,
  excerpt: entity.excerpt,
  content: entity.content,
  categoryRefId: entity.categoryRefId,
  author: entity.author,
  featuredImage: entity.featuredImage,
  featuredVideo: entity.featuredVideo,
  tags: entity.tags ?? [],
  productRefIds: extras?.productRefIds ?? [],
  faqs: mapBlogFaqs(entity),
  status: entity.status,
  visibility: entity.visibility,
  isFeatured: entity.isFeatured,
  isTrending: entity.isTrending,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  metaKeywords: entity.metaKeywords,
  publishedAt: entity.publishedAt,
  scheduledAt: entity.scheduledAt,
  views: entity.views,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const mapBlogPostCard = (entity: BlogPostEntity) => ({
  refId: entity.refId,
  title: entity.title,
  slug: entity.slug,
  excerpt: entity.excerpt,
  categoryRefId: entity.categoryRefId,
  author: entity.author,
  featuredImage: entity.featuredImage,
  tags: entity.tags ?? [],
  isFeatured: entity.isFeatured,
  isTrending: entity.isTrending,
  publishedAt: entity.publishedAt,
  views: entity.views,
  createdAt: entity.createdAt,
});

export const mapStorefrontBlogPost = (
  entity: BlogPostEntity,
  extras?: { productRefIds?: string[] },
) => ({
  refId: entity.refId,
  title: entity.title,
  slug: entity.slug,
  excerpt: entity.excerpt,
  content: entity.content,
  categoryRefId: entity.categoryRefId,
  author: entity.author,
  featuredImage: entity.featuredImage,
  featuredVideo: entity.featuredVideo,
  tags: entity.tags ?? [],
  productRefIds: extras?.productRefIds ?? [],
  faqs: mapBlogFaqs(entity),
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  metaKeywords: entity.metaKeywords,
  publishedAt: entity.publishedAt,
  views: entity.views,
  createdAt: entity.createdAt,
});

export const mapBlogComment = (entity: BlogCommentEntity) => ({
  refId: entity.refId,
  blogPostRefId: entity.blogPostRefId,
  blogPostTitle: entity.blogPost?.title ?? null,
  blogPostSlug: entity.blogPost?.slug ?? null,
  userId: entity.userId,
  guestName: entity.guestName,
  guestEmail: entity.guestEmail,
  content: entity.content,
  status: entity.status,
  moderatedBy: entity.moderatedBy,
  moderatedAt: entity.moderatedAt,
  createdAt: entity.createdAt,
});

export const mapPublicBlogComment = (entity: BlogCommentEntity) => ({
  refId: entity.refId,
  guestName: entity.guestName,
  content: entity.content,
  createdAt: entity.createdAt,
});
