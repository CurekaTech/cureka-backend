import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
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

  /** Sync one category or promotional page (slug, ref id, or UUID) plus its live products. */
  @Post('catalog/collections/:idOrSlug/sync')
  @HttpCode(HttpStatus.OK)
  async syncCollection(@Param('idOrSlug') idOrSlug: string) {
    const resolved = await this.catalogSyncService.resolveCollectionSource(idOrSlug);
    const resourceId = resolved.kind === 'category' ? resolved.category.id : resolved.page.id;
    await this.catalogSyncService.syncCollection(resourceId);
    return {
      kind: resolved.kind,
      id: resourceId,
      synced: true,
    };
  }
}
