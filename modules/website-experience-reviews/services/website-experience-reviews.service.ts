import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import {
  CreateWebsiteExperienceReviewDto,
  WebsiteExperienceReviewQueryDto,
} from '../dto/website-experience-review.dto';
import {
  IWebsiteExperienceReview,
  IWebsiteExperienceReviewEligibility,
} from '../interfaces/website-experience-review.interface';
import { mapWebsiteExperienceReview } from '../mappers/website-experience-review.mapper';
import { WebsiteExperienceReviewsRepository } from '../repositories/website-experience-reviews.repository';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class WebsiteExperienceReviewsService {
  constructor(
    private readonly reviewsRepository: WebsiteExperienceReviewsRepository,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  async eligibility(
    orderRef: string,
    user?: IUserSessionContext,
  ): Promise<IWebsiteExperienceReviewEligibility> {
    if (!user?.isRegistered || !user.sub) {
      return { canReview: false, submitted: false, existingReview: null };
    }

    const order = await this.findOwnedOrder(orderRef, user.sub);
    const existing = await this.reviewsRepository.findByOrderId(order.id);
    if (existing) {
      return {
        canReview: false,
        submitted: true,
        existingReview: mapWebsiteExperienceReview(existing),
      };
    }

    return { canReview: true, submitted: false, existingReview: null };
  }

  async createForOrder(
    orderRef: string,
    dto: CreateWebsiteExperienceReviewDto,
    user?: IUserSessionContext,
  ): Promise<IWebsiteExperienceReview> {
    if (!user?.isRegistered || !user.sub) {
      throw new ForbiddenException('Please sign in to submit website experience feedback');
    }

    const rating = Number(dto.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    const order = await this.findOwnedOrder(orderRef, user.sub);
    const alreadySubmitted = await this.reviewsRepository.findByOrderId(order.id);
    if (alreadySubmitted) {
      throw new ConflictException('You have already submitted website experience feedback for this order');
    }

    const feedback = dto.feedback?.trim() || null;
    const customerName = this.customerName(user);
    try {
      const entity = await this.reviewsRepository.create({
        orderId: order.id,
        userId: user.sub,
        orderNumber: order.orderNumber,
        customerName,
        customerEmail: user.profile?.email?.trim() || null,
        rating,
        feedback,
        refId: await generateUniqueRefId('WER', (refId) => this.reviewsRepository.existsByRefId(refId)),
        createdBy: user.profile?.email ?? user.sub,
      });
      return mapWebsiteExperienceReview(entity);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'You have already submitted website experience feedback for this order',
        );
      }
      throw error;
    }
  }

  async findAll(
    query: WebsiteExperienceReviewQueryDto,
  ): Promise<PaginatedResult<IWebsiteExperienceReview>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.reviewsRepository.findAllPaginated(pagination);
    return buildPaginatedResult(data.map(mapWebsiteExperienceReview), total, pagination);
  }

  private async findOwnedOrder(orderRef: string, userId: string): Promise<OrderEntity> {
    const trimmed = orderRef.trim().replace(/^#/, '');
    const order = UUID_REGEX.test(trimmed)
      ? await this.ordersRepository.findByIdAndUserId(trimmed, userId)
      : await this.ordersRepository.findByOrderNumberAndUserId(trimmed, userId);
    if (!order) {
      throw new NotFoundException(`Order ${orderRef} not found`);
    }
    return order;
  }

  private customerName(user: IUserSessionContext): string {
    const first = user.profile?.firstName?.trim() ?? '';
    const last = user.profile?.lastName?.trim() ?? '';
    const full = `${first} ${last}`.trim();
    return full || user.profile?.email?.trim() || 'Customer';
  }

  private isUniqueViolation(error: unknown): boolean {
    const driver = error as { code?: string; driverError?: { code?: string } };
    return driver.code === '23505' || driver.driverError?.code === '23505';
  }
}
