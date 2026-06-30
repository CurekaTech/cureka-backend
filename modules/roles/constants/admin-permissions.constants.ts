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
  ...buildCrudPermissions('manufacturers', 'Manufacturers'),
  ...buildCrudPermissions('packers', 'Packers'),
  ...buildCrudPermissions('importers', 'Importers'),
  ...buildCrudPermissions('subscription_frequencies', 'Subscription Frequencies'),
];
