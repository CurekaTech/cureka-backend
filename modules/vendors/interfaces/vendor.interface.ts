import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorStatus } from '../enums/vendor-status.enum';

export interface IVendorCategorySummary {
  refId: string;
  name: string;
}

export interface IVendorCategoryHierarchy {
  sortOrder: number;
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subCategoryName: string | null;
  subSubCategoryRefId: string | null;
  subSubCategoryName: string | null;
  subSubSubCategoryRefId: string | null;
  subSubSubCategoryName: string | null;
}

export interface IVendorBrandSummary {
  id: string;
  refId: string;
  name: string;
}

export interface IVendorWarehouse {
  id: string;
  refId: string;
  address: string;
  pincode: string;
  contactPerson: string | null;
  contactPhone: string | null;
  warehouseCode: string | null;
  isDefault: boolean;
}

export interface IVendor {
  id: string;
  refId: string;
  userId: string;
  userRefId: string | null;
  companyName: string;
  contactPerson: string;
  email: string;
  mobileNumber: string;
  businessAddress: string;
  panNumber: string;
  panDocument: IStorageFileReference | IStorageFileReferenceResponse | null;
  gstNumber: string;
  gstCertificateDocument: IStorageFileReference | IStorageFileReferenceResponse | null;
  productExcelSheet: IStorageFileReference | IStorageFileReferenceResponse | null;
  companyProfile: string | null;
  categories: IVendorCategoryHierarchy[];
  brands: IVendorBrandSummary[];
  brandRefIds: string[];
  warehouses: IVendorWarehouse[];
  status: VendorStatus;
  source: VendorSource;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IResolvedVendorCategoryHierarchy {
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  sortOrder: number;
}
