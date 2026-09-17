import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import {
  AdminNotificationEmailQueryDto,
  CreateAdminNotificationEmailDto,
  UpdateAdminNotificationEmailDto,
} from '../dto/admin-notification-email.dto';
import { AdminNotificationEmailType } from '../enums/admin-notification-email-type.enum';
import { IAdminNotificationEmail } from '../interfaces/admin-notification-email.interface';
import { mapAdminNotificationEmail } from '../mappers/admin-notification-email.mapper';
import { AdminNotificationEmailsRepository } from '../repositories/admin-notification-emails.repository';

@Injectable()
export class AdminNotificationEmailsService {
  constructor(private readonly repo: AdminNotificationEmailsRepository) {}

  async create(
    dto: CreateAdminNotificationEmailDto,
    actor: string,
  ): Promise<IAdminNotificationEmail> {
    const email = dto.email.trim().toLowerCase();
    const type = dto.type ?? AdminNotificationEmailType.PRODUCT_OOS;

    const existing = await this.repo.findByEmailAndType(email, type);
    if (existing) {
      throw new ConflictException(
        `Notification email "${email}" already exists for type "${type}"`,
      );
    }

    const refId = await generateUniqueRefId(email, (id) => this.repo.existsByRefId(id));
    const entity = await this.repo.create({
      refId,
      email,
      type,
      isActive: dto.isActive ?? true,
      createdBy: actor,
      updatedBy: actor,
    });

    return mapAdminNotificationEmail(entity);
  }

  async findAll(
    query: AdminNotificationEmailQueryDto,
  ): Promise<PaginatedResult<IAdminNotificationEmail>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.repo.findAllPaginated({
      ...pagination,
      type: query.type ?? AdminNotificationEmailType.PRODUCT_OOS,
      isActive: query.isActive,
    });
    return buildPaginatedResult(data.map(mapAdminNotificationEmail), total, pagination);
  }

  async findOne(refId: string): Promise<IAdminNotificationEmail> {
    const entity = await this.repo.findByRefId(refId);
    if (!entity) throw new NotFoundException('Notification email not found');
    return mapAdminNotificationEmail(entity);
  }

  async update(
    refId: string,
    dto: UpdateAdminNotificationEmailDto,
    actor: string,
  ): Promise<IAdminNotificationEmail> {
    const existing = await this.repo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Notification email not found');

    const nextEmail =
      dto.email !== undefined ? dto.email.trim().toLowerCase() : existing.email;
    const nextType = dto.type ?? existing.type;

    if (nextEmail !== existing.email || nextType !== existing.type) {
      const duplicate = await this.repo.findByEmailAndType(nextEmail, nextType);
      if (duplicate && duplicate.id !== existing.id) {
        throw new ConflictException(
          `Notification email "${nextEmail}" already exists for type "${nextType}"`,
        );
      }
    }

    const updated = await this.repo.updateByRefId(refId, {
      ...(dto.email !== undefined ? { email: nextEmail } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      updatedBy: actor,
    });

    return mapAdminNotificationEmail(updated!);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.repo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Notification email not found');
    await this.repo.softDeleteByRefId(refId);
  }

  findActiveEmailsByType(type: AdminNotificationEmailType): Promise<string[]> {
    return this.repo.findActiveEmailsByType(type);
  }

  countActiveByType(type: AdminNotificationEmailType): Promise<number> {
    return this.repo.countActiveByType(type);
  }
}
