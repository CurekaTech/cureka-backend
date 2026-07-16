import { EntityManager, IsNull } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { generateSlug } from '@packages/common/pagination.util';
import { HealthConcernEntity } from '../../../../modules/master/entities/health-concern.entity';
import { CategoryFilterEntity } from '../../../../modules/master/entities/category-filter.entity';
import { MasterStatus } from '../../../../modules/master/enums/master-status.enum';
import {
  CounterSummary,
  MasterImportSummary,
  expandArrayValues,
  hasMultiValueSeparators,
  isLikelyInvalidCategoryFilterValue,
  isLikelyInvalidHealthConcernName,
  mergeArrayValues,
  normalizeValue,
  printImportSummary,
  readFirstColumnValues,
  splitMultiValues,
  toLookupKey,
  uniqueIgnoreCase,
} from './master-import.helpers';

export const UPDATED_BY = 'master-data-import';

/** Category filter display names accepted for Preference. */
export const PREFERENCE_FILTER_NAMES = ['Preference'] as const;

/**
 * Formulation is a single category filter whose name includes a slash.
 * Prefer the full master name; keep a short alias as fallback.
 */
export const FORMULATION_FILTER_NAMES = [
  'Formulation / Product Form',
  'Formulation',
] as const;

export interface MasterImportFilePaths {
  healthConcern: string;
  preference: string;
  formulation: string;
}

export interface MasterImportOptions {
  files: MasterImportFilePaths;
  apply: boolean;
}

const emptyCounter = (): CounterSummary => ({ insertedOrAdded: 0, skipped: 0 });

const reserveUniqueSlug = (baseName: string, usedSlugs: Set<string>): string => {
  const base = generateSlug(baseName) || 'health-concern';
  if (!usedSlugs.has(base)) {
    usedSlugs.add(base);
    return base;
  }

  let suffix = 2;
  while (usedSlugs.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  const unique = `${base}-${suffix}`;
  usedSlugs.add(unique);
  return unique;
};

const findCategoryFilterByNames = async (
  manager: EntityManager,
  names: readonly string[],
): Promise<CategoryFilterEntity> => {
  const repo = manager.getRepository(CategoryFilterEntity);
  const candidates = await repo.find({ where: { deletedAt: IsNull() } });
  const byKey = new Map(candidates.map((filter) => [toLookupKey(filter.name), filter]));

  // Prefer names in the order provided (canonical name first).
  for (const name of names) {
    const match = byKey.get(toLookupKey(name));
    if (match) return match;
  }

  throw new Error(
    `Category filter not found. Expected one of: ${names.join(', ')}. ` +
      'Create the filter in master data before running this import.',
  );
};

/**
 * Health Concern sheet:
 * - split on `|` or `,` (`/` is not a separator)
 * - repair older rows that were saved as a single comma/pipe-joined name
 * - insert missing names (case-insensitive)
 * - preserve first-seen casing
 */
export const processHealthConcernSheet = async (
  manager: EntityManager,
  filePath: string,
  apply: boolean,
): Promise<CounterSummary> => {
  const rawRows = await readFirstColumnValues(filePath);
  const incoming = uniqueIgnoreCase(
    rawRows
      .flatMap((row) => splitMultiValues(row))
      .filter((name) => !isLikelyInvalidHealthConcernName(name)),
  );

  const repo = manager.getRepository(HealthConcernEntity);
  const existing = await repo.find({ withDeleted: false });
  const existingByKey = new Map(existing.map((row) => [toLookupKey(row.name), row]));
  const usedSlugs = new Set(existing.map((row) => row.slug));
  const usedRefIds = new Set(existing.map((row) => row.refId));

  const summary = emptyCounter();
  const toInsert: HealthConcernEntity[] = [];

  // Repair previously imported combined short labels: "A, B" / "A | B" → separate masters.
  const combinedRows = existing.filter((row) => hasMultiValueSeparators(row.name));
  // Soft-delete FAQ / prose rows that should never have been health concerns.
  const invalidExisting = existing.filter(
    (row) =>
      !hasMultiValueSeparators(row.name) && isLikelyInvalidHealthConcernName(row.name),
  );
  let repaired = 0;
  const toSoftDelete: HealthConcernEntity[] = [...invalidExisting];

  if (invalidExisting.length) {
    console.log(
      `[HealthConcern] removing ${invalidExisting.length} invalid FAQ/prose name(s) from previous import`,
    );
  }

  for (const row of combinedRows) {
    const parts = splitMultiValues(row.name).filter(
      (name) => !isLikelyInvalidHealthConcernName(name),
    );
    console.log(
      `[HealthConcern] repair combined name="${row.name}" → ${parts.map((p) => JSON.stringify(p)).join(', ')}`,
    );

    for (const name of parts) {
      if (existingByKey.has(toLookupKey(name))) continue;

      const slug = reserveUniqueSlug(name, usedSlugs);
      const refId = await generateUniqueRefId(name, async (candidate) => usedRefIds.has(candidate));
      usedRefIds.add(refId);

      const created = repo.create({
        name,
        slug,
        refId,
        description: null,
        icon: null,
        banner: null,
        status: MasterStatus.ACTIVE,
        inHomePage: false,
        createdBy: UPDATED_BY,
        updatedBy: UPDATED_BY,
      });
      toInsert.push(created);
      existingByKey.set(toLookupKey(name), created);
      repaired += 1;
    }

    toSoftDelete.push(row);
    existingByKey.delete(toLookupKey(row.name));
  }

  for (const row of invalidExisting) {
    existingByKey.delete(toLookupKey(row.name));
  }

  for (const name of incoming) {
    if (existingByKey.has(toLookupKey(name))) {
      summary.skipped += 1;
      continue;
    }

    const slug = reserveUniqueSlug(name, usedSlugs);
    const refId = await generateUniqueRefId(name, async (candidate) => usedRefIds.has(candidate));
    usedRefIds.add(refId);

    toInsert.push(
      repo.create({
        name,
        slug,
        refId,
        description: null,
        icon: null,
        banner: null,
        status: MasterStatus.ACTIVE,
        inHomePage: false,
        createdBy: UPDATED_BY,
        updatedBy: UPDATED_BY,
      }),
    );
    existingByKey.set(toLookupKey(name), toInsert[toInsert.length - 1]!);
    summary.insertedOrAdded += 1;
  }

  summary.insertedOrAdded += repaired;

  console.log(
    `[HealthConcern] parsed=${incoming.length} insert=${summary.insertedOrAdded - repaired} ` +
      `repaired=${repaired} removeInvalid=${invalidExisting.length} ` +
      `softDelete=${toSoftDelete.length} skip=${summary.skipped}`,
  );

  if (apply) {
    if (toInsert.length) {
      await repo.save(toInsert);
    }
    for (const row of toSoftDelete) {
      await repo.softDelete({ id: row.id });
    }
  }

  return summary;
};

/**
 * Merge sheet values into an existing category filter `values` text[].
 * Also expands any previously stored comma/pipe-joined values from earlier imports.
 */
const processCategoryFilterSheet = async (
  manager: EntityManager,
  options: {
    label: string;
    filePath: string;
    filterNames: readonly string[];
    /** Split cell text on `|` / `,` into multiple values. */
    splitRows: boolean;
    apply: boolean;
  },
): Promise<CounterSummary> => {
  const rawRows = await readFirstColumnValues(options.filePath);
  const incoming = uniqueIgnoreCase(
    (options.splitRows
      ? rawRows.flatMap((row) => splitMultiValues(row))
      : rawRows.map((row) => normalizeValue(row)).filter(Boolean)
    ).filter((value) => !isLikelyInvalidCategoryFilterValue(value)),
  );

  const filter = await findCategoryFilterByNames(manager, options.filterNames);
  const existingRaw = filter.values ?? [];
  const invalidExisting = existingRaw.filter((value) => isLikelyInvalidCategoryFilterValue(value));
  const combinedExisting = existingRaw.filter((value) => hasMultiValueSeparators(value));
  const cleanedExisting = existingRaw.filter(
    (value) => !isLikelyInvalidCategoryFilterValue(value),
  );
  const expandedExisting = expandArrayValues(cleanedExisting).filter(
    (value) => !isLikelyInvalidCategoryFilterValue(value),
  );

  if (invalidExisting.length) {
    console.log(
      `[${options.label}] removing ${invalidExisting.length} invalid FAQ/HTML/prose value(s) from previous import`,
    );
    for (const value of invalidExisting.slice(0, 15)) {
      console.log(`  - drop ${JSON.stringify(value).slice(0, 140)}`);
    }
    if (invalidExisting.length > 15) {
      console.log(`  ... and ${invalidExisting.length - 15} more`);
    }
  }

  if (combinedExisting.length) {
    console.log(
      `[${options.label}] repairing ${combinedExisting.length} combined value(s) in existing array:`,
    );
    for (const value of combinedExisting.slice(0, 20)) {
      console.log(
        `  - ${JSON.stringify(value)} → ${splitMultiValues(value)
          .map((part) => JSON.stringify(part))
          .join(', ')}`,
      );
    }
    if (combinedExisting.length > 20) {
      console.log(`  ... and ${combinedExisting.length - 20} more`);
    }
  }

  const { merged, added, skipped } = mergeArrayValues(expandedExisting, incoming);

  const beforeKeys = new Set(existingRaw.map(toLookupKey));
  const afterKeys = new Set(merged.map(toLookupKey));
  const arrayChanged =
    beforeKeys.size !== afterKeys.size ||
    [...afterKeys].some((key) => !beforeKeys.has(key)) ||
    [...beforeKeys].some((key) => !afterKeys.has(key));

  const standaloneBefore = new Set(
    cleanedExisting
      .filter((value) => !hasMultiValueSeparators(value))
      .map(toLookupKey),
  );
  const repairedCount = expandedExisting.filter(
    (value) => !standaloneBefore.has(toLookupKey(value)),
  ).length;
  const removedCount = invalidExisting.length;

  console.log(
    `[${options.label}] filter="${filter.name}" refId=${filter.refId} ` +
      `parsed=${incoming.length} add=${added.length} repaired=${repairedCount} ` +
      `removedInvalid=${removedCount} skip=${skipped.length} arrayChanged=${arrayChanged}`,
  );

  if (options.apply && arrayChanged) {
    await manager.getRepository(CategoryFilterEntity).update(
      { id: filter.id },
      {
        values: merged,
        updatedBy: UPDATED_BY,
      },
    );
  }

  return {
    insertedOrAdded: added.length + repairedCount,
    skipped: skipped.length + removedCount,
  };
};

export const processPreferenceSheet = (
  manager: EntityManager,
  filePath: string,
  apply: boolean,
): Promise<CounterSummary> =>
  processCategoryFilterSheet(manager, {
    label: 'Preference',
    filePath,
    filterNames: PREFERENCE_FILTER_NAMES,
    splitRows: true,
    apply,
  });

export const processFormulationSheet = (
  manager: EntityManager,
  filePath: string,
  apply: boolean,
): Promise<CounterSummary> =>
  processCategoryFilterSheet(manager, {
    label: 'Formulation',
    filePath,
    filterNames: FORMULATION_FILTER_NAMES,
    // Rows are usually single values; still split if a cell has `|` or `,`.
    splitRows: true,
    apply,
  });

/**
 * One-time master data import service.
 * Runs Health Concern + Preference + Formulation inside a single transaction when applying.
 */
export class MasterImportService {
  async run(options: MasterImportOptions): Promise<MasterImportSummary> {
    const { files, apply } = options;

    console.log(`[MasterImport] mode=${apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`[MasterImport] healthConcern=${files.healthConcern}`);
    console.log(`[MasterImport] preference=${files.preference}`);
    console.log(`[MasterImport] formulation=${files.formulation}`);

    // DataSource is injected by the runner after initialize().
    const { AppDataSource } = await import('../data-source');
    if (!AppDataSource.isInitialized) {
      throw new Error('AppDataSource is not initialized');
    }

    const execute = async (manager: EntityManager): Promise<MasterImportSummary> => {
      const healthConcerns = await processHealthConcernSheet(
        manager,
        files.healthConcern,
        apply,
      );
      const preference = await processPreferenceSheet(manager, files.preference, apply);
      const formulation = await processFormulationSheet(manager, files.formulation, apply);
      return { healthConcerns, preference, formulation };
    };

    const summary = await AppDataSource.transaction(async (manager) => execute(manager));

    printImportSummary(summary);
    if (!apply) {
      console.log('Dry-run only. Re-run with --apply to write changes.');
    }

    return summary;
  }
}
