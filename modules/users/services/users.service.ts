import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { IUser } from '../interfaces/user.interface';
import { mapUserEntityToResponse, mapUserEntitiesToResponse } from '../mappers/user.mapper';
import {
  hashPassword,
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto): Promise<IUser> {
    const exists = await this.usersRepository.existsByEmail(dto.email);
    if (exists) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await hashPassword(dto.password);
    const entity = await this.usersRepository.create({
      ...dto,
      dob: dto.dob ? new Date(dto.dob) : undefined,
      password: hashedPassword,
    });

    return mapUserEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IUser>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.usersRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapUserEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(id: string): Promise<IUser> {
    const entity = await this.usersRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return mapUserEntityToResponse(entity);
  }

  async update(id: string, dto: UpdateUserDto): Promise<IUser> {
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const updateData = {
      ...dto,
      dob: dto.dob ? new Date(dto.dob) : undefined,
    };

    const updated = await this.usersRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException(`User with id ${id} not found after update`);
    }

    return mapUserEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    await this.usersRepository.softDelete(id);
  }
}
