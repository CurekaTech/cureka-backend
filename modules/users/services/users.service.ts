import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserEntity } from '../entities/user.entity';
import { UsersRepository } from '../repositories/users.repository';
import { CreateAdminCustomerDto, UpdateAdminCustomerDto, UpdateUserProfileAdminDto, UpdateUserProfileDto, UserListQueryDto } from '../dto/user.dto';
import { ICustomerDetail, ICustomerUserListItem, IUser } from '../interfaces/user.interface';
import {
  mapCustomerUserEntitiesToListItems,
  mapUserEntityToResponse,
  mapUserEntitiesToResponse,
} from '../mappers/user.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
  generateUniqueRefId,
} from '@packages/common';
import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { SessionCacheService } from '@modules/auth/services/session-cache.service';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { RolesRepository } from '@modules/roles/repositories/roles.repository';
import { RoleEntity } from '@modules/roles/entities/role.entity';
import { UserAddressesService } from './user-addresses.service';

const USER_MEDIA_FIELDS = ['profileImageUrl'] as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionCacheService: SessionCacheService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly rolesRepository: RolesRepository,
    private readonly userAddressesService: UserAddressesService,
  ) {}

  private mapProfileDtoToEntity(dto: UpdateUserProfileDto): Partial<UserEntity> {
    const { dateOfBirth, profileImageUrl, ...rest } = dto;
    const updateData: Partial<UserEntity> = { ...rest };

    if (dateOfBirth !== undefined) {
      updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : undefined;
    }
    if (profileImageUrl !== undefined) {
      updateData.profileImageUrl = this.storageUrlEnricher.persist(profileImageUrl);
    }

    return updateData;
  }

  // ── Auth-facing methods (called by AuthService) ─────────────────────────────

  async findById(id: string): Promise<IUser> {
    const entity = await this.usersRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return this.enrichUser(mapUserEntityToResponse(entity));
  }

  async findByMobileNumber(mobileNumber: string): Promise<IUser | null> {
    const entity = await this.usersRepository.findByMobileNumber(mobileNumber);
    return entity ? this.enrichUser(mapUserEntityToResponse(entity)) : null;
  }

  async createFromMobileNumber(mobileNumber: string): Promise<IUser> {
    const refId = await generateUniqueRefId('user', (id) =>
      this.usersRepository.existsByRefId(id),
    );

    const roleRecord = await this.resolveRoleRecord(UserRole.CUSTOMER);
    const entity = await this.usersRepository.create({
      mobileNumber,
      isGuest: false,
      isRegistered: false,
      status: UserStatus.ACTIVE,
      role: UserRole.CUSTOMER,
      roleId: roleRecord?.id,
      refId,
      createdBy: mobileNumber,
    });

    return this.enrichUser(mapUserEntityToResponse(entity));
  }

  /**
   * Admin-facing customer creation — used by the payment-request wizard to create
   * a new customer with full profile details in one step.
   */
  async createCustomer(dto: CreateAdminCustomerDto, createdBy: string): Promise<IUser> {
    const mobileTaken = await this.usersRepository.existsByMobileNumber(dto.mobileNumber);
    if (mobileTaken) {
      throw new ConflictException('A customer with this mobile number already exists');
    }

    if (dto.email) {
      const emailTaken = await this.usersRepository.existsByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException('A customer with this email already exists');
      }
    }

    const refId = await generateUniqueRefId('user', (id) =>
      this.usersRepository.existsByRefId(id),
    );

    const roleRecord = await this.resolveRoleRecord(UserRole.CUSTOMER);
    const entity = await this.usersRepository.create({
      refId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      mobileNumber: dto.mobileNumber,
      email: dto.email,
      role: UserRole.CUSTOMER,
      roleId: roleRecord?.id,
      isGuest: false,
      isRegistered: true,
      status: UserStatus.ACTIVE,
      createdBy,
      updatedBy: createdBy,
    });

    if (dto.addresses?.length) {
      await this.userAddressesService.createMany(entity.id, dto.addresses);
    }

    return this.enrichUser(mapUserEntityToResponse(entity));
  }

  async createGuestUser(): Promise<IUser> {
    const refId = await generateUniqueRefId('guest', (id) =>
      this.usersRepository.existsByRefId(id),
    );

    const roleRecord = await this.resolveRoleRecord(UserRole.CUSTOMER);
    const entity = await this.usersRepository.create({
      isGuest: true,
      isRegistered: false,
      status: UserStatus.ACTIVE,
      role: UserRole.CUSTOMER,
      roleId: roleRecord?.id,
      refId,
      createdBy: 'guest',
    });

    return this.enrichUser(mapUserEntityToResponse(entity));
  }

  async convertGuestToUser(userId: string, mobileNumber: string): Promise<IUser> {
    const existing = await this.usersRepository.findByMobileNumber(mobileNumber);
    if (existing && existing.id !== userId) {
      throw new ConflictException('Mobile number is already associated with another account');
    }

    const updated = await this.usersRepository.update(userId, {
      mobileNumber,
      isGuest: false,
      lastLoginAt: new Date(),
    });

    if (!updated) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    return this.enrichUser(mapUserEntityToResponse(updated));
  }

  async updateLastLoginAt(userId: string): Promise<void> {
    await this.usersRepository.updateLastLoginAt(userId);
  }

  async completeRegistration(
    userId: string,
    data: { firstName: string; lastName: string; email?: string },
  ): Promise<IUser> {
    if (data.email) {
      const emailTaken = await this.usersRepository.existsByEmail(data.email);
      const current = await this.usersRepository.findById(userId);
      if (emailTaken && current?.email !== data.email) {
        throw new ConflictException('Email is already in use');
      }
    }

    const updated = await this.usersRepository.update(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      isRegistered: true,
    });

    if (!updated) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    return this.enrichUser(mapUserEntityToResponse(updated));
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto): Promise<IUser> {
    const [emailTaken, mobileTaken] = await Promise.all([
      dto.email
        ? this.usersRepository.isEmailTakenByOther(dto.email, userId)
        : Promise.resolve(false),
      dto.mobileNumber
        ? this.usersRepository.isMobileTakenByOther(dto.mobileNumber, userId)
        : Promise.resolve(false),
    ]);

    if (emailTaken) {
      throw new ConflictException('Email is already in use');
    }

    if (mobileTaken) {
      throw new ConflictException('Mobile number is already in use');
    }

    const updated = await this.usersRepository.update(
      userId,
      this.mapProfileDtoToEntity(dto),
    );
    if (!updated) {
      throw new NotFoundException(`User with id ${userId} not found after update`);
    }

    await this.sessionCacheService.invalidateAllForUser(userId);

    return this.enrichUser(mapUserEntityToResponse(updated));
  }

  async setProfileImageUrl(userId: string, profileImageUrl: string): Promise<IUser> {
    const updated = await this.usersRepository.update(userId, {
      profileImageUrl: this.storageUrlEnricher.persist(profileImageUrl),
    });
    if (!updated) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    await this.sessionCacheService.invalidateAllForUser(userId);

    return this.enrichUser(mapUserEntityToResponse(updated));
  }

  // ── Admin-facing CRUD methods ────────────────────────────────────────────────

  async findAll(query: UserListQueryDto): Promise<PaginatedResult<IUser>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.usersRepository.findAllPaginated({
      ...paginationOptions,
      status: query.status,
    });
    const result = buildPaginatedResult(mapUserEntitiesToResponse(data), total, paginationOptions);
    return this.storageUrlEnricher.enrichPaginated(result, [...USER_MEDIA_FIELDS]);
  }

  async findCustomers(query: UserListQueryDto): Promise<PaginatedResult<ICustomerUserListItem>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.usersRepository.findCustomersPaginated({
      ...paginationOptions,
      status: query.status,
    });
    return buildPaginatedResult(
      mapCustomerUserEntitiesToListItems(data),
      total,
      paginationOptions,
    );
  }

  async findOne(refId: string): Promise<IUser> {
    const entity = await this.usersRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`User with refId ${refId} not found`);
    }
    return this.enrichUser(mapUserEntityToResponse(entity));
  }

  async findCustomerByRefId(refId: string): Promise<ICustomerDetail> {
    const entity = await this.usersRepository.findByRefId(refId);
    if (!entity || entity.role !== UserRole.CUSTOMER) {
      throw new NotFoundException(`Customer with refId ${refId} not found`);
    }

    const [user, addresses] = await Promise.all([
      this.enrichUser(mapUserEntityToResponse(entity)),
      this.userAddressesService.findAll(entity.id),
    ]);

    return { ...user, addresses };
  }

  async updateCustomer(refId: string, dto: UpdateAdminCustomerDto): Promise<IUser> {
    const existing = await this.usersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`User with refId ${refId} not found`);
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.usersRepository.existsByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    if (dto.mobileNumber && dto.mobileNumber !== existing.mobileNumber) {
      const mobileTaken = await this.usersRepository.isMobileTakenByOther(
        dto.mobileNumber,
        existing.id,
      );
      if (mobileTaken) {
        throw new ConflictException('Mobile number is already in use');
      }
    }

    const updated = await this.usersRepository.updateByRefId(
      refId,
      this.mapProfileDtoToEntity(dto),
    );
    if (!updated) {
      throw new NotFoundException(`User with refId ${refId} not found after update`);
    }

    if (dto.addresses !== undefined) {
      await this.userAddressesService.syncForUser(existing.id, dto.addresses);
    }

    return this.enrichUser(mapUserEntityToResponse(updated));
  }

  async update(refId: string, dto: UpdateUserProfileAdminDto): Promise<IUser> {
    const existing = await this.usersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`User with refId ${refId} not found`);
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.usersRepository.existsByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const updated = await this.usersRepository.updateByRefId(
      refId,
      this.mapProfileDtoToEntity(dto),
    );
    if (!updated) {
      throw new NotFoundException(`User with refId ${refId} not found after update`);
    }

    return this.enrichUser(mapUserEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.usersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`User with refId ${refId} not found`);
    }
    await this.usersRepository.softDeleteByRefId(refId);
  }

  private enrichUser(user: IUser): Promise<IUser> {
    return this.storageUrlEnricher.enrichFields(user, [...USER_MEDIA_FIELDS]);
  }

  private resolveRoleRecord(role: UserRole): Promise<RoleEntity | null> {
    return this.rolesRepository.findBySlug(role);
  }
}
