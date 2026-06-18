import { ConflictException, Injectable } from '@nestjs/common';
import { MasterUsageRepository } from '../repositories/master-usage.repository';

interface UsageCheck {
  label: string;
  count: number;
}

@Injectable()
export class MasterDeletionGuardService {
  constructor(private readonly usage: MasterUsageRepository) {}

  async assertCategoryDeletable(categoryId: string, name: string): Promise<void> {
    const [childCount, productCount, manufacturerCount] = await Promise.all([
      this.usage.countChildCategories(categoryId),
      this.usage.countProductsReferencingCategory(categoryId),
      this.usage.countManufacturersByCategoryId(categoryId),
    ]);

    this.throwIfInUse('category', name, [
      { label: 'child categories', count: childCount },
      { label: 'products', count: productCount },
      { label: 'manufacturers', count: manufacturerCount },
    ]);
  }

  async assertBrandDeletable(brandId: string, name: string): Promise<void> {
    const productCount = await this.usage.countProductsByBrandId(brandId);
    this.throwIfInUse('brand', name, [{ label: 'products', count: productCount }]);
  }

  async assertManufacturerDeletable(manufacturerId: string, name: string): Promise<void> {
    const productCount = await this.usage.countProductsByManufacturerId(manufacturerId);
    this.throwIfInUse('manufacturer', name, [{ label: 'products', count: productCount }]);
  }

  async assertPackerDeletable(packerId: string, name: string): Promise<void> {
    const productCount = await this.usage.countProductsByPackerId(packerId);
    this.throwIfInUse('packer', name, [{ label: 'products', count: productCount }]);
  }

  async assertImporterDeletable(importerId: string, name: string): Promise<void> {
    const productCount = await this.usage.countProductsByImporterId(importerId);
    this.throwIfInUse('importer', name, [{ label: 'products', count: productCount }]);
  }

  async assertProductNatureDeletable(productNatureId: string, name: string): Promise<void> {
    const productCount = await this.usage.countProductsByProductNatureId(productNatureId);
    this.throwIfInUse('product nature', name, [{ label: 'products', count: productCount }]);
  }

  async assertHealthConcernDeletable(healthConcernId: string, name: string): Promise<void> {
    const productCount = await this.usage.countProductsByHealthConcernId(healthConcernId);
    this.throwIfInUse('health concern', name, [{ label: 'products', count: productCount }]);
  }

  async assertWellnessGoalDeletable(wellnessGoalId: string, name: string): Promise<void> {
    const productCount = await this.usage.countProductsByWellnessGoalId(wellnessGoalId);
    this.throwIfInUse('wellness goal', name, [{ label: 'products', count: productCount }]);
  }

  async assertAttributeDeletable(attributeId: string, name: string): Promise<void> {
    const usageCount = await this.usage.countAttributeUsages(attributeId);
    this.throwIfInUse('attribute', name, [{ label: 'linked records', count: usageCount }]);
  }

  async assertCountryDeletable(countryId: string, name: string): Promise<void> {
    const [stateCount, productCount] = await Promise.all([
      this.usage.countStatesByCountryId(countryId),
      this.usage.countProductsByCountryOfOriginId(countryId),
    ]);

    this.throwIfInUse('country', name, [
      { label: 'states', count: stateCount },
      { label: 'products', count: productCount },
    ]);
  }

  async assertStateDeletable(stateId: string, name: string): Promise<void> {
    const cityCount = await this.usage.countCitiesByStateId(stateId);

    this.throwIfInUse('state', name, [{ label: 'cities', count: cityCount }]);
  }

  private throwIfInUse(entityLabel: string, name: string, usages: UsageCheck[]): void {
    const activeUsages = usages.filter((usage) => usage.count > 0);
    if (!activeUsages.length) return;

    const details = activeUsages
      .map((usage) => `${usage.count} ${usage.label}`)
      .join(', ');

    throw new ConflictException(
      `Cannot delete ${entityLabel} "${name}" — it is linked to ${details}. Remove or reassign those references first.`,
    );
  }
}
