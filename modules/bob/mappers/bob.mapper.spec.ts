import 'reflect-metadata';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { mapBobCategory } from './bob.mapper';

describe('mapBobCategory', () => {
  it('keeps BOB spec fields id + title and adds parent linkage', () => {
    const child = {
      id: 'child-uuid',
      name: 'Medical Equipments',
      parentCategoryId: 'parent-uuid',
    } as CategoryEntity;

    expect(mapBobCategory(child, 'Healthcare Devices')).toEqual({
      id: 'child-uuid',
      title: 'Medical Equipments',
      parentId: 'parent-uuid',
      parentTitle: 'Healthcare Devices',
    });
  });

  it('returns null parent fields for root categories', () => {
    const root = {
      id: 'root-uuid',
      name: 'Healthcare Devices',
      parentCategoryId: null,
    } as CategoryEntity;

    expect(mapBobCategory(root)).toEqual({
      id: 'root-uuid',
      title: 'Healthcare Devices',
      parentId: null,
      parentTitle: null,
    });
  });
});
