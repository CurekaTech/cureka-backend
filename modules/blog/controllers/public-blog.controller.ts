import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { OptionalSessionCookieGuard } from '@modules/auth/guards/optional-session-cookie.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import {
  CreateBlogCommentDto,
  PublicBlogSearchQueryDto,
} from '../dto/blog.dto';
import { BlogCategoriesService } from '../services/blog-categories.service';
import { BlogCommentsService } from '../services/blog-comments.service';
import { BlogPostsService } from '../services/blog-posts.service';

@ApiTags('Public Blog')
@Controller('public/blog')
export class PublicBlogController {
  constructor(
    private readonly categoriesService: BlogCategoriesService,
    private readonly postsService: BlogPostsService,
    private readonly commentsService: BlogCommentsService,
  ) {}

  @ApiOperation({ summary: 'List active blog categories' })
  @ResponseMessage('Blog categories retrieved successfully')
  @Get('categories')
  getCategories() {
    return this.categoriesService.findAllActive();
  }

  @ApiOperation({ summary: 'List published blog posts with search and filters' })
  @ResponseMessage('Blog posts retrieved successfully')
  @Get('posts')
  getPosts(@Query() query: PublicBlogSearchQueryDto) {
    return this.postsService.findAllPublic(query);
  }

  @ApiOperation({ summary: 'List featured blog posts' })
  @ResponseMessage('Featured blog posts retrieved successfully')
  @Get('posts/featured')
  getFeaturedPosts() {
    return this.postsService.findFeaturedPublic();
  }

  @ApiOperation({ summary: 'List trending blog posts' })
  @ResponseMessage('Trending blog posts retrieved successfully')
  @Get('posts/trending')
  getTrendingPosts() {
    return this.postsService.findTrendingPublic();
  }

  @ApiOperation({ summary: 'Get blog post by slug with products and related blogs' })
  @ResponseMessage('Blog post retrieved successfully')
  @Get('posts/:slug')
  getPostBySlug(@Param('slug') slug: string) {
    return this.postsService.findOneBySlug(slug);
  }

  @ApiOperation({ summary: 'List approved comments for a blog post' })
  @ResponseMessage('Blog comments retrieved successfully')
  @Get('posts/:slug/comments')
  getComments(@Param('slug') slug: string) {
    return this.commentsService.findApprovedByBlogSlug(slug);
  }

  @ApiOperation({ summary: 'Submit a comment on a blog post (requires moderation)' })
  @ResponseMessage('Comment submitted successfully')
  @UseGuards(OptionalSessionCookieGuard)
  @Post('posts/:slug/comments')
  createComment(
    @Param('slug') slug: string,
    @Body() dto: CreateBlogCommentDto,
    @CurrentSessionUser() user?: IUserSessionContext,
  ) {
    return this.commentsService.createForBlogSlug(slug, dto, user);
  }
}
