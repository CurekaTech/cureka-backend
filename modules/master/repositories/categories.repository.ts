import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../entities/category.entity';
import { AttributeEntity } from '../entities/attribute.entity';
import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

interface CategoryFindOptions extends PaginationOptions {
  hierarchyLevel?: CategoryHierarchyLevel;
  parentCategoryId?: string | null;
}

@Injectable()
export class CategoriesRepository {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly repo: Repository<CategoryEntity>,
  ) {}

  async createCategory(
    data: Partial<CategoryEntity>,
    attributes: AttributeEntity[],
  ): Promise<CategoryEntity> {
    const entity = this.repo.create({ ...data, attributes });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .where('category.id = :id', { id })
      .getOne();
  }

  async findByRefId(refId: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .where('category.refId = :refId', { refId })
      .getOne();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(refId: string, data: Partial<CategoryEntity>): Promise<CategoryEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: CategoryFindOptions,
  ): Promise<{ data: CategoryEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    // Allowlist prevents SQL injection from sortBy input
    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'category.createdAt',
      name: 'category.name',
      position: 'category.position',
      hierarchyLevel: 'category.hierarchyLevel',
      status: 'category.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'category.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere('category.name ILIKE :search', { search: `%${options.search}%` });
    }
    if (options.hierarchyLevel !== undefined) {
      // PostgreSQL ENUM stores numeric enum values as strings ('0','1','2','3');
      // passing a JS number causes a type mismatch — cast to string explicitly.
      qb.andWhere('category.hierarchyLevel = :hierarchyLevel', {
        hierarchyLevel: String(options.hierarchyLevel),
      });
    }
    if (options.parentCategoryId !== undefined) {
      if (options.parentCategoryId === null) {
        qb.andWhere('category.parentCategoryId IS NULL');
      } else {
        qb.andWhere('category.parentCategoryId = :parentCategoryId', {
          parentCategoryId: options.parentCategoryId,
        });
      }
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findTree(): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.createdAt', 'ASC')
      .getMany();
  }

  async findRootCategories(): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .where('category.parentCategoryId IS NULL')
      .orderBy('category.position', 'ASC')
      .getMany();
  }

  async findChildren(parentId: string): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .where('category.parentCategoryId = :parentId', { parentId })
      .orderBy('category.position', 'ASC')
      .getMany();
  }

  async updateCategory(
    id: string,
    data: Partial<CategoryEntity>,
    attributes?: AttributeEntity[],
  ): Promise<CategoryEntity | null> {
    const entity = await this.findById(id);
    if (!entity) return null;

    Object.assign(entity, data);
    if (attributes !== undefined) {
      entity.attributes = attributes;
    }

    return this.repo.save(entity);
  }

  async softDeleteCategory(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async reorderCategories(updates: Array<{ id: string; position: number }>): Promise<void> {
    await Promise.all(updates.map(({ id, position }) => this.repo.update(id, { position })));
  }

  async findBySlug(slug: string): Promise<CategoryEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async findBySlugExcluding(slug: string, excludeId: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .where('category.slug = :slug', { slug })
      .andWhere('category.id != :excludeId', { excludeId })
      .getOne();
  }

  async getNextHierarchyId(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('category')
      .select('MAX(category.hierarchyId)', 'max')
      .withDeleted()
      .getRawOne<{ max: string | null }>();
    const max = result?.max !== null && result?.max !== undefined ? parseInt(result.max, 10) : 0;
    return max + 1;
  }

  async findAllDescendantIds(categoryId: string): Promise<string[]> {
    const rows = await this.repo.manager.query<Array<{ id: string }>>(
      `
      WITH RECURSIVE descendants AS (
        SELECT id FROM categories WHERE parent_category_id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT c.id FROM categories c
        INNER JOIN descendants d ON c.parent_category_id = d.id
        WHERE c.deleted_at IS NULL
      )
      SELECT id FROM descendants
      `,
      [categoryId],
    );
    return rows.map((row) => row.id);
  }

  async countChildren(parentId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('category')
      .where('category.parentCategoryId = :parentId', { parentId })
      .getCount();
  }
}
