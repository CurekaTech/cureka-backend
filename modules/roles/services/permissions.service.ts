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

  async findGroupedByModule(): Promise<any[]> {
    const permissions = mapPermissionEntitiesToResponse(await this.permissionsRepository.findAll());

    const getPerms = (moduleName: string, actions?: string[]): IPermission[] => {
      return permissions.filter((p) => {
        if (p.module !== moduleName) return false;
        if (actions && !actions.includes(p.action)) return false;
        return true;
      });
    };

    return [
      {
        name: 'Dashboard',
        key: 'dashboard',
        permissions: getPerms('dashboard'),
      },
      {
        name: 'Reports',
        key: 'reports',
        subItems: [
          {
            name: 'Sales & Revenue',
            key: 'reports-sales-revenue',
            permissions: getPerms('reports'),
          },
          {
            name: 'Orders',
            key: 'reports-orders',
            permissions: getPerms('reports'),
          },
          {
            name: 'Product Performance',
            key: 'reports-product-performance',
            permissions: getPerms('reports'),
          },
          {
            name: 'Inventory & Stock',
            key: 'reports-inventory-stock',
            permissions: getPerms('reports'),
          },
          {
            name: 'Customers',
            key: 'reports-customers',
            permissions: getPerms('reports'),
          },
          {
            name: 'Payments',
            key: 'reports-payments',
            permissions: getPerms('reports'),
          },
          {
            name: 'Returns & Refunds',
            key: 'reports-returns-refunds',
            permissions: getPerms('reports'),
          },
          {
            name: 'Coupons & Promotions',
            key: 'reports-coupons',
            permissions: getPerms('reports'),
          },
        ],
      },
      {
        name: 'Masters',
        key: 'masters',
        subItems: [
          {
            name: 'Category Filters',
            key: 'masters-category-filters',
            permissions: getPerms('category_filters'),
          },
          {
            name: 'Categories',
            key: 'masters-category',
            subItems: [
              {
                name: 'Category List',
                key: 'masters-category-list',
                permissions: getPerms('categories'),
              },
              {
                name: 'Sub Category',
                key: 'masters-subcategory',
                permissions: getPerms('subcategories'),
              },
              {
                name: 'Sub Sub Category',
                key: 'masters-subsubcategory',
                permissions: getPerms('subsubcategories'),
              },
              {
                name: 'Sub Sub Sub Category',
                key: 'masters-subsubsubcategory',
                permissions: getPerms('subsubsubcategories'),
              },
            ],
          },
          {
            name: 'Attributes',
            key: 'masters-attributes',
            permissions: getPerms('attributes'),
          },
          {
            name: 'Units',
            key: 'masters-units',
            permissions: getPerms('units'),
          },
          {
            name: 'Brands',
            key: 'masters-brands',
            permissions: getPerms('brands'),
          },
          {
            name: 'Health Concern',
            key: 'masters-health-concern',
            permissions: getPerms('health_concerns'),
          },
          {
            name: 'Wellness Goal',
            key: 'masters-wellness-goal',
            permissions: getPerms('wellness_goals'),
          },
          {
            name: 'Manufacturers',
            key: 'masters-manufacturers',
            permissions: getPerms('manufacturers'),
          },
          {
            name: 'Packers',
            key: 'masters-packers',
            permissions: getPerms('packers'),
          },
          {
            name: 'Importers',
            key: 'masters-importers',
            permissions: getPerms('importers'),
          },
          {
            name: 'Subscription Frequency',
            key: 'masters-subscription-frequency',
            permissions: getPerms('subscription_frequencies'),
          },
          {
            name: 'Coupon Codes',
            key: 'masters-coupon-codes',
            permissions: getPerms('coupon_codes'),
          },
        ],
      },
      {
        name: 'Products',
        key: 'products',
        subItems: [
          {
            name: 'Add Product',
            key: 'products-add',
            permissions: getPerms('products', ['create']),
          },
          {
            name: 'Product List',
            key: 'products-list-parent',
            subItems: [
              {
                name: 'All',
                key: 'products-list-all',
                permissions: getPerms('products', ['read']),
              },
              {
                name: 'Pending Review',
                key: 'products-list-pending',
                permissions: getPerms('products', ['read']),
              },
              {
                name: 'Approved',
                key: 'products-list-approved',
                permissions: getPerms('products', ['read', 'approve']),
              },
              {
                name: 'Rejected',
                key: 'products-list-rejected',
                permissions: getPerms('products', ['read', 'reject']),
              },
            ],
          },
          {
            name: 'Product Tags',
            key: 'products-tags',
            permissions: getPerms('product_tags'),
          },
          {
            name: 'Product Informations',
            key: 'products-informations',
            permissions: getPerms('product_informations'),
          },
          {
            name: 'Media Gallery',
            key: 'products-media-gallery',
            permissions: getPerms('gallery', ['create', 'read', 'delete']),
          },
          {
            name: 'Product Reviews',
            key: 'products-reviews',
            permissions: getPerms('product_reviews', ['read', 'update', 'delete']),
          },
          {
            name: 'Bulk Upload',
            key: 'products-bulk-upload',
            permissions: getPerms('products', ['create']),
          },
        ],
      },
      {
        name: 'Orders',
        key: 'orders',
        subItems: [
          {
            name: 'Order Requests',
            key: 'orders-requests',
            permissions: getPerms('orders'),
          },
        ],
      },
      {
        name: 'Subscription & Membership',
        key: 'subscriptions',
        subItems: [
          {
            name: 'Membership Plans',
            key: 'subscriptions-membership-plans',
            permissions: getPerms('membership_plans'),
          },
          {
            name: 'User Memberships',
            key: 'subscriptions-user-memberships',
            permissions: getPerms('user_memberships', ['read']),
          },
          {
            name: 'Membership Payments',
            key: 'subscriptions-membership-payments',
            permissions: getPerms('membership_payments', ['read']),
          },
          {
            name: 'Product Subscriptions',
            key: 'subscriptions-product-subscriptions',
            permissions: getPerms('user_product_subscriptions', ['read']),
          },
          {
            name: 'Subscription Payments',
            key: 'subscriptions-product-payments',
            permissions: getPerms('subscription_payments', ['read']),
          },
          {
            name: 'Failed Renewals',
            key: 'subscriptions-failed-renewals',
            permissions: getPerms('subscription_payments', ['read']),
          },
        ],
      },
      {
        name: 'CMS',
        key: 'cms',
        subItems: [
          {
            name: 'Banners',
            key: 'cms-banners',
            permissions: getPerms('banners'),
          },
          {
            name: 'Watch & Shop',
            key: 'cms-watch-and-shop',
            permissions: getPerms('watch_and_shop'),
          },
          {
            name: 'Expert Talks & Podcasts',
            key: 'cms-expert-talks',
            permissions: getPerms('expert_talks'),
          },
          {
            name: 'Testimonials',
            key: 'cms-testimonials',
            permissions: getPerms('testimonials'),
          },
          {
            name: 'Home Section Indexing',
            key: 'cms-home-sections',
            permissions: getPerms('home_sections'),
          },
          {
            name: 'Header Indexing',
            key: 'cms-header-indexing',
            permissions: getPerms('header_indexing'),
          },
          {
            name: 'Shop By Indexing',
            key: 'cms-shopby-indexing',
            permissions: getPerms('shop_by_indexing'),
          },
          {
            name: 'Best Sellers Indexing',
            key: 'cms-best-sellers-indexing',
            permissions: getPerms('best_sellers'),
          },
          {
            name: 'Pages',
            key: 'cms-pages',
            permissions: getPerms('cms_pages'),
            subItems: [
              {
                name: 'About Cureka',
                key: 'cms-pages-about-cureka',
                permissions: getPerms('cms_pages'),
              },
              {
                name: 'Privacy Policy',
                key: 'cms-pages-privacy-policy',
                permissions: getPerms('cms_pages'),
              },
              {
                name: 'Terms & Conditions',
                key: 'cms-pages-terms-and-conditions',
                permissions: getPerms('cms_pages'),
              },
              {
                name: 'Returns & Refunds',
                key: 'cms-pages-returns-refunds',
                permissions: getPerms('cms_pages'),
              },
              {
                name: 'Shipping Policy',
                key: 'cms-pages-shipping-policy',
                permissions: getPerms('cms_pages'),
              },
            ],
          },
        ],
      },
      {
        name: 'Role Management',
        key: 'role-management',
        subItems: [
          {
            name: 'Roles',
            key: 'roles-list',
            permissions: getPerms('roles'),
          },
          {
            name: 'Admin Users',
            key: 'admin-users-list',
            permissions: getPerms('admin_users'),
          },
        ],
      },
      {
        name: 'Audit Logs',
        key: 'audit-logs',
        subItems: [
          {
            name: 'Activity Logs',
            key: 'activity-logs-list',
            permissions: getPerms('audit_logs'),
          },
        ],
      },
      {
        name: 'Settings',
        key: 'settings',
        subItems: [
          {
            name: 'Cart Charges',
            key: 'cart-charges-view',
            permissions: getPerms('settings'),
          },
          {
            name: 'Payment Methods',
            key: 'payment-methods-view',
            permissions: getPerms('settings'),
          },
          {
            name: 'Logistic Partners',
            key: 'logistic-partners-view',
            permissions: getPerms('settings'),
          },
        ],
      },
    ];
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
