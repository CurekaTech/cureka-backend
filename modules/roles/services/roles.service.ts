import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterListQueryDto } from '@modules/master/dto/master-list-query.dto';
import { MasterListStatusFilter } from '@modules/master/enums/master-list-status-filter.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { CreateRoleDto, UpdateRoleDto, UpdateRoleStatusDto } from '../dto/role.dto';
import { IRole } from '../interfaces/role.interface';
import { mapRoleEntitiesToResponse, mapRoleEntityToResponse } from '../mappers/role.mapper';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { RolesRepository } from '../repositories/roles.repository';

const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsRepository: PermissionsRepository,
  ) {}

  async create(dto: CreateRoleDto, createdBy: string): Promise<IRole> {
    const slug = toSlug(dto.slug ?? dto.name);
    if (!slug) {
      throw new ConflictException('Role slug is required');
    }

    if (await this.rolesRepository.existsBySlug(slug)) {
      throw new ConflictException('A role with this slug already exists');
    }

    const permissions = await this.resolvePermissions(dto.permissionRefIds ?? []);
    const entity = await this.rolesRepository.create({
      name: dto.name,
      slug,
      description: dto.description,
      status: dto.status ?? MasterStatus.ACTIVE,
      permissions,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.rolesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapRoleEntityToResponse(entity);
  }

  async findAll(query: MasterListQueryDto): Promise<PaginatedResult<IRole>> {
    const paginationOptions = buildPaginationOptions(query);
    const status =
      query.status && query.status !== MasterListStatusFilter.ALL
        ? (query.status as MasterStatus)
        : undefined;
    const { data, total } = await this.rolesRepository.findAllPaginated({
      ...paginationOptions,
      status,
    });
    return buildPaginatedResult(mapRoleEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<IRole> {
    const entity = await this.rolesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Role with refId ${refId} not found`);
    }
    return mapRoleEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateRoleDto, updatedBy: string): Promise<IRole> {
    const existing = await this.rolesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Role with refId ${refId} not found`);
    }

    const nextSlug = dto.slug || dto.name ? toSlug(dto.slug ?? dto.name ?? existing.slug) : undefined;
    if (nextSlug && (await this.rolesRepository.existsBySlug(nextSlug, refId))) {
      throw new ConflictException('A role with this slug already exists');
    }

    const permissions = dto.permissionRefIds
      ? await this.resolvePermissions(dto.permissionRefIds)
      : existing.permissions;

    const updated = await this.rolesRepository.updateByRefId(refId, {
      name: dto.name ?? existing.name,
      slug: nextSlug ?? existing.slug,
      description: dto.description ?? existing.description,
      status: dto.status ?? existing.status,
      permissions,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Role with refId ${refId} not found after update`);
    }

    return mapRoleEntityToResponse(updated);
  }

  async updateStatus(refId: string, dto: UpdateRoleStatusDto, updatedBy: string): Promise<IRole> {
    const existing = await this.rolesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Role with refId ${refId} not found`);
    }

    const updated = await this.rolesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Role with refId ${refId} not found after status update`);
    }

    return mapRoleEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.rolesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Role with refId ${refId} not found`);
    }

    if (existing.isSystem) {
      throw new ConflictException('System roles cannot be deleted');
    }

    await this.rolesRepository.softDeleteByRefId(refId);
  }

  private async resolvePermissions(permissionRefIds: string[]) {
    const permissions = await this.permissionsRepository.findByRefIds(permissionRefIds);
    if (permissions.length !== permissionRefIds.length) {
      const found = new Set(permissions.map((permission) => permission.refId));
      const missing = permissionRefIds.filter((refId) => !found.has(refId));
      throw new NotFoundException(`Permission refId(s) not found: ${missing.join(', ')}`);
    }

    return permissions;
  }
}
