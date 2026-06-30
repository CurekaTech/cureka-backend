import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  UpdatePermissionStatusDto,
} from '../dto/permission.dto';
import { IPermission } from '../interfaces/permission.interface';
import {
  mapPermissionEntitiesToResponse,
  mapPermissionEntityToResponse,
} from '../mappers/permission.mapper';
import { PermissionsRepository } from '../repositories/permissions.repository';

export interface IPermissionsByModule {
  module: string;
  permissions: IPermission[];
}

@Injectable()
export class PermissionsService {
  constructor(private readonly permissionsRepository: PermissionsRepository) {}

  async create(dto: CreatePermissionDto, createdBy: string): Promise<IPermission> {
    if (await this.permissionsRepository.existsByCode(dto.code)) {
      throw new ConflictException('A permission with this code already exists');
    }

    const entity = await this.permissionsRepository.create({
      code: dto.code,
      name: dto.name,
      module: dto.module,
      action: dto.action,
      description: dto.description,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.permissionsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    return mapPermissionEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IPermission>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.permissionsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapPermissionEntitiesToResponse(data), total, paginationOptions);
  }

  async findGroupedByModule(): Promise<IPermissionsByModule[]> {
    const permissions = mapPermissionEntitiesToResponse(await this.permissionsRepository.findAll());
    const grouped = new Map<string, IPermission[]>();

    for (const permission of permissions) {
      grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission]);
    }

    return [...grouped.entries()].map(([module, modulePermissions]) => ({
      module,
      permissions: modulePermissions,
    }));
  }

  async findOne(refId: string): Promise<IPermission> {
    const entity = await this.permissionsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Permission with refId ${refId} not found`);
    }
    return mapPermissionEntityToResponse(entity);
  }

  async update(
    refId: string,
    dto: UpdatePermissionDto,
    updatedBy: string,
  ): Promise<IPermission> {
    const existing = await this.permissionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Permission with refId ${refId} not found`);
    }

    if (dto.code && (await this.permissionsRepository.existsByCode(dto.code, refId))) {
      throw new ConflictException('A permission with this code already exists');
    }

    const updated = await this.permissionsRepository.updateByRefId(refId, {
      ...dto,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Permission with refId ${refId} not found after update`);
    }

    return mapPermissionEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdatePermissionStatusDto,
    updatedBy: string,
  ): Promise<IPermission> {
    const existing = await this.permissionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Permission with refId ${refId} not found`);
    }

    const updated = await this.permissionsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Permission with refId ${refId} not found after status update`);
    }

    return mapPermissionEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.permissionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Permission with refId ${refId} not found`);
    }
    await this.permissionsRepository.softDeleteByRefId(refId);
  }
}
