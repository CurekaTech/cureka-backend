import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { CategoryEntity } from '../../../../modules/master/entities/category.entity';
import { CategoryHierarchyLevel } from '../../../../modules/master/enums/category-hierarchy-level.enum';
import { MasterStatus } from '../../../../modules/master/enums/master-status.enum';
import {
  CategoryImportCounters,
  CategoryImportSummary,
  CategorySubcategoryRow,
  SubSubCategoryRow,
  UPDATED_BY,
  emptyCounters,
  generateCategorySlug,
  printCategoryImportSummary,
  readCategorySubcategorySheet,
  readSubSubCategorySheet,
  siblingCacheKey,
} from './category-import.helpers';
import { normalizeValue, toLookupKey } from './master-import.helpers';

export interface CategoryImportFilePaths {
  categorySubcategory: string;
  subSubSubCategory: string;
}

export interface CategoryImportOptions {
  files: CategoryImportFilePaths;
  apply: boolean;
  categorySubSheet?: string;
  subSubSubSheet?: string;
}

type CachedCategory = Pick<
  CategoryEntity,
  'id' | 'refId' | 'name' | 'parentCategoryId' | 'hierarchyLevel'
>;

const nextHierarchyLevel = (parentLevel: CategoryHierarchyLevel | null): CategoryHierarchyLevel => {
  switch (parentLevel) {
    case null:
      return CategoryHierarchyLevel.ROOT;
    case CategoryHierarchyLevel.ROOT:
      return CategoryHierarchyLevel.CHILD;
    case CategoryHierarchyLevel.CHILD:
      return CategoryHierarchyLevel.GRANDCHILD;
    case CategoryHierarchyLevel.GRANDCHILD:
      return CategoryHierarchyLevel.GREAT_GRANDCHILD;
    default:
      throw new Error('Maximum category hierarchy depth exceeded');
  }
};

const reserveUniqueSlug = async (
  manager: EntityManager,
  baseName: string,
  usedSlugs: Set<string>,
): Promise<string> => {
  const base = generateCategorySlug(baseName) || 'category';
  if (!usedSlugs.has(base)) {
    const exists = await manager.getRepository(CategoryEntity).exists({
      where: { slug: base },
    });
    if (!exists) {
      usedSlugs.add(base);
      return base;
    }
  }

  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = `${base}-${suffix}`;
    if (usedSlugs.has(candidate)) {
      suffix += 1;
      continue;
    }
    const exists = await manager.getRepository(CategoryEntity).exists({
      where: { slug: candidate },
    });
    if (!exists) {
      usedSlugs.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  throw new Error(`Unable to reserve unique slug for category "${baseName}"`);
};

const getNextHierarchyId = async (manager: EntityManager): Promise<number> => {
  const result = await manager
    .getRepository(CategoryEntity)
    .createQueryBuilder('category')
    .select('MAX(category.hierarchyId)', 'max')
    .withDeleted()
    .getRawOne<{ max: string | null }>();
  const max = result?.max !== null && result?.max !== undefined ? parseInt(result.max, 10) : 0;
  return max + 1;
};

const getMaxPositionAmongSiblings = async (
  manager: EntityManager,
  parentCategoryId: string | null,
): Promise<number> => {
  const qb = manager
    .getRepository(CategoryEntity)
    .createQueryBuilder('category')
    .select('MAX(category.position)', 'max')
    .where('category.deletedAt IS NULL');

  if (parentCategoryId === null) {
    qb.andWhere('category.parentCategoryId IS NULL');
  } else {
    qb.andWhere('category.parentCategoryId = :parentCategoryId', { parentCategoryId });
  }

  const result = await qb.getRawOne<{ max: string | null }>();
  return result?.max !== null && result?.max !== undefined ? parseInt(result.max, 10) : 0;
};

const loadCategoryCache = async (manager: EntityManager): Promise<Map<string, CachedCategory>> => {
  const categories = await manager.getRepository(CategoryEntity).find({
    select: {
      id: true,
      refId: true,
      name: true,
      parentCategoryId: true,
      hierarchyLevel: true,
    },
  });

  const cache = new Map<string, CachedCategory>();
  for (const category of categories) {
    cache.set(siblingCacheKey(category.parentCategoryId, category.name), category);
  }
  return cache;
};

const findSiblingInCache = (
  cache: Map<string, CachedCategory>,
  parentCategoryId: string | null,
  name: string,
): CachedCategory | undefined => cache.get(siblingCacheKey(parentCategoryId, name));

const findRootByName = (
  cache: Map<string, CachedCategory>,
  rootName: string,
): CachedCategory | undefined => {
  const key = toLookupKey(rootName);
  for (const category of cache.values()) {
    if (
      category.parentCategoryId === null &&
      category.hierarchyLevel === CategoryHierarchyLevel.ROOT &&
      toLookupKey(category.name) === key
    ) {
      return category;
    }
  }
  return undefined;
};

const findChildUnderRoot = (
  cache: Map<string, CachedCategory>,
  root: CachedCategory,
  childName: string,
): CachedCategory | undefined => {
  const key = toLookupKey(childName);
  for (const category of cache.values()) {
    if (
      category.parentCategoryId === root.id &&
      category.hierarchyLevel === CategoryHierarchyLevel.CHILD &&
      toLookupKey(category.name) === key
    ) {
      return category;
    }
  }
  return undefined;
};

interface FindOrCreateResult {
  category: CachedCategory;
  created: boolean;
}

const findOrCreateCategory = async (
  manager: EntityManager,
  cache: Map<string, CachedCategory>,
  usedSlugs: Set<string>,
  usedRefIds: Set<string>,
  counters: CategoryImportCounters,
  options: {
    name: string;
    parent: CachedCategory | null;
    apply: boolean;
  },
): Promise<FindOrCreateResult> => {
  const name = normalizeValue(options.name);
  const parentId = options.parent?.id ?? null;
  const existing = findSiblingInCache(cache, parentId, name);
  if (existing) {
    counters.skipped += 1;
    return { category: existing, created: false };
  }

  const hierarchyLevel = nextHierarchyLevel(options.parent?.hierarchyLevel ?? null);
  const slug = await reserveUniqueSlug(manager, name, usedSlugs);
  const refId = await generateUniqueRefId(name, async (candidate) => usedRefIds.has(candidate));
  usedRefIds.add(refId);

  const hierarchyId = await getNextHierarchyId(manager);
  const position = (await getMaxPositionAmongSiblings(manager, parentId)) + 1;

  const draft: CachedCategory = {
    id: randomUUID(),
    refId,
    name,
    parentCategoryId: parentId,
    hierarchyLevel,
  };

  if (options.apply) {
    const saved = await manager.getRepository(CategoryEntity).save(
      manager.getRepository(CategoryEntity).create({
        id: draft.id,
        refId,
        name,
        slug,
        hierarchyId,
        parentCategoryId: parentId,
        position,
        hierarchyLevel,
        image: null,
        banner: null,
        description: null,
        metaTitle: null,
        metaDescription: null,
        metaKeywords: null,
        aboveTheFold: null,
        belowTheFold: null,
        status: MasterStatus.ACTIVE,
        isInHeader: false,
        isInShopBy: false,
        createdBy: UPDATED_BY,
        updatedBy: UPDATED_BY,
      }),
    );
    draft.id = saved.id;
  }

  cache.set(siblingCacheKey(parentId, name), draft);
  counters.inserted += 1;
  return { category: draft, created: true };
};

export const processCategorySubcategorySheet = async (
  manager: EntityManager,
  rows: CategorySubcategoryRow[],
  apply: boolean,
  shared?: {
    cache: Map<string, CachedCategory>;
    usedSlugs: Set<string>;
    usedRefIds: Set<string>;
  },
): Promise<Pick<CategoryImportSummary, 'roots' | 'subCategories'>> => {
  const cache = shared?.cache ?? (await loadCategoryCache(manager));
  const usedSlugs =
    shared?.usedSlugs ??
    new Set(
      (await manager.getRepository(CategoryEntity).find({ select: { slug: true } })).map(
        (row) => row.slug,
      ),
    );
  const usedRefIds =
    shared?.usedRefIds ??
    new Set(
      (await manager.getRepository(CategoryEntity).find({ select: { refId: true } })).map(
        (row) => row.refId,
      ),
    );

  const roots = emptyCounters();
  const subCategories = emptyCounters();

  for (const row of rows) {
    const rootResult = await findOrCreateCategory(manager, cache, usedSlugs, usedRefIds, roots, {
      name: row.rootName,
      parent: null,
      apply,
    });

    for (const subName of row.subCategoryNames) {
      await findOrCreateCategory(manager, cache, usedSlugs, usedRefIds, subCategories, {
        name: subName,
        parent: rootResult.category,
        apply,
      });
    }
  }

  console.log(
    `[CategorySub] roots insert=${roots.inserted} skip=${roots.skipped} ` +
      `subs insert=${subCategories.inserted} skip=${subCategories.skipped}`,
  );

  return { roots, subCategories };
};

export const processSubSubCategorySheet = async (
  manager: EntityManager,
  rows: SubSubCategoryRow[],
  apply: boolean,
  shared?: {
    cache: Map<string, CachedCategory>;
    usedSlugs: Set<string>;
    usedRefIds: Set<string>;
  },
): Promise<Pick<CategoryImportSummary, 'subCategories' | 'subSubCategories'>> => {
  const cache = shared?.cache ?? (await loadCategoryCache(manager));
  const usedSlugs =
    shared?.usedSlugs ??
    new Set(
      (await manager.getRepository(CategoryEntity).find({ select: { slug: true } })).map(
        (row) => row.slug,
      ),
    );
  const usedRefIds =
    shared?.usedRefIds ??
    new Set(
      (await manager.getRepository(CategoryEntity).find({ select: { refId: true } })).map(
        (row) => row.refId,
      ),
    );

  const subCategories = emptyCounters();
  const subSubCategories = emptyCounters();

  for (const row of rows) {
    const root = findRootByName(cache, row.rootName);
    if (!root) {
      subCategories.warnings += 1;
      console.warn(
        `[SubSub] warning: root "${row.rootName}" not found for sub "${row.subCategoryName}"`,
      );
      continue;
    }

    let subCategory = findChildUnderRoot(cache, root, row.subCategoryName);
    if (!subCategory) {
      const created = await findOrCreateCategory(
        manager,
        cache,
        usedSlugs,
        usedRefIds,
        subCategories,
        {
          name: row.subCategoryName,
          parent: root,
          apply,
        },
      );
      subCategory = created.category;
    } else {
      subCategories.skipped += 1;
    }

    for (const subSubName of row.subSubCategoryNames) {
      await findOrCreateCategory(manager, cache, usedSlugs, usedRefIds, subSubCategories, {
        name: subSubName,
        parent: subCategory,
        apply,
      });
    }
  }

  console.log(
    `[SubSub] subs insert=${subCategories.inserted} skip=${subCategories.skipped} ` +
      `warnings=${subCategories.warnings} subSubs insert=${subSubCategories.inserted} ` +
      `skip=${subSubCategories.skipped}`,
  );

  return { subCategories, subSubCategories };
};

export class CategoryImportService {
  async run(options: CategoryImportOptions): Promise<CategoryImportSummary> {
    const { files, apply, categorySubSheet, subSubSubSheet } = options;

    console.log(`[CategoryImport] mode=${apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`[CategoryImport] categorySubcategory=${files.categorySubcategory}`);
    console.log(`[CategoryImport] subSubSubCategory=${files.subSubSubCategory}`);

    const categorySubRows = await readCategorySubcategorySheet(
      files.categorySubcategory,
      categorySubSheet,
    );
    const subSubRows = await readSubSubCategorySheet(files.subSubSubCategory, subSubSubSheet);

    console.log(
      `[CategoryImport] parsed rows categorySub=${categorySubRows.length} subSub=${subSubRows.length}`,
    );

    const { AppDataSource } = await import('../data-source');
    if (!AppDataSource.isInitialized) {
      throw new Error('AppDataSource is not initialized');
    }

    const summary = await AppDataSource.transaction(async (manager) => {
      const cache = await loadCategoryCache(manager);
      const usedSlugs = new Set(
        (await manager.getRepository(CategoryEntity).find({ select: { slug: true } })).map(
          (row) => row.slug,
        ),
      );
      const usedRefIds = new Set(
        (await manager.getRepository(CategoryEntity).find({ select: { refId: true } })).map(
          (row) => row.refId,
        ),
      );
      const shared = { cache, usedSlugs, usedRefIds };

      const sheet1 = await processCategorySubcategorySheet(
        manager,
        categorySubRows,
        apply,
        shared,
      );
      const sheet2 = await processSubSubCategorySheet(manager, subSubRows, apply, shared);

      return {
        roots: sheet1.roots,
        subCategories: {
          inserted: sheet1.subCategories.inserted + sheet2.subCategories.inserted,
          skipped: sheet1.subCategories.skipped + sheet2.subCategories.skipped,
          warnings: sheet2.subCategories.warnings,
        },
        subSubCategories: sheet2.subSubCategories,
      } satisfies CategoryImportSummary;
    });

    printCategoryImportSummary(summary);
    if (!apply) {
      console.log('Dry-run only. Re-run with --apply to write changes.');
    }

    return summary;
  }
}
