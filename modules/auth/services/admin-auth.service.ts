import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUsersService } from '@modules/admin-users/services/admin-users.service';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { AdminLoginDto } from '../dto/auth.dto';
import { IAdminAuthResponse } from '../interfaces/auth.interface';
import { IJwtPayload } from '@packages/auth';
import { comparePasswords } from '@packages/common';
import { mapAdminUserEntityToResponse } from '@modules/admin-users/mappers/admin-user.mapper';
import { mapRoleEntityToResponse } from '@modules/roles/mappers/role.mapper';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: AdminLoginDto): Promise<IAdminAuthResponse> {
    const entity = await this.adminUsersService.findByEmailWithPassword(dto.email);
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

    if (
      entity.role !== AdminUserRole.SUPER_ADMIN &&
      entity.roleRecord &&
      entity.roleRecord.status !== MasterStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Assigned role is inactive');
    }

    await this.adminUsersService.recordLogin(entity.id);

    const payload: IJwtPayload = {
      sub: entity.id,
      email: entity.email,
      role: entity.role,
      roleId: entity.roleId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: mapAdminUserEntityToResponse(entity),
      role: entity.roleRecord ? mapRoleEntityToResponse(entity.roleRecord) : undefined,
      permissions: this.resolvePermissionCodes(entity),
      menu: await this.getMenuForUser(entity.id),
    };
  }

  async me(adminUserId: string): Promise<Omit<IAdminAuthResponse, 'accessToken'>> {
    const entity = await this.adminUsersService.findEntityById(adminUserId);
    if (!entity || !entity.isActive) {
      throw new UnauthorizedException('Account is inactive or not found');
    }

    return {
      user: mapAdminUserEntityToResponse(entity),
      role: entity.roleRecord ? mapRoleEntityToResponse(entity.roleRecord) : undefined,
      permissions: this.resolvePermissionCodes(entity),
      menu: await this.getMenuForUser(entity.id),
    };
  }

  private resolvePermissionCodes(entity: {
    role: string;
    roleRecord?: {
      permissions?: { code: string; status: MasterStatus }[];
    };
  }): string[] {
    if (entity.role === AdminUserRole.SUPER_ADMIN) {
      return ['*'];
    }

    return (entity.roleRecord?.permissions ?? [])
      .filter((permission) => permission.status === MasterStatus.ACTIVE)
      .map((permission) => permission.code);
  }

  async getMenuForUser(adminUserId: string): Promise<MenuItem[]> {
    const entity = await this.adminUsersService.findEntityById(adminUserId);
    if (!entity || !entity.isActive) {
      throw new UnauthorizedException('Account is inactive or not found');
    }

    const permissions = this.resolvePermissionCodes(entity);
    const hasWildcard = permissions.includes('*');
    const userPermissionsSet = new Set(permissions);

    const filterItems = (items: MenuItem[]): MenuItem[] => {
      return items
        .map((item) => {
          let hasAccess = false;

          if (item.requiredPermissions && item.requiredPermissions.length > 0) {
            hasAccess = hasWildcard || item.requiredPermissions.some((p) => userPermissionsSet.has(p));
          } else {
            hasAccess = true;
          }

          if (item.subItems) {
            const filteredSub = filterItems(item.subItems);
            if (filteredSub.length > 0) {
              return {
                name: item.name,
                key: item.key,
                icon: item.icon,
                ...(item.href ? { href: item.href } : {}),
                subItems: filteredSub,
              };
            }
            return null;
          }

          return hasAccess
            ? {
                name: item.name,
                key: item.key,
                icon: item.icon,
                href: item.href,
              }
            : null;
        })
        .filter(Boolean) as MenuItem[];
    };

    return filterItems(MENU_HIERARCHY);
  }
}

export interface MenuItem {
  name: string;
  key: string;
  icon: string | null;
  href?: string;
  requiredPermissions?: string[];
  subItems?: MenuItem[];
}

export const MENU_HIERARCHY: MenuItem[] = [
  {
    name: 'Dashboard',
    key: 'dashboard',
    icon: 'Home',
    href: '/dashboard',
  },
  {
    name: 'Masters',
    key: 'masters',
    icon: 'CodeArrowIcon',
    subItems: [
      {
        name: 'Category Filters',
        key: 'masters-category-filters',
        icon: 'SlidersHorizontal',
        href: '/master/category-filters',
        requiredPermissions: ['category_filters.read', 'settings.read'],
      },
      {
        name: 'Categories',
        key: 'masters-category',
        icon: 'LayoutGrid',
        subItems: [
          {
            name: 'Category List',
            key: 'masters-category-list',
            icon: 'LayoutGrid',
            href: '/master/category',
            requiredPermissions: ['categories.read', 'settings.read'],
          },
          {
            name: 'Sub Category',
            key: 'masters-subcategory',
            icon: 'FolderKanban',
            href: '/master/sub-category',
            requiredPermissions: ['categories.read', 'settings.read'],
          },
          {
            name: 'Sub Sub Category',
            key: 'masters-subsubcategory',
            icon: 'GitBranch',
            href: '/master/sub-sub-category',
            requiredPermissions: ['categories.read', 'settings.read'],
          },
          {
            name: 'Sub Sub Sub Category',
            key: 'masters-subsubsubcategory',
            icon: 'ListTree',
            href: '/master/sub-sub-sub-category',
            requiredPermissions: ['categories.read', 'settings.read'],
          },
        ],
      },
      {
        name: 'Attributes',
        key: 'masters-attributes',
        icon: 'Layers',
        href: '/master/variant',
        requiredPermissions: ['attributes.read', 'settings.read'],
      },
      {
        name: 'Units',
        key: 'masters-units',
        icon: 'Ruler',
        href: '/master/units',
        requiredPermissions: ['units.read', 'settings.read'],
      },
      {
        name: 'Brands',
        key: 'masters-brands',
        icon: 'Award',
        href: '/master/brand',
        requiredPermissions: ['brands.read', 'settings.read'],
      },
      {
        name: 'Health Concern',
        key: 'masters-health-concern',
        icon: 'HeartPulse',
        href: '/master/health-concern',
        requiredPermissions: ['health_concerns.read', 'settings.read'],
      },
      {
        name: 'Wellness Goal',
        key: 'masters-wellness-goal',
        icon: 'Target',
        href: '/master/wellness-goal',
        requiredPermissions: ['wellness_goals.read', 'settings.read'],
      },
      {
        name: 'Manufacturers',
        key: 'masters-manufacturers',
        icon: 'Factory',
        href: '/master/manufacturer',
        requiredPermissions: ['manufacturers.read', 'settings.read'],
      },
      {
        name: 'Packers',
        key: 'masters-packers',
        icon: 'Boxes',
        href: '/master/packer',
        requiredPermissions: ['packers.read', 'settings.read'],
      },
      {
        name: 'Importers',
        key: 'masters-importers',
        icon: 'Download',
        href: '/master/importer',
        requiredPermissions: ['importers.read', 'settings.read'],
      },
      {
        name: 'Subscription Frequency',
        key: 'masters-subscription-frequency',
        icon: 'Calendar',
        href: '/master/subscription-frequency',
        requiredPermissions: ['subscription_frequencies.read', 'settings.read'],
      },
      {
        name: 'Coupon Codes',
        key: 'masters-coupon-codes',
        icon: 'Ticket',
        href: '/master/coupon-code',
        requiredPermissions: ['coupon_codes.read', 'settings.read'],
      },
    ],
  },
  {
    name: 'Products',
    key: 'products',
    icon: 'Package',
    subItems: [
      {
        name: 'Add Product',
        key: 'products-add',
        icon: 'Plus',
        href: '/products/add',
        requiredPermissions: ['products.create'],
      },
      {
        name: 'Product List',
        key: 'products-list-parent',
        icon: 'Package',
        subItems: [
          {
            name: 'All',
            key: 'products-list-all',
            icon: '',
            href: '/products',
            requiredPermissions: ['products.read'],
          },
          {
            name: 'Pending Review',
            key: 'products-list-pending',
            icon: '',
            href: '/products?status=pending_review',
            requiredPermissions: ['products.read'],
          },
          {
            name: 'Approved',
            key: 'products-list-approved',
            icon: '',
            href: '/products?status=approved',
            requiredPermissions: ['products.read'],
          },
          {
            name: 'Rejected',
            key: 'products-list-rejected',
            icon: '',
            href: '/products?status=rejected',
            requiredPermissions: ['products.read'],
          },
        ],
      },
      {
        name: 'Product Tags',
        key: 'products-tags',
        icon: 'Tag',
        href: '/master/product-tags',
        requiredPermissions: ['products.read', 'settings.read'],
      },
      {
        name: 'Product Informations',
        key: 'products-informations',
        icon: 'ListTree',
        href: '/master/product-information',
        requiredPermissions: ['products.read', 'settings.read'],
      },
      {
        name: 'Bulk Upload',
        key: 'products-bulk-upload',
        icon: 'Download',
        href: '#bulk-upload',
        requiredPermissions: ['products.create'],
      },
    ],
  },
  {
    name: 'Orders',
    key: 'orders',
    icon: 'ShoppingBag',
    subItems: [
      {
        name: 'Order Requests',
        key: 'orders-requests',
        icon: 'Receipt',
        href: '/order-requests',
        requiredPermissions: ['orders.read'],
      },
    ],
  },
  {
    name: 'CMS',
    key: 'cms',
    icon: 'Grid',
    subItems: [
      {
        name: 'Banners',
        key: 'cms-banners',
        icon: 'ImageIcon',
        href: '/master/banner',
        requiredPermissions: ['settings.read'],
      },
      {
        name: 'Home Section Indexing',
        key: 'cms-home-sections',
        icon: 'ListTree',
        href: '/cms/home-section-indexing',
        requiredPermissions: ['settings.read'],
      },
      {
        name: 'Header Indexing',
        key: 'cms-header-indexing',
        icon: 'SlidersHorizontal',
        href: '/master/category/header-indexing',
        requiredPermissions: ['settings.read'],
      },
      {
        name: 'Shop By Indexing',
        key: 'cms-shopby-indexing',
        icon: 'Target',
        href: '/master/category/shop-by-indexing',
        requiredPermissions: ['settings.read'],
      },
    ],
  },
  {
    name: 'Role Management',
    key: 'role-management',
    icon: 'ShieldCheck',
    subItems: [
      {
        name: 'Roles',
        key: 'roles-list',
        icon: 'ShieldCheck',
        href: '/roles-permissions/roles',
        requiredPermissions: ['roles.read'],
      },
      {
        name: 'Admin Users',
        key: 'admin-users-list',
        icon: 'Users',
        href: '/roles-permissions/admin-users',
        requiredPermissions: ['users.read'],
      },
    ],
  },
  {
    name: 'Audit Logs',
    key: 'audit-logs',
    icon: 'History',
    subItems: [
      {
        name: 'Activity Logs',
        key: 'activity-logs-list',
        icon: 'History',
        href: '#activity-logs',
        requiredPermissions: ['settings.read'],
      },
    ],
  },
  {
    name: 'System Settings',
    key: 'system-settings',
    icon: 'Settings',
    subItems: [
      {
        name: 'Admin Settings',
        key: 'admin-settings-view',
        icon: 'SlidersHorizontal',
        href: '/admin-settings',
        requiredPermissions: ['settings.read'],
      },
    ],
  },
];
