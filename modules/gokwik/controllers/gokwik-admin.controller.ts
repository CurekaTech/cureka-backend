import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { GokwikCatalogSyncService } from '../services/gokwik-catalog-sync.service';

@Controller('gokwik/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
export class GokwikAdminController {
  constructor(private readonly catalogSyncService: GokwikCatalogSyncService) {}

  @Post('catalog/backfill')
  @HttpCode(HttpStatus.OK)
  backfillCatalog() {
    return this.catalogSyncService.enqueueBackfill();
  }
}
