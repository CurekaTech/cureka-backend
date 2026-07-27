import { SupportArticleEntity } from '../entities/support-article.entity';
import { SupportCategoryEntity } from '../entities/support-category.entity';
import { SupportFaqEntity } from '../entities/support-faq.entity';
import { SupportTicketEntity } from '../entities/support-ticket.entity';
import { TicketMessageEntity } from '../entities/ticket-message.entity';

export const mapSupportCategory = (entity: SupportCategoryEntity) => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  type: entity.type,
  status: entity.status,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const mapSupportArticle = (entity: SupportArticleEntity) => ({
  refId: entity.refId,
  title: entity.title,
  slug: entity.slug,
  categoryRefId: entity.categoryRefId,
  content: entity.content,
  featuredImage: entity.featuredImage,
  status: entity.status,
  views: entity.views,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const mapStorefrontArticle = (entity: SupportArticleEntity) => ({
  refId: entity.refId,
  title: entity.title,
  slug: entity.slug,
  categoryRefId: entity.categoryRefId,
  content: entity.content,
  featuredImage: entity.featuredImage,
  views: entity.views,
  createdAt: entity.createdAt,
});

export const mapSupportFaq = (entity: SupportFaqEntity) => ({
  refId: entity.refId,
  question: entity.question,
  answer: entity.answer,
  categoryRefId: entity.categoryRefId,
  sortOrder: entity.sortOrder,
  status: entity.status,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const mapStorefrontFaq = (entity: SupportFaqEntity) => ({
  refId: entity.refId,
  question: entity.question,
  answer: entity.answer,
  categoryRefId: entity.categoryRefId,
});

export const mapSupportTicket = (entity: SupportTicketEntity) => ({
  refId: entity.refId,
  ticketNumber: entity.ticketNumber,
  userId: entity.userId,
  guestName: entity.guestName,
  guestEmail: entity.guestEmail,
  guestMobile: entity.guestMobile,
  category: entity.category,
  subject: entity.subject,
  description: entity.description,
  status: entity.status,
  priority: entity.priority,
  orderId: entity.orderId,
  reasonRefId: entity.reasonRefId,
  reasonTitle: entity.reasonTitle,
  workflow: entity.workflow,
  pickupMode: entity.pickupMode,
  assignedTo: entity.assignedTo,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

/** Lightweight list shape — omits description and admin-only fields. */
export const mapSupportTicketSummary = (
  entity: Pick<
    SupportTicketEntity,
    | 'refId'
    | 'ticketNumber'
    | 'category'
    | 'subject'
    | 'status'
    | 'priority'
    | 'orderId'
    | 'reasonRefId'
    | 'reasonTitle'
    | 'workflow'
    | 'pickupMode'
    | 'createdAt'
  >,
) => ({
  refId: entity.refId,
  ticketNumber: entity.ticketNumber,
  category: entity.category,
  subject: entity.subject,
  status: entity.status,
  priority: entity.priority,
  orderId: entity.orderId,
  reasonRefId: entity.reasonRefId,
  reasonTitle: entity.reasonTitle,
  workflow: entity.workflow,
  pickupMode: entity.pickupMode,
  createdAt: entity.createdAt,
});

export const mapTicketMessage = (entity: TicketMessageEntity) => ({
  refId: entity.refId,
  senderType: entity.senderType,
  senderId: entity.senderId,
  message: entity.message,
  attachmentUrl: entity.attachmentUrl,
  createdAt: entity.createdAt,
});
