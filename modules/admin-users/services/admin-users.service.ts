import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminUsersRepository } from '../repositories/admin-users.repository';
import { CreateAdminUserDto, UpdateAdminUserDto } from '../dto/admin-user.dto';
import { IAdminUser } from '../interfaces/admin-user.interface';
import {
  mapAdminUserEntityToResponse,
  mapAdminUserEntitiesToResponse,
} from '../mappers/admin-user.mapper';
import {
  hashPassword,
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
  generateUniqueRefId,
} from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
import { AdminUserRole } from '../enums/admin-user-role.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { assertCanAssignAdminUserRole, assertCanAssignStaffUserRole } from '@modules/users/constants/role-permissions.constants';
import { RolesRepository } from '@modules/roles/repositories/roles.repository';
import { RoleEntity } from '@modules/roles/entities/role.entity';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { UserEntity } from '@modules/users/entities/user.entity';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { IUser } from '@modules/users/interfaces/user.interface';
import { mapUserEntityToResponse } from '@modules/users/mappers/user.mapper';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '@modules/master/services/audit.service';
import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { getAuditActor } from '@modules/master/utils/audit-actor.context';
import { auditIdempotency } from '@modules/master/utils/audit-idempotency.util';
import { diffAuditFields } from '@modules/master/utils/audit-diff.util';
import { AdminUserEntity } from '../entities/admin-user.entity';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly adminUsersRepository: AdminUsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateAdminUserDto,
    createdBy: string,
    creatorRole: AdminUserRole,
    creatorId?: string,
  ): Promise<IAdminUser> {
    const { roleRefId: _roleRefId, ...createData } = dto;
    const roleRecord = dto.roleRefId
      ? await this.findRoleRecordByRefId(dto.roleRefId)
      : await this.findRoleRecordBySlug(dto.role ?? AdminUserRole.ADMIN);
    const targetRole = this.resolveLegacyAdminRole(roleRecord, dto.role ?? AdminUserRole.ADMIN);
    assertCanAssignAdminUserRole(
      creatorRole,
      targetRole,
      await this.creatorPermissionCodes(creatorId, creatorRole),
    );
    const existing = await this.adminUsersRepository.findByNormalizedEmailIncludingDeleted(
      dto.email,
    );
    if (existing && !existing.deletedAt) {
      throw new ConflictException('An admin user with this email already exists');
    }

    const hashedPassword = await hashPassword(dto.password);

    if (existing?.deletedAt) {
      const restored = await this.restoreSoftDeletedAdmin(existing.id, {
        ...createData,
        email: dto.email.trim(),
        role: targetRole,
        roleId: roleRecord?.id,
        password: hashedPassword,
        isActive: true,
        updatedBy: createdBy,
      });
      return mapAdminUserEntityToResponse(restored);
    }

    try {
      const entity = await this.dataSource.transaction(async (manager) => {
        return this.adminUsersRepository.create(
          {
            ...createData,
            role: targetRole,
            roleId: roleRecord?.id,
            password: hashedPassword,
            refId: await generateUniqueRefId(dto.fullName, (refId) =>
              this.adminUsersRepository.existsByRefId(refId),
            ),
            createdBy,
          },
          manager,
        );
      });
      await this.recordAdminUserWrite(entity, 'created', createdBy, {}, this.adminUserSnapshot(entity));
      return mapAdminUserEntityToResponse(entity);
    } catch (error) {
      if (this.isEmailUniqueViolation(error)) {
        throw new ConflictException('An admin user with this email already exists');
      }
      throw error;
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IAdminUser>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.adminUsersRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapAdminUserEntitiesToResponse(data), total, paginationOptions);
  }

  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async findOne(refIdOrId: string): Promise<IAdminUser | IUser> {
    const adminEntity = await this.findAdminByRefIdOrId(refIdOrId);
    if (adminEntity) {
      return mapAdminUserEntityToResponse(adminEntity);
    }

    const userEntity = await this.findUserByRefIdOrId(refIdOrId);
    if (!userEntity) {
      throw new NotFoundException(`Admin or staff user with refId/id ${refIdOrId} not found`);
    }

    return mapUserEntityToResponse(userEntity);
  }

  async update(
    refIdOrId: string,
    dto: UpdateAdminUserDto,
    creatorRole: AdminUserRole,
    creatorId?: string,
  ): Promise<IAdminUser | IUser> {
    const existingAdmin = await this.findAdminByRefIdOrId(refIdOrId);
    if (existingAdmin) {
      return this.updateAdminUser(refIdOrId, dto, existingAdmin, creatorRole, creatorId);
    }

    return this.updateAnyUser(refIdOrId, dto, creatorRole);
  }

  private async findAdminByRefIdOrId(refIdOrId: string) {
    if (AdminUsersService.UUID_REGEX.test(refIdOrId)) {
      return this.adminUsersRepository.findById(refIdOrId);
    }
    return this.adminUsersRepository.findByRefId(refIdOrId);
  }

  private async findUserByRefIdOrId(refIdOrId: string) {
    if (AdminUsersService.UUID_REGEX.test(refIdOrId)) {
      return this.usersRepository.findById(refIdOrId);
    }
    return this.usersRepository.findByRefId(refIdOrId);
  }

  private async updateAdminUser(
    refId: string,
    dto: UpdateAdminUserDto,
    existing: IAdminUser,
    creatorRole: AdminUserRole,
    creatorId?: string,
  ): Promise<IAdminUser> {
    if (dto.role && !Object.values(AdminUserRole).includes(dto.role as AdminUserRole)) {
      throw new BadRequestException(`Invalid admin user role "${dto.role}"`);
    }

    const permissionCodes = await this.creatorPermissionCodes(creatorId, creatorRole);
    if (dto.role) {
      assertCanAssignAdminUserRole(creatorRole, dto.role as AdminUserRole, permissionCodes);
    }

    const roleRecord = dto.roleRefId
      ? await this.findRoleRecordByRefId(dto.roleRefId)
      : dto.role
        ? await this.findRoleRecordBySlug(dto.role)
        : undefined;

    let nextLegacyRole: AdminUserRole | undefined;
    if (roleRecord) {
      nextLegacyRole = this.resolveLegacyAdminRole(
        roleRecord,
        (dto.role as AdminUserRole) ?? existing.role,
      );
    } else if (dto.role) {
      nextLegacyRole = dto.role as AdminUserRole;
    }

    if (nextLegacyRole) {
      assertCanAssignAdminUserRole(creatorRole, nextLegacyRole as AdminUserRole, permissionCodes);
    }

    const { roleRefId: _roleRefId, status: _status, password, ...updateData } = dto;
    const nextPassword = typeof password === 'string' ? password.trim() : '';
    const hashedPassword = nextPassword ? await hashPassword(nextPassword) : undefined;
    const roleChanged =
      (nextLegacyRole !== undefined && nextLegacyRole !== existing.role) ||
      (roleRecord != null && roleRecord.id !== existing.roleId);
    const updated = await this.dataSource.transaction(async (manager) => {
      const saved = await this.adminUsersRepository.updateByRefId(refId, {
        ...updateData,
        ...(hashedPassword ? { password: hashedPassword } : {}),
        role: nextLegacyRole as AdminUserRole,
        roleId: roleRecord?.id,
      }, manager);
      if (saved && roleChanged) {
        await this.auditService.enqueueCritical(manager, {
          entityType: 'admin_rbac',
          entityId: saved.id,
          entityRefId: saved.refId,
          action: 'assign_role',
          performedBy: getAuditActor()?.performedBy ?? 'anonymous',
          idempotencyKey: auditIdempotency.rbac(
            'assign_role',
            saved.id,
            saved.updatedAt?.toISOString() ?? saved.roleId ?? 'role',
          ),
          details: { role: saved.role, roleId: saved.roleId ?? null },
        });
      }
      return saved;
    });
    if (!updated) {
      throw new NotFoundException(`Admin user with refId ${refId} not found after update`);
    }

    await this.recordAdminUserWrite(
      updated,
      'updated',
      getAuditActor()?.performedBy,
      this.adminUserSnapshot(existing),
      this.adminUserSnapshot(updated),
    );
    return mapAdminUserEntityToResponse(updated);
  }

  private async updateAnyUser(
    refIdOrId: string,
    dto: UpdateAdminUserDto,
    creatorRole: AdminUserRole,
  ): Promise<IUser> {
    const existingUser = await this.findUserByRefIdOrId(refIdOrId);
    if (!existingUser) {
      throw new NotFoundException(`Admin or staff user with refId/id ${refIdOrId} not found`);
    }

    const updateData: Partial<UserEntity> = {};

    if (dto.roleRefId) {
      const roleRecord = await this.findRoleRecordByRefId(dto.roleRefId);
      if (!Object.values(UserRole).includes(roleRecord.slug as UserRole)) {
        throw new BadRequestException(
          `Role refId ${dto.roleRefId} cannot be assigned to users`,
        );
      }

      assertCanAssignStaffUserRole(creatorRole, roleRecord.slug as UserRole);
      updateData.role = roleRecord.slug as UserRole;
      updateData.roleId = roleRecord.id;
    }

    if (dto.role) {
      if (!Object.values(UserRole).includes(dto.role as UserRole)) {
        throw new BadRequestException(`Invalid user role "${dto.role}"`);
      }

      assertCanAssignStaffUserRole(creatorRole, dto.role as UserRole);
      updateData.role = dto.role as UserRole;
      const roleRecord = await this.findRoleRecordBySlug(dto.role);
      updateData.roleId = roleRecord?.id;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    if (dto.email !== undefined && dto.email !== existingUser.email) {
      const emailTaken = await this.usersRepository.existsByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const updated = await this.usersRepository.updateByRefId(existingUser.refId, updateData);
    if (!updated) {
      throw new NotFoundException(`Admin or staff user with refId/id ${refIdOrId} not found after update`);
    }

    return mapUserEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.adminUsersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Admin user with refId ${refId} not found`);
    }
    await this.dataSource.transaction(async (manager) => {
      await this.adminUsersRepository.softDeleteByRefId(refId, manager);
    });
    await this.recordAdminUserWrite(
      existing,
      'deleted',
      getAuditActor()?.performedBy,
      this.adminUserSnapshot(existing),
      {},
    );
  }

  /** Used by auth module — never expose password via public API responses. */
  async findByEmailWithPassword(email: string) {
    return this.adminUsersRepository.findByEmailWithPassword(email);
  }

  async findByNormalizedEmailWithPassword(email: string) {
    return this.adminUsersRepository.findByNormalizedEmailWithPassword(email);
  }

  /** Used by auth module to build the current user's RBAC context. */
  async findEntityById(id: string) {
    return this.adminUsersRepository.findById(id);
  }

  async recordLogin(id: string): Promise<void> {
    await this.adminUsersRepository.updateLastLoginAt(id);
  }

  private async creatorPermissionCodes(
    creatorId: string | undefined,
    creatorRole: AdminUserRole,
  ): Promise<string[]> {
    if (creatorRole === AdminUserRole.SUPER_ADMIN) return ['*'];
    if (!creatorId) return [];
    const creator = await this.adminUsersRepository.findById(creatorId);
    return (creator?.roleRecord?.permissions ?? [])
      .filter((permission) => permission.status === MasterStatus.ACTIVE)
      .map((permission) => permission.code);
  }

  private async findRoleRecordByRefId(refId: string): Promise<RoleEntity> {
    const roleRecord = await this.rolesRepository.findByRefId(refId);
    if (!roleRecord) {
      throw new NotFoundException(`Role with refId ${refId} not found`);
    }

    return roleRecord;
  }

  private findRoleRecordBySlug(slug: string): Promise<RoleEntity | null> {
    return this.rolesRepository.findBySlug(slug);
  }

  private resolveLegacyAdminRole(
    roleRecord: RoleEntity | null,
    fallback: AdminUserRole,
  ): AdminUserRole {
    const slug = roleRecord?.slug;
    if (slug && Object.values(AdminUserRole).includes(slug as AdminUserRole)) {
      return slug as AdminUserRole;
    }

    return fallback === AdminUserRole.SUPER_ADMIN ? AdminUserRole.SUPER_ADMIN : AdminUserRole.ADMIN;
  }

  private async restoreSoftDeletedAdmin(
    id: string,
    data: Parameters<AdminUsersRepository['restoreAndUpdate']>[1],
  ) {
    try {
      const restored = await this.dataSource.transaction(async (manager) => {
        const saved = await this.adminUsersRepository.restoreAndUpdate(id, data, manager);
        if (!saved) {
          throw new NotFoundException('Admin user could not be restored');
        }
        return saved;
      });
      await this.recordAdminUserWrite(
        restored,
        'created',
        data.updatedBy,
        {},
        this.adminUserSnapshot(restored),
      );
      return restored;
    } catch (error) {
      if (this.isEmailUniqueViolation(error)) {
        throw new ConflictException('An admin user with this email already exists');
      }
      throw error;
    }
  }

  private adminUserSnapshot(user: {
    fullName: string;
    email: string;
    phone?: string | null;
    role: string;
    roleId?: string | null;
    isActive: boolean;
  }): Record<string, unknown> {
    return {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
      roleId: user.roleId ?? null,
      isActive: user.isActive,
    };
  }

  private recordAdminUserWrite(
    entity: Pick<AdminUserEntity, 'id' | 'refId' | 'fullName' | 'email' | 'role' | 'isActive'>,
    action: 'created' | 'updated' | 'deleted',
    performedBy: string | undefined,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.auditService.recordWrite({
      entityType: AuditEntityType.ADMIN_USER,
      entityId: entity.id,
      entityRefId: entity.refId,
      action,
      performedBy,
      name: entity.fullName,
      details: {
        email: entity.email,
        role: entity.role,
        isActive: entity.isActive,
      },
      databaseChanges: diffAuditFields({
        table: 'admin_users',
        recordId: entity.id,
        before,
        after,
        changeType: action,
      }),
    });
  }

  private isEmailUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string; detail?: string };
    if (driverError?.code !== '23505') return false;
    return `${driverError.constraint ?? ''} ${driverError.detail ?? ''}`.toLowerCase().includes(
      'email',
    );
  }
}
