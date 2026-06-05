import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { UpdateUserProfileAdminDto, UpdateUserProfileDto } from '../dto/user.dto';
import { IUser } from '../interfaces/user.interface';
import { mapUserEntityToResponse, mapUserEntitiesToResponse } from '../mappers/user.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
  generateUniqueRefId,
} from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
import { UserStatus } from '../enums/user-status.enum';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  // ── Auth-facing methods (called by AuthService) ─────────────────────────────

  async findById(id: string): Promise<IUser> {
    const entity = await this.usersRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return mapUserEntityToResponse(entity);
  }

  async findByMobileNumber(mobileNumber: string): Promise<IUser | null> {
    const entity = await this.usersRepository.findByMobileNumber(mobileNumber);
    return entity ? mapUserEntityToResponse(entity) : null;
  }

  async createFromMobileNumber(mobileNumber: string): Promise<IUser> {
    const refId = await generateUniqueRefId('user', (id) =>
      this.usersRepository.existsByRefId(id),
    );

    const entity = await this.usersRepository.create({
      mobileNumber,
      isGuest: false,
      isRegistered: false,
      status: UserStatus.ACTIVE,
      refId,
      createdBy: mobileNumber,
    });

    return mapUserEntityToResponse(entity);
  }

  async createGuestUser(): Promise<IUser> {
    const refId = await generateUniqueRefId('guest', (id) =>
      this.usersRepository.existsByRefId(id),
    );

    const entity = await this.usersRepository.create({
      isGuest: true,
      isRegistered: false,
      status: UserStatus.ACTIVE,
      refId,
      createdBy: 'guest',
    });

    return mapUserEntityToResponse(entity);
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

    return mapUserEntityToResponse(updated);
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

    return mapUserEntityToResponse(updated);
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto): Promise<IUser> {
    const existing = await this.usersRepository.findById(userId);
    if (!existing) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.usersRepository.existsByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const updated = await this.usersRepository.update(userId, dto);
    if (!updated) {
      throw new NotFoundException(`User with id ${userId} not found after update`);
    }

    return mapUserEntityToResponse(updated);
  }

  // ── Admin-facing CRUD methods ────────────────────────────────────────────────

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IUser>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.usersRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapUserEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<IUser> {
    const entity = await this.usersRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`User with refId ${refId} not found`);
    }
    return mapUserEntityToResponse(entity);
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

    const updated = await this.usersRepository.updateByRefId(refId, dto);
    if (!updated) {
      throw new NotFoundException(`User with refId ${refId} not found after update`);
    }

    return mapUserEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.usersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`User with refId ${refId} not found`);
    }
    await this.usersRepository.softDeleteByRefId(refId);
  }
}

