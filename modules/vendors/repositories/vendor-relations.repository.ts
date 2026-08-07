import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { VendorCategoryHierarchyEntity } from '../entities/vendor-category-hierarchy.entity';
import { VendorWarehouseEntity } from '../entities/vendor-warehouse.entity';
import { VendorEntity } from '../entities/vendor.entity';
import { IResolvedVendorCategoryHierarchy } from '../interfaces/vendor.interface';
import { VendorWarehouseDto } from '../dto/register-vendor.dto';

@Injectable()
export class VendorRelationsRepository {
  async syncCategoryHierarchies(
    manager: EntityManager,
    vendorId: string,
    hierarchies: IResolvedVendorCategoryHierarchy[],
  ): Promise<void> {
    const repo = manager.getRepository(VendorCategoryHierarchyEntity);
    await repo.delete({ vendorId });
    if (!hierarchies.length) return;
    await repo.save(
      hierarchies.map((item) =>
        repo.create({
          vendorId,
          sortOrder: item.sortOrder,
          categoryId: item.categoryId,
          subCategoryId: item.subCategoryId,
          subSubCategoryId: item.subSubCategoryId,
          subSubSubCategoryId: item.subSubSubCategoryId,
        }),
      ),
    );
  }

  async syncBrands(
    manager: EntityManager,
    vendorId: string,
    brands: BrandEntity[],
  ): Promise<void> {
    const vendorRepo = manager.getRepository(VendorEntity);
    const vendor = await vendorRepo.findOne({
      where: { id: vendorId },
      relations: { brands: true },
    });
    if (!vendor) return;
    vendor.brands = brands;
    await vendorRepo.save(vendor);
  }

  async syncWarehouses(
    manager: EntityManager,
    vendorId: string,
    warehouses: VendorWarehouseDto[],
    actor: string,
    defaultContactPerson: string,
    defaultContactPhone: string,
  ): Promise<void> {
    const repo = manager.getRepository(VendorWarehouseEntity);
    await repo
      .createQueryBuilder()
      .delete()
      .where('vendor_id = :vendorId', { vendorId })
      .execute();

    if (!warehouses.length) return;

    const hasExplicitDefault = warehouses.some((item) => item.isDefault === true);

    const rows: VendorWarehouseEntity[] = [];
    for (let index = 0; index < warehouses.length; index++) {
      const item = warehouses[index]!;
      const refId = await generateUniqueRefId('vwh', async (candidate) =>
        repo.exists({ where: { refId: candidate } }),
      );
      rows.push(
        repo.create({
          refId,
          vendorId,
          address: item.address.trim(),
          pincode: item.pincode.trim(),
          contactPerson: item.contactPerson?.trim() || defaultContactPerson,
          contactPhone: item.contactPhone?.trim() || defaultContactPhone,
          warehouseCode: item.warehouseCode?.trim() || null,
          isDefault: hasExplicitDefault ? item.isDefault === true : index === 0,
          createdBy: actor,
          updatedBy: actor,
        }),
      );
    }

    await repo.save(rows);
  }
}
