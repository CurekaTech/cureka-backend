import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUsersRepository } from '../repositories/admin-users.repository';
import { CreateAdminUserDto, UpdateAdminUserDto, LoginAdminUserDto } from '../dto/admin-user.dto';
import { IAdminUser, ILoginResponse } from '../interfaces/admin-user.interface';
import {
  mapAdminUserEntityToResponse,
  mapAdminUserEntitiesToResponse,
} from '../mappers/admin-user.mapper';
import {
  hashPassword,
  comparePasswords,
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { IJwtPayload } from '@common/interfaces/jwt-payload.interface';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly adminUsersRepository: AdminUsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async create(dto: CreateAdminUserDto): Promise<IAdminUser> {
    const exists = await this.adminUsersRepository.existsByEmail(dto.email);
    if (exists) {
      throw new ConflictException('An admin user with this email already exists');
    }

    const hashedPassword = await hashPassword(dto.password);
    const entity = await this.adminUsersRepository.create({
      ...dto,
      password: hashedPassword,
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

  async login(dto: LoginAdminUserDto): Promise<ILoginResponse> {
    const entity = await this.adminUsersRepository.findByEmailWithPassword(dto.email);
    if (!entity) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await comparePasswords(dto.password, entity.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!entity.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    await this.adminUsersRepository.updateLastLoginAt(entity.id);

    const payload: IJwtPayload = {
      sub: entity.id,
      email: entity.email,
      role: entity.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: mapAdminUserEntityToResponse(entity),
    };
  }
}
