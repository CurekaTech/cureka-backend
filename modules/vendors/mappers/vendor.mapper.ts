import { VendorEntity } from '../entities/vendor.entity';
import { VendorCategoryHierarchyEntity } from '../entities/vendor-category-hierarchy.entity';
import { VendorWarehouseEntity } from '../entities/vendor-warehouse.entity';
import {
  IVendor,
  IVendorBrandSummary,
  IVendorCategoryHierarchy,
  IVendorWarehouse,
} from '../interfaces/vendor.interface';

const mapCategoryHierarchy = (
  entity: VendorCategoryHierarchyEntity,
): IVendorCategoryHierarchy => ({
  sortOrder: entity.sortOrder,
  categoryRefId: entity.category?.refId ?? '',
  categoryName: entity.category?.name ?? '',
  subCategoryRefId: entity.subCategory?.refId ?? null,
  subCategoryName: entity.subCategory?.name ?? null,
  subSubCategoryRefId: entity.subSubCategory?.refId ?? null,
  subSubCategoryName: entity.subSubCategory?.name ?? null,
  subSubSubCategoryRefId: entity.subSubSubCategory?.refId ?? null,
  subSubSubCategoryName: entity.subSubSubCategory?.name ?? null,
});

const mapWarehouse = (entity: VendorWarehouseEntity): IVendorWarehouse => ({
  id: entity.id,
  refId: entity.refId,
  address: entity.address,
  pincode: entity.pincode,
  contactPerson: entity.contactPerson,
  contactPhone: entity.contactPhone,
  warehouseCode: entity.warehouseCode,
  isDefault: entity.isDefault,
});

export const mapVendorEntityToResponse = (entity: VendorEntity): IVendor => {
  const brands: IVendorBrandSummary[] = (entity.brands ?? []).map((brand) => ({
    id: brand.id,
    refId: brand.refId,
    name: brand.name,
  }));

  const hierarchies = [...(entity.categoryHierarchies ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return {
    id: entity.id,
    refId: entity.refId,
    userId: entity.userId,
    userRefId: entity.user?.refId ?? null,
    companyName: entity.companyName,
    contactPerson: entity.contactPerson,
    email: entity.email,
    mobileNumber: entity.mobileNumber,
    businessAddress: entity.businessAddress,
    panNumber: entity.panNumber,
    panDocument: entity.panDocument,
    gstNumber: entity.gstNumber,
    gstCertificateDocument: entity.gstCertificateDocument,
    productExcelSheet: entity.productExcelSheet,
    companyProfile: entity.companyProfile,
    categories: hierarchies.map(mapCategoryHierarchy),
    brands,
    brandRefIds: brands.map((brand) => brand.refId),
    warehouses: (entity.warehouses ?? [])
      .slice()
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map(mapWarehouse),
    status: entity.status,
    source: entity.source,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  };
};

export const mapVendorEntitiesToResponse = (entities: VendorEntity[]): IVendor[] =>
  entities.map(mapVendorEntityToResponse);
