import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CategoryEntity } from '../entities/category.entity';
import { AttributeEntity } from '../entities/attribute.entity';
import { CategoryFilterEntity } from '../entities/category-filter.entity';
import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { HOMEPAGE_SHOP_BY_HIERARCHY_LEVELS } from '../constants/homepage-shop-by-hierarchy.constant';
import { MasterStatus } from '../enums/master-status.enum';
import { PaginationOptions, CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '../utils/master-cursor-query.util';
import { buildSkipTake } from '@packages/database';

interface CategoryFindOptions extends PaginationOptions {
  hierarchyLevel?: CategoryHierarchyLevel;
  parentCategoryId?: string | null;
  status?: MasterStatus;
  isInHeader?: boolean;
  isInShopBy?: boolean;
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
    categoryFilters: CategoryFilterEntity[] = [],
  ): Promise<CategoryEntity> {
    const entity = this.repo.create({ ...data, attributes, categoryFilters });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .where('category.id = :id', { id })
      .getOne();
  }

  async findByRefId(refId: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .where('category.refId = :refId', { refId })
      .getOne();
  }

  async findActiveByRefId(refId: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .where('category.refId = :refId', { refId })
      .andWhere('category.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('category.deletedAt IS NULL')
      .getOne();
  }

  async findBySlug(slug: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .where('category.slug = :slug', { slug })
      .andWhere('category.deletedAt IS NULL')
      .getOne();
  }

  async findActiveBySlug(slug: string): Promise<CategoryEntity | null> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.attributes', 'attribute')
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .where('category.slug = :slug', { slug })
      .andWhere('category.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('category.deletedAt IS NULL')
      .getOne();
  }

  async findActiveChildren(parentId: string): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .where('category.parentCategoryId = :parentId', { parentId })
      .andWhere('category.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('category.deletedAt IS NULL')
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC')
      .getMany();
  }

  async findActiveDescendantsOf(parentId: string): Promise<CategoryEntity[]> {
    const rows = await this.repo.manager.query<Array<{ id: string }>>(
      `
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM categories
        WHERE parent_category_id = $1
          AND deleted_at IS NULL
          AND status = 'active'
        UNION ALL
        SELECT c.id
        FROM categories c
        INNER JOIN descendants d ON c.parent_category_id = d.id
        WHERE c.deleted_at IS NULL
          AND status = 'active'
      )
      SELECT id FROM descendants
      `,
      [parentId],
    );

    const ids = rows.map((row) => row.id);
    if (!ids.length) {
      return [];
    }

    return this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .whereInIds(ids)
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC')
      .getMany();
  }

  /** Walks up the hierarchy and returns the root ancestor for any category id. */
  async findRootAncestor(categoryId: string): Promise<CategoryEntity | null> {
    const rows = await this.repo.manager.query<Array<{ id: string }>>(
      `
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_category_id
        FROM categories
        WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT c.id, c.parent_category_id
        FROM categories c
        INNER JOIN ancestors a ON c.id = a.parent_category_id
        WHERE c.deleted_at IS NULL
      )
      SELECT id FROM ancestors
      WHERE parent_category_id IS NULL
      LIMIT 1
      `,
      [categoryId],
    );

    const rootId = rows[0]?.id;
    if (!rootId) {
      return this.findById(categoryId);
    }

    return this.findById(rootId);
  }

  /** Ordered category slugs from root → leaf for a category id. */
  async findSlugPathById(categoryId: string): Promise<string[]> {
    const rows = await this.repo.manager.query<Array<{ slug: string; depth: number }>>(
      `
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_category_id, slug, 0 AS depth
        FROM categories
        WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT c.id, c.parent_category_id, c.slug, a.depth + 1
        FROM categories c
        INNER JOIN ancestors a ON c.id = a.parent_category_id
        WHERE c.deleted_at IS NULL
      )
      SELECT slug, depth FROM ancestors
      ORDER BY depth DESC
      `,
      [categoryId],
    );

    return rows.map((row) => row.slug).filter(Boolean);
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('category')
        .where('category.slug = :slug', { slug })
        .andWhere('category.deletedAt IS NULL')
        .getCount()) > 0
    );
  }

  async existsBySlugExcluding(slug: string, excludeRefId: string): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('category')
        .where('category.slug = :slug', { slug })
        .andWhere('category.refId != :excludeRefId', { excludeRefId })
        .andWhere('category.deletedAt IS NULL')
        .getCount()) > 0
    );
  }

  async findByRefIds(refIds: string[]): Promise<CategoryEntity[]> {
    if (!refIds.length) return [];
    return this.repo.find({ where: { refId: In([...new Set(refIds)]) } });
  }

  async findActiveByRefIds(refIds: string[]): Promise<CategoryEntity[]> {
    if (!refIds.length) return [];
    return this.repo.find({
      where: {
        refId: In([...new Set(refIds)]),
        status: MasterStatus.ACTIVE,
      },
    });
  }

  async existsByNameAmongSiblings(
    name: string,
    parentCategoryId: string | null,
    excludeRefId?: string,
  ): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('category')
      .where('LOWER(TRIM(category.name)) = LOWER(TRIM(:name))', { name })
      .andWhere('category.deletedAt IS NULL');

    if (parentCategoryId === null) {
      qb.andWhere('category.parentCategoryId IS NULL');
    } else {
      qb.andWhere('category.parentCategoryId = :parentCategoryId', { parentCategoryId });
    }

    if (excludeRefId) {
      qb.andWhere('category.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  /** Case-insensitive name uniqueness within a hierarchy level (root / sub / sub-sub / sub-sub-sub). */
  async existsByNameAtHierarchyLevel(
    name: string,
    hierarchyLevel: CategoryHierarchyLevel,
    excludeRefId?: string,
  ): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('category')
      .where('LOWER(TRIM(category.name)) = LOWER(TRIM(:name))', { name })
      .andWhere('category.hierarchyLevel = :hierarchyLevel', { hierarchyLevel })
      .andWhere('category.deletedAt IS NULL');

    if (excludeRefId) {
      qb.andWhere('category.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
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
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        '(category.name ILIKE :search OR parent.name ILIKE :search)',
        { search: `%${options.search}%` },
      );
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
    if (options.status != null) {
      qb.andWhere('category.status = :status', { status: options.status });
    }
    if (options.isInHeader !== undefined) {
      qb.andWhere('category.isInHeader = :isInHeader', { isInHeader: options.isInHeader });
    }
    if (options.isInShopBy !== undefined) {
      qb.andWhere('category.isInShopBy = :isInShopBy', { isInShopBy: options.isInShopBy });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findPublicPaginated(
    options: CategoryFindOptions,
  ): Promise<{ data: CategoryEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'category.createdAt',
      name: 'category.name',
      position: 'category.position',
      hierarchyLevel: 'category.hierarchyLevel',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'category.position';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .where('category.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('category.deletedAt IS NULL')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        '(category.name ILIKE :search OR category.slug ILIKE :search OR category.refId ILIKE :search OR parent.name ILIKE :search OR parent.slug ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }
    if (options.hierarchyLevel !== undefined) {
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
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .where('category.deletedAt IS NULL')
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.createdAt', 'ASC')
      .getMany();
  }

  async findActiveCategories(): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .where('category.status = :status', { status: 'active' })
      .andWhere('category.deletedAt IS NULL')
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC')
      .getMany();
  }

  /**
   * Active categories that appear in the header mega-menu tree only — header roots
   * (`is_in_header` + root level) and all descendants. Avoids loading the full catalog.
   */
  async findActiveHeaderCategories(): Promise<CategoryEntity[]> {
    const rows = await this.repo.manager.query<Array<{ id: string }>>(
      `
      WITH RECURSIVE header_tree AS (
        SELECT c.id
        FROM categories c
        WHERE c.deleted_at IS NULL
          AND c.status = 'active'
          AND c.is_in_header = true
          AND c.hierarchy_level = '0'
        UNION ALL
        SELECT child.id
        FROM categories child
        INNER JOIN header_tree parent ON child.parent_category_id = parent.id
        WHERE child.deleted_at IS NULL
          AND child.status = 'active'
      )
      SELECT id FROM header_tree
      `,
    );

    const ids = rows.map((row) => row.id);
    if (!ids.length) {
      return [];
    }

    return this.repo
      .createQueryBuilder('category')
      .where('category.id IN (:...ids)', { ids })
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC')
      .getMany();
  }

  async findWizardCursorPaginated(
    options: MasterCursorStatusOptions & {
      hierarchyLevel?: CategoryHierarchyLevel;
      parentCategoryId?: string;
    },
  ): Promise<CursorPaginatedResult<CategoryEntity>> {
    const page = await executeMasterCursorQuery(
      this.repo,
      options,
      {
        alias: 'category',
        sortableColumns: {
          position: 'category.position',
          hierarchyId: 'category.hierarchyId',
          name: 'category.name',
          createdAt: 'category.createdAt',
          hierarchyLevel: 'category.hierarchyLevel',
          status: 'category.status',
        },
        defaultSortBy: 'position',
        defaultSortOrder: 'ASC',
        searchExpression: '(category.name ILIKE :search OR parent.name ILIKE :search)',
      },
      (qb) => {
        qb.leftJoin('category.parent', 'parent');
        if (options.hierarchyLevel !== undefined) {
          qb.andWhere('category.hierarchyLevel = :hierarchyLevel', {
            hierarchyLevel: String(options.hierarchyLevel),
          });
        }
        if (options.parentCategoryId !== undefined) {
          qb.andWhere('category.parentCategoryId = :parentCategoryId', {
            parentCategoryId: options.parentCategoryId,
          });
        }
      },
    );

    if (!page.data.length) {
      return page;
    }

    const ids = page.data.map((category) => category.id);
    const hydrated = await this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .whereInIds(ids)
      .getMany();

    const byId = new Map(hydrated.map((category) => [category.id, category]));
    return {
      ...page,
      data: ids.map((id) => byId.get(id)).filter((category): category is CategoryEntity => !!category),
    };
  }

  async findForWizardBootstrap(options: {
    status?: MasterStatus;
    hierarchyLevel?: CategoryHierarchyLevel;
    parentCategoryId?: string;
  } = {}): Promise<CategoryEntity[]> {
    const qb = this.repo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.categoryFilters', 'categoryFilter')
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC');

    if (options.status) {
      qb.where('category.status = :status', { status: options.status });
    }
    if (options.hierarchyLevel !== undefined) {
      qb.andWhere('category.hierarchyLevel = :hierarchyLevel', {
        hierarchyLevel: String(options.hierarchyLevel),
      });
    }
    if (options.parentCategoryId !== undefined) {
      qb.andWhere('category.parentCategoryId = :parentCategoryId', {
        parentCategoryId: options.parentCategoryId,
      });
    }

    return qb.getMany();
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
    categoryFilters?: CategoryFilterEntity[],
  ): Promise<CategoryEntity | null> {
    const entity = await this.findById(id);
    if (!entity) return null;

    Object.assign(entity, data);
    if (attributes !== undefined) {
      entity.attributes = attributes;
    }
    if (categoryFilters !== undefined) {
      entity.categoryFilters = categoryFilters;
    }

    return this.repo.save(entity);
  }

  async softDeleteCategory(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async reorderCategories(updates: Array<{ id: string; position: number }>): Promise<void> {
    await Promise.all(updates.map(({ id, position }) => this.repo.update(id, { position })));
  }

  async reorderCategoriesByRefId(
    updates: Array<{ refId: string; position: number }>,
  ): Promise<void> {
    await Promise.all(
      updates.map(({ refId, position }) => this.repo.update({ refId }, { position })),
    );
  }

  async getMaxPositionAmongSiblings(parentCategoryId: string | null): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('category')
      .select('MAX(category.position)', 'max')
      .where('category.deletedAt IS NULL');

    if (parentCategoryId === null) {
      qb.andWhere('category.parentCategoryId IS NULL');
    } else {
      qb.andWhere('category.parentCategoryId = :parentId', { parentId: parentCategoryId });
    }

    const result = await qb.getRawOne<{ max: string | null }>();
    if (result?.max === null || result?.max === undefined) return 0;
    return parseInt(result.max, 10);
  }

  async findHeaderRootCategories(): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .where('category.isInHeader = :isInHeader', { isInHeader: true })
      .andWhere('category.hierarchyLevel = :level', {
        level: String(CategoryHierarchyLevel.ROOT),
      })
      .andWhere('category.parentCategoryId IS NULL')
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC')
      .getMany();
  }

  /**
   * Categories flagged for Shop by Category homepage (root, sub, and sub-sub).
   */
  async findShopByRootCategories(): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .where('category.isInShopBy = :isInShopBy', { isInShopBy: true })
      .andWhere('category.hierarchyLevel IN (:...levels)', {
        levels: HOMEPAGE_SHOP_BY_HIERARCHY_LEVELS.map(String),
      })
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC')
      .getMany();
  }

  /** Latest shop-by categories (newest first), capped to `limit`. */
  async findLatestShopByRootCategories(limit: number): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .where('category.isInShopBy = :isInShopBy', { isInShopBy: true })
      .andWhere('category.hierarchyLevel IN (:...levels)', {
        levels: HOMEPAGE_SHOP_BY_HIERARCHY_LEVELS.map(String),
      })
      .orderBy('category.createdAt', 'DESC')
      .addOrderBy('category.hierarchyId', 'DESC')
      .take(limit)
      .getMany();
  }

  async findChildrenForIndexing(parentId: string): Promise<CategoryEntity[]> {
    return this.repo
      .createQueryBuilder('category')
      .where('category.parentCategoryId = :parentId', { parentId })
      .orderBy('category.position', 'ASC')
      .addOrderBy('category.hierarchyId', 'ASC')
      .getMany();
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
