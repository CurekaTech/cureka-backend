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
  generateUniqueRefId,
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
      refId: await generateUniqueRefId(dto.fullName, (refId) =>
        this.usersRepository.existsByRefId(refId),
      ),
      createdBy: dto.email,
    });

    return mapUserEntityToResponse(entity);
  }

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

  async update(refId: string, dto: UpdateUserDto): Promise<IUser> {
    const existing = await this.usersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`User with refId ${refId} not found`);
    }

    const updateData = {
      ...dto,
      dob: dto.dob ? new Date(dto.dob) : undefined,
    };

    const updated = await this.usersRepository.updateByRefId(refId, updateData);
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
