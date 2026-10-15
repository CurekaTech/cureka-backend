#!/usr/bin/env node
import path from 'node:path';
import { runGit } from './lib/git.mjs';
import { REPO_ROOT } from './lib/build.mjs';
import { ReleaseNoteError } from './lib/errors.mjs';
import { describeEmailSettings, runMergedPullRequest } from './lib/pull-request.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new ReleaseNoteError('VALIDATION', `Missing ${name}.`);
  }
  return value;
}

async function main() {
  const event = {
    action: required('RELEASE_NOTE_ACTION'),
    merged: process.env.RELEASE_NOTE_MERGED === 'true',
    baseRef: required('RELEASE_NOTE_BASE_REF'),
    number: required('RELEASE_NOTE_PR_NUMBER'),
    title: process.env.RELEASE_NOTE_PR_TITLE || '',
    url: process.env.RELEASE_NOTE_PR_URL || '',
    headRef: process.env.RELEASE_NOTE_HEAD_REF || '',
    mergeCommitSha: required('RELEASE_NOTE_MERGE_SHA'),
    baseSha: process.env.RELEASE_NOTE_BASE_SHA || '',
    mergedAt: required('RELEASE_NOTE_MERGED_AT'),
    commitCount: process.env.RELEASE_NOTE_COMMIT_COUNT
      ? Number(process.env.RELEASE_NOTE_COMMIT_COUNT)
      : null,
  };
  const transport = {
    async sendMail(payload) {
      const nodemailer = await import('nodemailer');
      const createTransport = nodemailer.createTransport || nodemailer.default.createTransport;
      const settings = describeEmailSettings(process.env);
      return createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: settings.user
          ? { user: settings.user, pass: settings.password }
          : undefined,
      }).sendMail(payload);
    },
  };
  const result = await runMergedPullRequest({
    event,
    checkout: process.cwd(),
    repoRoot: REPO_ROOT,
    runGit,
    repository: process.env.GITHUB_REPOSITORY || 'local/cureka-backend',
    sentRecordPath: path.resolve(process.env.RELEASE_NOTE_SENT_RECORD || '.release-note-sent/record.json'),
    env: process.env,
    transport,
  });
  if (!result.generated) {
    const detail = result.email.error ? result.email.error.message : result.email.reason;
    console.error(`Release note was not generated: ${detail}`);
    process.exit(result.email.reason === 'generation-failed' ? 2 : 0);
  }
  console.log(`Playbook: ${result.files.docx}`);
  console.log(`Manifest: ${result.files.manifest}`);
  console.log(`Email draft: ${result.files.businessSummary || 'not written'}`);
  console.log(`Email status: ${result.email.reason}`);
  if (result.email.missing) console.log(`Missing configuration: ${result.email.missing.join(', ')}`);
  console.log('No deployment or migration was performed.');
}

main().catch((error) => {
  if (error instanceof ReleaseNoteError) {
    console.error(`${error.code}: ${error.message}`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});
