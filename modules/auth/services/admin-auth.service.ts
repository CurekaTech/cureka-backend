import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly jwtService: JwtService,
  ) { }

  async login(dto: AdminLoginDto): Promise<IAdminAuthResponse> {
    const entity = await this.adminUsersService.findByEmailWithPassword(dto.email);
    if (!entity) {
      this.logger.warn({ email: dto.email }, 'Admin login failed: user not found');
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await comparePasswords(dto.password, entity.password);
    if (!passwordMatches) {
      this.logger.warn({ email: dto.email }, 'Admin login failed: invalid password');
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!entity.isActive) {
      this.logger.warn({ email: dto.email }, 'Admin login failed: account inactive');
      throw new UnauthorizedException('Account is inactive');
    }

    if (
      entity.role !== AdminUserRole.SUPER_ADMIN &&
      entity.roleRecord &&
      entity.roleRecord.status !== MasterStatus.ACTIVE
    ) {
      this.logger.warn({ email: dto.email }, 'Admin login failed: assigned role inactive');
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

    this.logger.log({ email: entity.email, role: entity.role }, 'Admin login success');

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
        requiredPermissions: ['category_filters.read'],
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
            requiredPermissions: ['categories.read'],
          },
          {
            name: 'Sub Category',
            key: 'masters-subcategory',
            icon: 'FolderKanban',
            href: '/master/sub-category',
            requiredPermissions: ['subcategories.read'],
          },
          {
            name: 'Sub Sub Category',
            key: 'masters-subsubcategory',
            icon: 'GitBranch',
            href: '/master/sub-sub-category',
            requiredPermissions: ['subsubcategories.read'],
          },
          {
            name: 'Sub Sub Sub Category',
            key: 'masters-subsubsubcategory',
            icon: 'ListTree',
            href: '/master/sub-sub-sub-category',
            requiredPermissions: ['subsubsubcategories.read'],
          },
        ],
      },
      {
        name: 'Attributes',
        key: 'masters-attributes',
        icon: 'Layers',
        href: '/master/variant',
        requiredPermissions: ['attributes.read'],
      },
      {
        name: 'Units',
        key: 'masters-units',
        icon: 'Ruler',
        href: '/master/units',
        requiredPermissions: ['units.read'],
      },
      {
        name: 'Brands',
        key: 'masters-brands',
        icon: 'Award',
        href: '/master/brand',
        requiredPermissions: ['brands.read'],
      },
      {
        key: "country-of-origin",
        name: "Country of Origin",
        icon: "globe",
        href: "/master/country",
      },

      {
        name: 'Health Concern',
        key: 'masters-health-concern',
        icon: 'HeartPulse',
        href: '/master/health-concern',
        requiredPermissions: ['health_concerns.read'],
      },
      {
        name: 'Wellness Goal',
        key: 'masters-wellness-goal',
        icon: 'Target',
        href: '/master/wellness-goal',
        requiredPermissions: ['wellness_goals.read'],
      },
      {
        name: 'Manufacturers',
        key: 'masters-manufacturers',
        icon: 'Factory',
        href: '/master/manufacturer',
        requiredPermissions: ['manufacturers.read'],
      },
      {
        name: 'Packers',
        key: 'masters-packers',
        icon: 'Boxes',
        href: '/master/packer',
        requiredPermissions: ['packers.read'],
      },
      {
        name: 'Importers',
        key: 'masters-importers',
        icon: 'Download',
        href: '/master/importer',
        requiredPermissions: ['importers.read'],
      },
      {
        name: 'Subscription Frequency',
        key: 'masters-subscription-frequency',
        icon: 'Calendar',
        href: '/master/subscription-frequency',
        requiredPermissions: ['subscription_frequencies.read'],
      },
      {
        name: 'Coupon Codes',
        key: 'masters-coupon-codes',
        icon: 'Ticket',
        href: '/master/coupon-code',
        requiredPermissions: ['coupon_codes.read'],
      },
    ],
  },
  {
    name: 'Users',
    key: 'users',
    icon: 'Users',
    subItems: [
      {
        name: 'Active',
        key: 'active-users',
        icon: 'LayoutGrid',
        href: '/users?status=active',
        requiredPermissions: ['users.view'],
      },
      {
        name: 'Inactive',
        key: 'inactive-users',
        icon: 'LayoutGrid',
        href: '/users?status=inactive',
        requiredPermissions: ['users.view'],
      }
    ],
  },
  {
    name: 'Vendors',
    key: 'vendors',
    icon: 'CirclePile',
    subItems: [
      {
        name: 'Add Vendor',
        key: 'add-vendor',
        icon: 'Plus',
        href: '/vendors/add',
        requiredPermissions: ['vendors.create'],
      },
      {
        name: 'Vendor List',
        key: 'vendor-list',
        icon: 'LayoutGrid',
        href: '/vendors',
        requiredPermissions: ['vendors.read'],
      }
    ]
  },
  {
    name: 'Products',
    key: 'products',
    icon: 'Package',
    subItems: [
      // {
      //   name: 'Add Product',
      //   key: 'products-add',
      //   icon: 'Plus',
      //   href: '/products/add',
      //   requiredPermissions: ['products.create'],
      // },
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
            name: 'Active',
            key: 'products-list-approved',
            icon: '',
            href: '/products?status=published',
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
            name: 'Rejected',
            key: 'products-list-rejected',
            icon: '',
            href: '/products?status=rejected',
            requiredPermissions: ['products.read'],
          },
        ],
      },
      {
        name: 'Bundle Products',
        key: 'bundle-product-list',
        icon: 'Package',
        subItems: [
          {
            name: 'All',
            key: 'bundle-products-list-all',
            icon: '',
            href: '/products/bundles',
            requiredPermissions: ['bundle-products.read'],
          },
          {
            name: 'Active',
            key: 'bundle-products-list-approved',
            icon: '',
            href: '/products/bundles?status=published',
            requiredPermissions: ['bundle-products.read'],
          },
          {
            name: 'Pending Review',
            key: 'bundle-products-list-pending',
            icon: '',
            href: '/products/bundles?status=pending_review',
            requiredPermissions: ['bundle-products.read'],
          },
          {
            name: 'Rejected',
            key: 'bundle-products-list-rejected',
            icon: '',
            href: '/products/bundles?status=rejected',
            requiredPermissions: ['bundle-products.read'],
          },
        ],
      },
      {
        name: 'Product Tags',
        key: 'products-tags',
        icon: 'Tag',
        href: '/master/product-tags',
        requiredPermissions: ['product_tags.read'],
      },
      {
        name: 'Product Informations',
        key: 'products-informations',
        icon: 'ListTree',
        href: '/master/product-information',
        requiredPermissions: ['product_informations.read'],
      },
      {
        name: 'Bulk Upload',
        key: 'products-bulk-upload',
        icon: 'Download',
        href: '/products/bulk-upload/history',
        requiredPermissions: ['products.create'],
      },
      {
        name: 'Media Gallery',
        key: 'products-gallery',
        icon: 'ImageIcon',
        href: '/products/gallery',
        requiredPermissions: ['gallery.read'],
      },
      {
        name: 'Product Reviews',
        key: 'products-reviews',
        icon: 'MessageSquare',
        href: '/products/reviews',
        requiredPermissions: ['product_reviews.read'],
      },
    ],
  },
  {
    name: 'Order Management',
    key: 'orders',
    icon: 'ShoppingBag',
    subItems: [
      // {
      //   name: 'Admin Orders',
      //   key: 'orders-requests',
      //   icon: 'Receipt',
      //   href: '/order-requests',
      //   requiredPermissions: ['orders.read'],
      // },
      {
        name: 'Add Orders',
        key: 'orders-add',
        icon: 'Plus',
        href: '/order-requests/create',
        requiredPermissions: ['orders.create'],
      },
      {
        name: 'All Orders',
        key: 'orders-list-all',
        icon: '',
        href: '/order-requests',
        requiredPermissions: ['orders.read'],
      },
      {
        name: 'Active Orders',
        key: 'active-orders',
        icon: '',
        href: '/order-requests?status=PENDING',
        requiredPermissions: ['orders.read'],
      },
      {
        name: 'In Transit',
        key: 'in-transit-orders',
        icon: '',
        href: '/order-requests?status=OUT_FOR_DELIVERY',
        requiredPermissions: ['orders.read'],
      },
      {
        name: 'Completed',
        key: 'delivered-orders',
        icon: '',
        href: '/order-requests?status=DELIVERED',
        requiredPermissions: ['orders.read'],
      },
      {
        name: 'Cancelled',
        key: 'cancelled-orders',
        icon: '',
        href: '/order-requests?status=CANCELLED',
        requiredPermissions: ['orders.read'],
      },
      {
        name: 'Abandoned Carts',
        key: 'orders-abandoned-carts',
        icon: 'ShoppingCart',
        href: '/abandoned-carts',
        requiredPermissions: ['abandoned_carts.read'],
      },
    ],
  },

    ],
  },
  // {
  //   name: 'Subscription & Membership',
  //   key: 'subscriptions',
  //   icon: 'Repeat',
  //   subItems: [
  //     {
  //       name: 'Membership Plans',
  //       key: 'subscriptions-membership-plans',
  //       icon: 'Crown',
  //       href: '/memberships/plans',
  //       requiredPermissions: ['membership_plans.read'],
  //     },
  //     {
  //       name: 'User Memberships',
  //       key: 'subscriptions-user-memberships',
  //       icon: 'Users',
  //       href: '/memberships/users',
  //       requiredPermissions: ['user_memberships.read'],
  //     },
  //     {
  //       name: 'Membership Payments',
  //       key: 'subscriptions-membership-payments',
  //       icon: 'CreditCard',
  //       href: '/memberships/payments',
  //       requiredPermissions: ['membership_payments.read'],
  //     },
  //     {
  //       name: 'Product Subscriptions',
  //       key: 'subscriptions-product-subscriptions',
  //       icon: 'Package',
  //       href: '/subscriptions/products',
  //       requiredPermissions: ['user_product_subscriptions.read'],
  //     },
  //     {
  //       name: 'Subscription Payments',
  //       key: 'subscriptions-product-payments',
  //       icon: 'CreditCard',
  //       href: '/subscriptions/payments',
  //       requiredPermissions: ['subscription_payments.read'],
  //     },
  //     {
  //       name: 'Failed Renewals',
  //       key: 'subscriptions-failed-renewals',
  //       icon: 'AlertTriangle',
  //       href: '/subscriptions/payments?status=FAILED',
  //       requiredPermissions: ['subscription_payments.read'],
  //     },
  //   ],
  // },
  // {
  //   name: 'Subscription & Membership',
  //   key: 'subscriptions',
  //   icon: 'Repeat',
  //   subItems: [
  //     {
  //       name: 'Membership Plans',
  //       key: 'subscriptions-membership-plans',
  //       icon: 'Crown',
  //       href: '/memberships/plans',
  //       requiredPermissions: ['membership_plans.read'],
  //     },
  //     {
  //       name: 'User Memberships',
  //       key: 'subscriptions-user-memberships',
  //       icon: 'Users',
  //       href: '/memberships/users',
  //       requiredPermissions: ['user_memberships.read'],
  //     },
  //     {
  //       name: 'Membership Payments',
  //       key: 'subscriptions-membership-payments',
  //       icon: 'CreditCard',
  //       href: '/memberships/payments',
  //       requiredPermissions: ['membership_payments.read'],
  //     },
  //     {
  //       name: 'Product Subscriptions',
  //       key: 'subscriptions-product-subscriptions',
  //       icon: 'Package',
  //       href: '/subscriptions/products',
  //       requiredPermissions: ['user_product_subscriptions.read'],
  //     },
  //     {
  //       name: 'Subscription Payments',
  //       key: 'subscriptions-product-payments',
  //       icon: 'CreditCard',
  //       href: '/subscriptions/payments',
  //       requiredPermissions: ['subscription_payments.read'],
  //     },
  //     {
  //       name: 'Failed Renewals',
  //       key: 'subscriptions-failed-renewals',
  //       icon: 'AlertTriangle',
  //       href: '/subscriptions/payments?status=FAILED',
  //       requiredPermissions: ['subscription_payments.read'],
  //     },
  //   ],
  // },
  // {
  //   name: 'Order Management',
  //   key: 'orders',
  //   icon: 'ShoppingBag',
  //   subItems: [
  //     {
  //       name: 'Admin Orders',
  //       key: 'orders-requests',
  //       icon: 'Receipt',
  //       href: '/order-requests',
  //       requiredPermissions: ['orders.read'],
  //     }
  //   ],
  // },
  {
    name: 'CMS',
    key: 'cms',
    icon: 'Grid',
    subItems: [
      {
        name: 'Header Indexing',
        key: 'cms-header-indexing',
        icon: 'SlidersHorizontal',
        href: '/master/category/header-indexing',
        requiredPermissions: ['header_indexing.read'],
      },
      {
        name: 'Banners',
        key: 'cms-banners',
        icon: 'ImageIcon',
        href: '/master/banner',
        requiredPermissions: ['banners.read'],
      },
      {
        name: 'Category Indexing',
        key: 'cms-shopby-indexing',
        icon: 'Target',
        href: '/master/category/shop-by-indexing',
        requiredPermissions: ['shop_by_indexing.read'],
      },
      {
        name: 'Best Sellers Indexing',
        key: 'best-sellers-indexing',
        icon: 'Award',
        href: '/cms/best-sellers-indexing',
        requiredPermissions: ['best_sellers.read'],
      },
      {
        name: 'Health Concern Indexing', // added new one
        key: 'health-concern-indexing',
        icon: 'HeartPulse',
        href: '/cms/health-concern-indexing',
        requiredPermissions: ['healthconcern.read'],
      },
      {
        name: 'Home Section Indexing',
        key: 'cms-home-sections',
        icon: 'ListTree',
        href: '/cms/home-section-indexing',
        requiredPermissions: ['home_sections.read'],
      },
      {
        name: 'Expert Talks & Podcasts',
        key: 'cms-expert-talks',
        icon: 'Mic',
        href: '/cms/expert/expert-talks',
        requiredPermissions: ['expert_talks.read'],
      },
      {
        name: 'Testimonials',
        key: 'cms-testimonials',
        icon: 'MessageSquare',
        href: '/cms/testimonials',
        requiredPermissions: ['testimonials.read'],
      },
      {
        name: 'Watch & Shop',
        key: 'cms-watch-and-shop',
        icon: 'ShoppingBag',
        href: '/master/watch-and-shop',
        requiredPermissions: ['watch_and_shop.read'],
      },
      {
        name: 'Pages',
        key: 'cms-pages',
        icon: 'FileText',
        requiredPermissions: ['cms_pages.read'],
        subItems: [
          {
            name: 'About Cureka',
            key: 'cms-pages-about-cureka',
            icon: 'FileText',
            href: '/cms/pages/about-cureka',
            requiredPermissions: ['cms_pages.read'],
          },
          {
            name: 'Privacy Policy',
            key: 'cms-pages-privacy-policy',
            icon: 'FileText',
            href: '/cms/pages/privacy-policy',
            requiredPermissions: ['cms_pages.read'],
          },
          {
            name: 'Terms & Conditions',
            key: 'cms-pages-terms-and-conditions',
            icon: 'FileText',
            href: '/cms/pages/terms-and-conditions',
            requiredPermissions: ['cms_pages.read'],
          },
          {
            name: 'Returns & Refunds',
            key: 'cms-pages-returns-refunds',
            icon: 'FileText',
            href: '/cms/pages/returns-refunds',
            requiredPermissions: ['cms_pages.read'],
          },
          {
            name: 'Shipping Policy',
            key: 'cms-pages-shipping-policy',
            icon: 'FileText',
            href: '/cms/pages/shipping-policy',
            requiredPermissions: ['cms_pages.read'],
          },
        ],
      },
    ],
  },
  {
    name: 'Blogs',
    key: 'blogs',
    icon: 'BookOpen',
    subItems: [
      {
        name: 'Blog Categories',
        key: 'blog-categories',
        icon: 'FolderKanban',
        href: '/blog/categories',
        requiredPermissions: ['blog_categories.read'],
      },
      {
        name: 'Blog Posts',
        key: 'blog-posts',
        icon: 'ImageIcon',
        href: '/blog/posts',
        requiredPermissions: ['blog_posts.read'],
      },
      {
        name: 'Blog Comments',
        key: 'blog-comments',
        icon: 'MessageSquare',
        href: '/blog/comments',
        requiredPermissions: ['blog_comments.read'],
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
        requiredPermissions: ['admin_users.read'],
      },
    ],
  },
  {
    name: 'Help & Support',
    key: 'support',
    icon: 'HelpCircle',
    subItems: [
      {
        name: 'Categories',
        key: 'support-categories',
        icon: 'FolderKanban',
        href: '/support/categories',
        requiredPermissions: ['support_categories.read'],
      },
      {
        name: 'Articles',
        key: 'support-articles',
        icon: 'ImageIcon',
        href: '/support/articles',
        requiredPermissions: ['support_articles.read'],
      },
      {
        name: 'FAQs',
        key: 'support-faqs',
        icon: 'ListTree',
        href: '/support/faqs',
        requiredPermissions: ['support_faqs.read'],
      },
      {
        name: 'Tickets',
        key: 'support-tickets',
        icon: 'Receipt',
        href: '/support/tickets',
        requiredPermissions: ['support_tickets.read'],
      },
      {
        name: 'Reason Master',
        key: 'support-reason-master',
        icon: 'ListChecks',
        href: '/support/reason-master',
        requiredPermissions: ['reason_masters.read'],
      },
    ],
  },
  {
    name: 'Reports',
    key: 'reports',
    icon: 'FileChartColumn',
    subItems: [
      {
        name: 'Sales & Revenue',
        key: 'reports-sales-revenue',
        icon: 'FileChartColumn',
        href: '/reports/sales-revenue',
        requiredPermissions: ['reports.read'],
      },
      {
        name: 'Orders',
        key: 'reports-orders',
        icon: 'FileChartColumn',
        href: '/reports/orders',
        requiredPermissions: ['reports.read'],
      },
      {
        name: 'Product Performance',
        key: 'reports-product-performance',
        icon: 'FileChartColumn',
        href: '/reports/product-performance',
        requiredPermissions: ['reports.read'],
      },
      {
        name: 'Inventory & Stock',
        key: 'reports-inventory-stock',
        icon: 'FileChartColumn',
        href: '/reports/inventory-stock',
        requiredPermissions: ['reports.read'],
      },
      {
        name: 'Customers',
        key: 'reports-customers',
        icon: 'FileChartColumn',
        href: '/reports/customers',
        requiredPermissions: ['reports.read'],
      },
      {
        name: 'Payments',
        key: 'reports-payments',
        icon: 'FileChartColumn',
        href: '/reports/payments',
        requiredPermissions: ['reports.read'],
      },
      {
        name: 'Returns & Refunds',
        key: 'reports-returns-refunds',
        icon: 'FileChartColumn',
        href: '/reports/returns-refunds',
        requiredPermissions: ['reports.read'],
      },
      {
        name: 'Coupons & Promotions',
        key: 'reports-coupons',
        icon: 'FileChartColumn',
        href: '/reports/coupons',
        requiredPermissions: ['reports.read'],
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
        requiredPermissions: ['audit_logs.read'],
      },
    ],
  },
  {
    name: 'Settings',
    key: 'settings',
    icon: 'Settings',
    subItems: [
      {
        name: 'Cart Charges',
        key: 'cart-charges-view',
        icon: 'Percent',
        href: '/settings/cart-charges',
        requiredPermissions: ['settings.read'],
      },
      {
        name: 'Payment Methods',
        key: 'payment-methods-view',
        icon: 'CreditCard',
        href: '/settings/payment-methods',
        requiredPermissions: ['settings.read'],
      },
      {
        name: 'Logistic Partners',
        key: 'logistic-partners-view',
        icon: 'Truck',
        href: '/settings/logistic-partners',
        requiredPermissions: ['settings.read'],
      },
    ],
  },
];
