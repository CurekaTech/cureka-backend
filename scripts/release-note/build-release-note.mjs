#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildReleaseNote } from './lib/build.mjs';
import { ReleaseNoteError } from './lib/errors.mjs';

function usage() {
  return [
    'Usage: npm run release-note:build -- --input <release.json> [--refresh] [--collect] [--allow-fetch]',
    '',
    'Writes reports/releases/<release-id>/vN/release-note.docx,',
    'business-summary.txt when a business summary is present, and manifest.json.',
    'Does not deploy, migrate, send email, or modify Git history.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { collect: false, refresh: false, allowFetch: false, input: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--collect') options.collect = true;
    else if (arg === '--allow-fetch') options.allowFetch = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new ReleaseNoteError('VALIDATION', `Unknown argument ${arg}.\n${usage()}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    console.error(usage());
    process.exit(options.help ? 0 : 1);
  }
  const inputPath = path.resolve(options.input);
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const result = await buildReleaseNote(raw, {
    collect: options.collect,
    refresh: options.refresh,
    allowFetch: options.allowFetch,
  });
  console.log(`Release: ${result.manifest.releaseId}`);
  console.log(`Status: ${result.manifest.status}`);
  console.log(`Risk: ${result.manifest.risk.level}`);
  console.log(`Playbook: ${result.files.docx}`);
  console.log(`Manifest: ${result.files.manifest}`);
  console.log(`Email draft: ${result.files.businessSummary || 'not requested'}`);
  console.log('No deployment, migration, email, or Git write was performed.');
  if ((result.manifest.unresolvedQuestions || []).length > 0) {
    console.log('Unresolved questions:');
    for (const question of result.manifest.unresolvedQuestions) console.log(`- ${question}`);
  }
}

main().catch((error) => {
  if (error instanceof ReleaseNoteError) {
    console.error(`${error.code}: ${error.message}`);
    process.exit(error.code === 'VALIDATION' || error.code === 'UNKNOWN_PLACEHOLDER' ? 1 : 2);
  }
  console.error(error);
  process.exit(1);
});
