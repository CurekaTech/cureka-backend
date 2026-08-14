import { PermissionAction } from '../enums/permission-action.enum';

export interface IPermissionSeed {
  name: string;
  code: string;
  module: string;
  action: PermissionAction;
  description?: string;
}

const buildCrudPermissions = (module: string, label: string): IPermissionSeed[] => [
  {
    name: `View ${label}`,
    code: `${module}.read`,
    module,
    action: PermissionAction.READ,
  },
  {
    name: `Create ${label}`,
    code: `${module}.create`,
    module,
    action: PermissionAction.CREATE,
  },
  {
    name: `Update ${label}`,
    code: `${module}.update`,
    module,
    action: PermissionAction.UPDATE,
  },
  {
    name: `Change ${label} Status`,
    code: `${module}.status`,
    module,
    action: PermissionAction.STATUS,
  },
  {
    name: `Delete ${label}`,
    code: `${module}.delete`,
    module,
    action: PermissionAction.DELETE,
  },
];

export const ADMIN_PERMISSION_SEEDS: readonly IPermissionSeed[] = [
  {
    name: 'View Dashboard',
    code: 'dashboard.read',
    module: 'dashboard',
    action: PermissionAction.READ,
  },
  {
    name: 'View Reports',
    code: 'reports.read',
    module: 'reports',
    action: PermissionAction.READ,
  },
  {
    name: 'Download Reports',
    code: 'reports.export',
    module: 'reports',
    action: PermissionAction.READ,
  },
  ...buildCrudPermissions('users', 'Users'),
  ...buildCrudPermissions('vendors', 'Vendors'),
  ...buildCrudPermissions('orders', 'Orders'),
  {
    name: 'View Settings',
    code: 'settings.read',
    module: 'settings',
    action: PermissionAction.READ,
  },
  {
    name: 'Update Settings',
    code: 'settings.update',
    module: 'settings',
    action: PermissionAction.UPDATE,
  },
  ...buildCrudPermissions('roles', 'Roles'),
  ...buildCrudPermissions('permissions', 'Permissions'),
  ...buildCrudPermissions('category_filters', 'Category Filters'),
  ...buildCrudPermissions('categories', 'Categories'),
  ...buildCrudPermissions('attributes', 'Attributes'),
  ...buildCrudPermissions('units', 'Units'),
  ...buildCrudPermissions('brands', 'Brands'),
  ...buildCrudPermissions('health_concerns', 'Health Concerns'),
  ...buildCrudPermissions('wellness_goals', 'Wellness Goals'),
  ...buildCrudPermissions('reason_masters', 'Reason Masters'),
  ...buildCrudPermissions('manufacturers', 'Manufacturers'),
  ...buildCrudPermissions('packers', 'Packers'),
  ...buildCrudPermissions('importers', 'Importers'),
  ...buildCrudPermissions('subscription_frequencies', 'Subscription Frequencies'),
  ...buildCrudPermissions('membership_plans', 'Membership Plans'),
  ...buildCrudPermissions('membership_benefits', 'Membership Benefits'),
  ...buildCrudPermissions('user_memberships', 'User Memberships'),
  ...buildCrudPermissions('membership_payments', 'Membership Payments'),
  ...buildCrudPermissions('user_product_subscriptions', 'User Product Subscriptions'),
  ...buildCrudPermissions('subscription_payments', 'Subscription Payments'),
  ...buildCrudPermissions('products', 'Products'),
  {
    name: 'Approve Products',
    code: 'products.approve',
    module: 'products',
    action: PermissionAction.APPROVE,
  },
  {
    name: 'Reject Products',
    code: 'products.reject',
    module: 'products',
    action: PermissionAction.REJECT,
  },
  ...buildCrudPermissions('product_tags', 'Product Tags'),
  ...buildCrudPermissions('product_informations', 'Product Informations'),
  ...buildCrudPermissions('gallery', 'Media Gallery'),
  ...buildCrudPermissions('banners', 'Banners'),
  ...buildCrudPermissions('home_sections', 'Home Sections'),
  ...buildCrudPermissions('header_indexing', 'Header Indexing'),
  ...buildCrudPermissions('shop_by_indexing', 'Shop By Indexing'),
  ...buildCrudPermissions('best_sellers', 'Best Sellers Indexing'),
  ...buildCrudPermissions('watch_and_shop', 'Watch & Shop'),
  ...buildCrudPermissions('expert_talks', 'Expert Talks'),
  ...buildCrudPermissions('testimonials', 'Testimonials'),
  ...buildCrudPermissions('cms_pages', 'CMS Pages'),
  ...buildCrudPermissions('audit_logs', 'Audit Logs'),
  ...buildCrudPermissions('support_categories', 'Support Categories'),
  ...buildCrudPermissions('support_articles', 'Support Articles'),
  ...buildCrudPermissions('support_faqs', 'Support FAQs'),
  ...buildCrudPermissions('blog_categories', 'Blog Categories'),
  ...buildCrudPermissions('blog_posts', 'Blog Posts'),
  ...buildCrudPermissions('blog_comments', 'Blog Comments'),
  {
    name: 'View Product Reviews',
    code: 'product_reviews.read',
    module: 'product_reviews',
    action: PermissionAction.READ,
  },
  {
    name: 'Update Product Reviews',
    code: 'product_reviews.update',
    module: 'product_reviews',
    action: PermissionAction.UPDATE,
  },
  {
    name: 'Delete Product Reviews',
    code: 'product_reviews.delete',
    module: 'product_reviews',
    action: PermissionAction.DELETE,
  },
  {
    name: 'View Support Tickets',
    code: 'support_tickets.read',
    module: 'support',
    action: PermissionAction.READ,
  },
  {
    name: 'Update Support Tickets',
    code: 'support_tickets.update',
    module: 'support',
    action: PermissionAction.UPDATE,
  },
  {
    name: 'Assign Support Tickets',
    code: 'support_tickets.assign',
    module: 'support',
    action: PermissionAction.UPDATE,
  },
  {
    name: 'View Support Reports',
    code: 'support_reports.read',
    module: 'support',
    action: PermissionAction.READ,
  },
];
