import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { IAdminJwtPayload } from '@packages/auth';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { parseIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { SessionCacheService } from '@modules/auth/services/session-cache.service';
import { assertCanAssignStaffUserRole, assertCanManageStaffUsers } from '../constants/role-permissions.constants';
import { CreateStaffUserDto, StaffUserQueryDto, UpdateStaffUserDto } from '../dto/user.dto';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { IUser } from '../interfaces/user.interface';
import { mapUserEntitiesToResponse, mapUserEntityToResponse } from '../mappers/user.mapper';
import { UsersRepository } from '../repositories/users.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { RolesRepository } from '@modules/roles/repositories/roles.repository';
import { RoleEntity } from '@modules/roles/entities/role.entity';

const STAFF_ROLES: UserRole[] = [UserRole.VENDOR, UserRole.TELECALLER];
const USER_MEDIA_FIELDS = ['profileImageUrl'] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class StaffUsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionCacheService: SessionCacheService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly rolesRepository: RolesRepository,
  ) {}

  async create(dto: CreateStaffUserDto, creator: IAdminJwtPayload): Promise<IUser> {
    assertCanAssignStaffUserRole(creator.role as AdminUserRole, dto.role);

    const mobileNumber = parseIndianMobileNumber(dto.mobileNumber);
    const mobileTaken = await this.usersRepository.existsByMobileNumber(mobileNumber);
    if (mobileTaken) {
      throw new ConflictException('A user with this mobile number already exists');
    }

    if (dto.email) {
      const emailTaken = await this.usersRepository.existsByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    const refId = await generateUniqueRefId('staff', (id) => this.usersRepository.existsByRefId(id));
    const roleRecord = await this.resolveRoleRecord(dto.role);

    const entity = await this.usersRepository.create({
      refId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      mobileNumber,
      email: dto.email,
      role: dto.role,
      roleId: roleRecord?.id,
      isGuest: false,
      isRegistered: true,
      status: UserStatus.ACTIVE,
      createdBy: creator.email,
      updatedBy: creator.email,
    });

    return this.enrichUser(mapUserEntityToResponse(entity));
  }

  async findAll(
    query: StaffUserQueryDto,
    creator: IAdminJwtPayload,
  ): Promise<PaginatedResult<IUser>> {
    assertCanManageStaffUsers(creator.role as AdminUserRole);

    const paginationOptions = buildPaginationOptions({
      page: query.page,
      limit: query.limit,
      search: query.search,
    });

    const roles = query.role ? [query.role] : STAFF_ROLES;
    if (query.role) {
      assertCanAssignStaffUserRole(creator.role as AdminUserRole, query.role);
    }

    const { data, total } = await this.usersRepository.findStaffPaginated({
      ...paginationOptions,
      roles,
    });

    const result = buildPaginatedResult(mapUserEntitiesToResponse(data), total, paginationOptions);
    return this.storageUrlEnricher.enrichPaginated(result, [...USER_MEDIA_FIELDS]);
  }

  async findOne(refIdOrId: string, creator: IAdminJwtPayload): Promise<IUser> {
    assertCanManageStaffUsers(creator.role as AdminUserRole);

    const entity = await this.findStaffByRefIdOrId(refIdOrId);
    if (!entity || !STAFF_ROLES.includes(entity.role)) {
      throw new NotFoundException(`Staff user with refId/id ${refIdOrId} not found`);
    }

    return this.enrichUser(mapUserEntityToResponse(entity));
  }

  async update(
    refIdOrId: string,
    dto: UpdateStaffUserDto,
    creator: IAdminJwtPayload,
  ): Promise<IUser> {
    assertCanManageStaffUsers(creator.role as AdminUserRole);

    const existing = await this.findStaffByRefIdOrId(refIdOrId);
    if (!existing || !STAFF_ROLES.includes(existing.role)) {
      throw new NotFoundException(`Staff user with refId/id ${refIdOrId} not found`);
    }

    if (dto.role) {
      assertCanAssignStaffUserRole(creator.role as AdminUserRole, dto.role);
    }

    if (dto.mobileNumber) {
      const mobileNumber = parseIndianMobileNumber(dto.mobileNumber);
      const taken = await this.usersRepository.isMobileTakenByOther(mobileNumber, existing.id);
      if (taken) {
        throw new ConflictException('Mobile number is already in use');
      }
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.usersRepository.existsByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const roleRecord = dto.role ? await this.resolveRoleRecord(dto.role) : undefined;
    const updated = await this.usersRepository.update(existing.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      mobileNumber: dto.mobileNumber ? parseIndianMobileNumber(dto.mobileNumber) : undefined,
      role: dto.role,
      roleId: roleRecord?.id,
      status: dto.status,
      updatedBy: creator.email,
    });

    if (!updated) {
      throw new NotFoundException(`Staff user with refId/id ${refIdOrId} not found after update`);
    }

    await this.sessionCacheService.invalidateAllForUser(updated.id);

    return this.enrichUser(mapUserEntityToResponse(updated));
  }

  async remove(refIdOrId: string, creator: IAdminJwtPayload): Promise<void> {
    assertCanManageStaffUsers(creator.role as AdminUserRole);

    const existing = await this.findStaffByRefIdOrId(refIdOrId);
    if (!existing || !STAFF_ROLES.includes(existing.role)) {
      throw new NotFoundException(`Staff user with refId/id ${refIdOrId} not found`);
    }

    await this.usersRepository.softDelete(existing.id);
    await this.sessionCacheService.invalidateAllForUser(existing.id);
  }

  private async findStaffByRefIdOrId(refIdOrId: string) {
    const byRefId = await this.usersRepository.findByRefId(refIdOrId);
    if (byRefId || !UUID_REGEX.test(refIdOrId)) {
      return byRefId;
    }

    return this.usersRepository.findById(refIdOrId);
  }

  private enrichUser(user: IUser): Promise<IUser> {
    return this.storageUrlEnricher.enrichFields(user, [...USER_MEDIA_FIELDS]);
  }

  private resolveRoleRecord(role: UserRole): Promise<RoleEntity | null> {
    return this.rolesRepository.findBySlug(role);
  }
}
