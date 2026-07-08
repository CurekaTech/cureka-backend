import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import {
  BlogCommentQueryDto,
  CreateBlogCommentDto,
  UpdateBlogCommentStatusDto,
} from '../dto/blog.dto';
import { BlogCommentStatus } from '../enums/blog-comment-status.enum';
import { mapBlogComment, mapPublicBlogComment } from '../mappers/blog.mapper';
import { BlogCommentsRepository } from '../repositories/blog-comments.repository';
import { BlogPostsRepository } from '../repositories/blog-posts.repository';

@Injectable()
export class BlogCommentsService {
  constructor(
    private readonly commentsRepo: BlogCommentsRepository,
    private readonly postsRepo: BlogPostsRepository,
  ) {}

  async findAll(
    query: BlogCommentQueryDto,
  ): Promise<PaginatedResult<ReturnType<typeof mapBlogComment>>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.commentsRepo.findAllPaginated({
      ...pagination,
      blogPostRefId: query.blogPostRefId,
      status: query.status,
    });

    return buildPaginatedResult(data.map(mapBlogComment), total, pagination);
  }

  async findApprovedByBlogSlug(slug: string) {
    const post = await this.postsRepo.findBySlug(slug);
    if (!post) throw new NotFoundException('Blog post not found');

    const comments = await this.commentsRepo.findApprovedByBlogPostRefId(post.refId);
    return comments.map(mapPublicBlogComment);
  }

  async createForBlogSlug(
    slug: string,
    dto: CreateBlogCommentDto,
    user?: IUserSessionContext,
  ) {
    const post = await this.postsRepo.findBySlug(slug);
    if (!post) throw new NotFoundException('Blog post not found');

    const refId = await generateUniqueRefId(dto.content.slice(0, 20), (id) =>
      this.commentsRepo.existsByRefId(id),
    );

    const entity = await this.commentsRepo.create({
      refId,
      blogPostId: post.id,
      blogPostRefId: post.refId,
      userId: user?.isRegistered ? user.sub : null,
      guestName: user?.isRegistered ? null : dto.guestName ?? null,
      guestEmail: user?.isRegistered ? null : dto.guestEmail ?? null,
      content: dto.content,
      status: BlogCommentStatus.PENDING,
      createdBy: user?.profile?.email ?? dto.guestEmail ?? 'guest',
      updatedBy: user?.profile?.email ?? dto.guestEmail ?? 'guest',
    });

    return mapBlogComment(entity);
  }

  async updateStatus(refId: string, dto: UpdateBlogCommentStatusDto, actor: string) {
    const existing = await this.commentsRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Blog comment not found');

    const updated = await this.commentsRepo.updateByRefId(refId, {
      status: dto.status,
      moderatedBy: actor,
      moderatedAt: new Date(),
      updatedBy: actor,
    });

    return mapBlogComment(updated!);
  }

  async remove(refId: string) {
    const existing = await this.commentsRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Blog comment not found');
    await this.commentsRepo.softDeleteByRefId(refId);
  }
}
