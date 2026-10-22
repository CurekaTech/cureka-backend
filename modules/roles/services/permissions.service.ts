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
import { AuditService } from '@modules/master/services/audit.service';
import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { MENU_HIERARCHY, type MenuItem } from '@modules/auth/constants/admin-menu.constants';
import { MENU_PERMISSION_SCOPE_BY_KEY } from '../constants/menu-permission-scopes.constants';

export interface IPermissionsByModule {
  module: string;
  permissions: IPermission[];
}

export interface PermissionMenuNode {
  name: string;
  key: string;
  permissions?: IPermission[];
  subItems?: PermissionMenuNode[];
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly auditService: AuditService,
  ) {}

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

    const permission = mapPermissionEntityToResponse(entity);
    await this.auditService.recordWrite({
      entityType: AuditEntityType.PERMISSION,
      entityId: entity.id,
      entityRefId: entity.refId,
      action: 'created',
      performedBy: createdBy,
      details: { code: entity.code },
    });
    return permission;
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IPermission>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.permissionsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapPermissionEntitiesToResponse(data), total, paginationOptions);
  }

  /**
   * Role matrix tree. Built from MENU_HIERARCHY so the matrix shows the same
   * rows, keys, and order as the sidebar. Every row lists only its own codes.
   */
  async findGroupedByModule(): Promise<PermissionMenuNode[]> {
    const permissions = mapPermissionEntitiesToResponse(await this.permissionsRepository.findAll());

    const getPerms = (moduleName: string, actions?: readonly string[]): IPermission[] =>
      permissions.filter(
        (permission) =>
          permission.module === moduleName && (!actions || actions.includes(permission.action)),
      );

    const rowPermissions = (item: MenuItem): IPermission[] => {
      const scoped = MENU_PERMISSION_SCOPE_BY_KEY.get(item.key);
      if (scoped) return getPerms(scoped.module);
      if (item.subItems?.length) return [];
      if (item.permission) return getPerms(item.permission.module, item.permission.actions);
      const required = item.requiredPermissions?.[0];
      if (!required) return [];
      return getPerms(required.slice(0, required.lastIndexOf('.')));
    };

    const toNode = (item: MenuItem): PermissionMenuNode | null => {
      const subItems = (item.subItems ?? [])
        .map(toNode)
        .filter((node): node is PermissionMenuNode => node !== null);
      const own = rowPermissions(item);
      if (own.length === 0 && subItems.length === 0) return null;
      return {
        name: item.name,
        key: item.key,
        ...(own.length > 0 ? { permissions: own } : {}),
        ...(subItems.length > 0 ? { subItems } : {}),
      };
    };

    return MENU_HIERARCHY.map(toNode).filter((node): node is PermissionMenuNode => node !== null);
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

    const permission = mapPermissionEntityToResponse(updated);
    await this.auditService.recordWrite({
      entityType: AuditEntityType.PERMISSION,
      entityId: updated.id,
      entityRefId: updated.refId,
      action: 'updated',
      performedBy: updatedBy,
      details: { fields: Object.keys(dto) },
    });
    return permission;
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

    const permission = mapPermissionEntityToResponse(updated);
    await this.auditService.recordWrite({
      entityType: AuditEntityType.PERMISSION,
      entityId: updated.id,
      entityRefId: updated.refId,
      action: 'status_changed',
      performedBy: updatedBy,
      details: { from: existing.status, to: dto.status },
    });
    return permission;
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.permissionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Permission with refId ${refId} not found`);
    }
    await this.permissionsRepository.softDeleteByRefId(refId);
    await this.auditService.recordWrite({
      entityType: AuditEntityType.PERMISSION,
      entityId: existing.id,
      entityRefId: existing.refId,
      action: 'deleted',
    });
  }
}
