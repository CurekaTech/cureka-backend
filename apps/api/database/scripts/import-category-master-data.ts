/**
 * Category hierarchy import from Excel → PostgreSQL `categories` table.
 *
 * Files:
 *   Category - Subcategory.xlsx  → ROOT + CHILD (Main Category + Sub category)
 *   Sub-Sub-Sub-Category.xlsx    → CHILD + GRANDCHILD (Sub category + Sub Sub Category)
 *
 * Usage:
 *   npm run category-master:import
 *   npm run category-master:import -- --apply
 *   npm run category-master:import -- --dir="docs/Master-Data-Sheets" --apply
 */
import 'reflect-metadata';
import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { CategoryImportService } from './category-import.service';

const DEFAULT_DIR = 'docs/Master-Data-Sheets';

const DEFAULT_FILES = {
  categorySubcategory: 'Category - Subcategory.xlsx',
  subSubSubCategory: 'Sub-Sub-Sub-Category.xlsx',
} as const;

interface CliOptions {
  dir: string;
  categorySubcategory?: string;
  subSubSubCategory?: string;
  categorySubSheet?: string;
  subSubSubSheet?: string;
  apply: boolean;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    dir: DEFAULT_DIR,
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(`
Category hierarchy importer

Options:
  --dir <path>                     Folder with the two XLSX files (default: ${DEFAULT_DIR})
  --category-sub <path>            Override Category - Subcategory workbook
  --sub-sub-sub <path>             Override Sub-Sub-Sub-Category workbook
  --category-sub-sheet <name>      Worksheet name for category/sub sheet (default: first sheet)
  --sub-sub-sub-sheet <name>       Worksheet name for sub-sub sheet (default: first sheet)
  --apply                          Write changes (without this flag, dry-run only)

Hierarchy:
  Sheet 1 → ROOT (Main Category) + CHILD (Sub category)
  Sheet 2 → CHILD (Sub category) + GRANDCHILD (Sub Sub Category) under section Main Category
`);
      process.exit(0);
    }

    if (arg === '--apply') {
      options.apply = true;
    } else if (arg.startsWith('--dir=')) {
      options.dir = arg.slice('--dir='.length);
    } else if (arg === '--dir' && next) {
      options.dir = next;
      index += 1;
    } else if (arg.startsWith('--category-sub=')) {
      options.categorySubcategory = arg.slice('--category-sub='.length);
    } else if (arg === '--category-sub' && next) {
      options.categorySubcategory = next;
      index += 1;
    } else if (arg.startsWith('--sub-sub-sub=')) {
      options.subSubSubCategory = arg.slice('--sub-sub-sub='.length);
    } else if (arg === '--sub-sub-sub' && next) {
      options.subSubSubCategory = next;
      index += 1;
    } else if (arg.startsWith('--category-sub-sheet=')) {
      options.categorySubSheet = arg.slice('--category-sub-sheet='.length);
    } else if (arg === '--category-sub-sheet' && next) {
      options.categorySubSheet = next;
      index += 1;
    } else if (arg.startsWith('--sub-sub-sub-sheet=')) {
      options.subSubSubSheet = arg.slice('--sub-sub-sub-sheet='.length);
    } else if (arg === '--sub-sub-sub-sheet' && next) {
      options.subSubSubSheet = next;
      index += 1;
    }
  }

  return options;
};

const resolvePath = (baseDir: string, relativeOrAbsolute: string): string => {
  if (isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  const fromDir = resolve(baseDir, relativeOrAbsolute);
  if (existsSync(fromDir)) return fromDir;
  const fromCwd = resolve(relativeOrAbsolute);
  if (existsSync(fromCwd)) return fromCwd;
  return fromDir;
};

const assertFile = (label: string, filePath: string): void => {
  if (!existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }
};

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const dir = resolve(cli.dir);

  const files = {
    categorySubcategory: resolvePath(
      dir,
      cli.categorySubcategory ?? DEFAULT_FILES.categorySubcategory,
    ),
    subSubSubCategory: resolvePath(dir, cli.subSubSubCategory ?? DEFAULT_FILES.subSubSubCategory),
  };

  assertFile('Category - Subcategory', files.categorySubcategory);
  assertFile('Sub-Sub-Sub-Category', files.subSubSubCategory);

  await AppDataSource.initialize();
  try {
    const service = new CategoryImportService();
    await service.run({
      files,
      apply: cli.apply,
      categorySubSheet: cli.categorySubSheet,
      subSubSubSheet: cli.subSubSubSheet,
    });
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error: unknown) => {
  console.error('[CategoryImport] failed:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
