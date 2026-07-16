/**
 * One-time master data import from Excel → PostgreSQL.
 *
 * Sheets / files:
 *   Health-Concern.xlsx     → health_concerns (split on `|` or `,`)
 *   CF_Preference.xlsx      → category_filters.name = "Preference" (merge values[], split on `|` or `,`)
 *   CF_Formulation.xlsx     → category_filters.name = "Formulation / Product Form" (merge values[], split on `|` or `,`)
 *
 * Usage:
 *   npm run master-data:import
 *   npm run master-data:import -- --apply
 *   npm run master-data:import -- --dir="docs/Master-Data-Sheets" --apply
 *
 * Without --apply the script is dry-run only (no DB writes).
 */
import 'reflect-metadata';
import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { MasterImportService } from './master-import.service';

const DEFAULT_DIR = 'docs/Master-Data-Sheets';

const DEFAULT_FILES = {
  healthConcern: 'Health-Concern.xlsx',
  preference: 'CF_Preference.xlsx',
  formulation: 'CF_Formulation.xlsx',
} as const;

interface CliOptions {
  dir: string;
  healthConcern?: string;
  preference?: string;
  formulation?: string;
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
Master data importer (Health Concerns + CF Preference + CF Formulation)

Options:
  --dir <path>                 Folder containing the three XLSX files (default: ${DEFAULT_DIR})
  --health-concern <path>      Override Health Concern workbook path
  --preference <path>          Override Preference workbook path
  --formulation <path>         Override Formulation workbook path
  --apply                      Write changes (without this flag, dry-run only)

Rules:
  - "|" always splits multi-values; "," splits short label lists only
  - "/" is NOT a separator; long prose / ingredient lists are left intact
  - Re-running --apply also repairs previously joined Preference/Formulation values
  - Case-insensitive de-dupe; existing casing is preserved
  - Entire import runs in one DB transaction
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
    } else if (arg.startsWith('--health-concern=')) {
      options.healthConcern = arg.slice('--health-concern='.length);
    } else if (arg === '--health-concern' && next) {
      options.healthConcern = next;
      index += 1;
    } else if (arg.startsWith('--preference=')) {
      options.preference = arg.slice('--preference='.length);
    } else if (arg === '--preference' && next) {
      options.preference = next;
      index += 1;
    } else if (arg.startsWith('--formulation=')) {
      options.formulation = arg.slice('--formulation='.length);
    } else if (arg === '--formulation' && next) {
      options.formulation = next;
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
    healthConcern: resolvePath(
      dir,
      cli.healthConcern ?? DEFAULT_FILES.healthConcern,
    ),
    preference: resolvePath(dir, cli.preference ?? DEFAULT_FILES.preference),
    formulation: resolvePath(dir, cli.formulation ?? DEFAULT_FILES.formulation),
  };

  assertFile('Health Concern', files.healthConcern);
  assertFile('Preference', files.preference);
  assertFile('Formulation', files.formulation);

  await AppDataSource.initialize();
  try {
    const service = new MasterImportService();
    await service.run({ files, apply: cli.apply });
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error: unknown) => {
  console.error('[MasterImport] failed:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
