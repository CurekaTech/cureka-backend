import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { PermissionsController } from './controllers/permissions.controller';
import { RolesController } from './controllers/roles.controller';
import { PermissionsRepository } from './repositories/permissions.repository';
import { RolesRepository } from './repositories/roles.repository';
import { PermissionsService } from './services/permissions.service';
import { RolesService } from './services/roles.service';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, PermissionEntity, AdminUserEntity])],
  controllers: [RolesController, PermissionsController],
  providers: [
    RolesService,
    PermissionsService,
    RolesRepository,
    PermissionsRepository,
    PermissionsGuard,
  ],
  exports: [
    RolesService,
    PermissionsService,
    RolesRepository,
    PermissionsRepository,
    PermissionsGuard,
  ],
})
export class RolesModule {}
