import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class AdminUsersService {
  constructor(private readonly adminUsersRepository: AdminUsersRepository) {}

  async create(dto: CreateAdminUserDto, createdBy: string): Promise<IAdminUser> {
    const exists = await this.adminUsersRepository.existsByEmail(dto.email);
    if (exists) {
      throw new ConflictException('An admin user with this email already exists');
    }

    const hashedPassword = await hashPassword(dto.password);
    const entity = await this.adminUsersRepository.create({
      ...dto,
      password: hashedPassword,
      refId: await generateUniqueRefId(dto.fullName, (refId) =>
        this.adminUsersRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapAdminUserEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IAdminUser>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.adminUsersRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapAdminUserEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<IAdminUser> {
    const entity = await this.adminUsersRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Admin user with refId ${refId} not found`);
    }
    return mapAdminUserEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateAdminUserDto): Promise<IAdminUser> {
    const existing = await this.adminUsersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Admin user with refId ${refId} not found`);
    }

    const updated = await this.adminUsersRepository.updateByRefId(refId, dto);
    if (!updated) {
      throw new NotFoundException(`Admin user with refId ${refId} not found after update`);
    }

    return mapAdminUserEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.adminUsersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Admin user with refId ${refId} not found`);
    }
    await this.adminUsersRepository.softDeleteByRefId(refId);
  }

  /** Used by auth module — never expose password via public API responses. */
  async findByEmailWithPassword(email: string) {
    return this.adminUsersRepository.findByEmailWithPassword(email);
  }

  async recordLogin(id: string): Promise<void> {
    await this.adminUsersRepository.updateLastLoginAt(id);
  }
}
