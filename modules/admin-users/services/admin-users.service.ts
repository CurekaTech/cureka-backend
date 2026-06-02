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
  generateRefId,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

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
      refId: generateRefId(dto.fullName),
      createdBy,
    });

    return mapAdminUserEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IAdminUser>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.adminUsersRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapAdminUserEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(id: string): Promise<IAdminUser> {
    const entity = await this.adminUsersRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`Admin user with id ${id} not found`);
    }
    return mapAdminUserEntityToResponse(entity);
  }

  async update(id: string, dto: UpdateAdminUserDto): Promise<IAdminUser> {
    const existing = await this.adminUsersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Admin user with id ${id} not found`);
    }

    const updated = await this.adminUsersRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`Admin user with id ${id} not found after update`);
    }

    return mapAdminUserEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.adminUsersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Admin user with id ${id} not found`);
    }
    await this.adminUsersRepository.softDelete(id);
  }
}
