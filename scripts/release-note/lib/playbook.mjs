const BETA_ONLY = 'Documented for the beta environment only. Production command: TBD. Do not run this from the release-note tool.';

const BACKEND_BETA = {
  repositoryId: 'cureka-backend',
  environment: 'beta',
  production: 'TBD',
  branchDocumentedByScript: 'beta_development',
  processNames: ['cureka-backend', 'cureka-image-worker'],
  deploy: [
    'bash scripts/deploy-beta.sh',
    'npm ci',
    'npm run build',
    'npm run migration:run',
    'pm2 reload ecosystem.config.js --update-env',
  ],
  rollback: 'bash scripts/rollback.sh --sha <commit>',
  health: 'bash scripts/health-check.sh',
  healthDetail: 'scripts/health-check.sh polls GET /api/v1/health for HTTP 200. This does not prove the release is correct.',
  notes: [
    'scripts/deploy-beta.sh runs migrations before pm2 reload. That order is documented for beta, not a production approval.',
    'ecosystem.config.js defines cureka-image-worker with autostart false. Reload that process only when this release changes the image pipeline. Production process manager: TBD.',
    BETA_ONLY,
  ],
};

const FRONTEND_BETA = {
  repositoryId: 'cureka-frontend',
  environment: 'beta',
  production: 'TBD',
  branchDocumentedByScript: 'beta_development',
  processNames: ['cureka-frontend'],
  deploy: ['bash scripts/deploy-beta-frontend.sh'],
  rollback: 'bash scripts/rollback-frontend.sh --sha <commit>',
  health: 'Frontend beta health check is implemented in scripts/health-check.sh (GET /). Public production URL: TBD.',
  notes: [BETA_ONLY],
};

const ADMIN_BETA = {
  repositoryId: 'cureka-admin',
  environment: 'beta',
  production: 'TBD',
  branchDocumentedByScript: 'beta_development',
  processNames: ['cureka-admin'],
  deploy: ['See Cureka-Admin-Panel/.github/workflows/beta-deploy.yml. Production deploy command: TBD.'],
  rollback: 'TBD. No rollback script was found in the local admin checkout.',
  health: 'The beta workflow checks the admin login route on the beta host. Public production URL: TBD.',
  notes: [
    'Cloud project identifiers, service accounts, and server paths are intentionally omitted.',
    BETA_ONLY,
  ],
};

const DOCUMENTED = {
  'cureka-backend': BACKEND_BETA,
  'cureka-frontend': FRONTEND_BETA,
  'cureka-admin': ADMIN_BETA,
};

function hasCategory(changes, category) {
  return changes.some((change) => (change.categories || []).includes(category));
}

export function documentedDeployment(repositoryId) {
  return DOCUMENTED[repositoryId] || null;
}

export function buildDependencies(manifest, changes) {
  const selected = new Set(manifest.repositories.filter((repo) => repo.selected).map((repo) => repo.id));
  const dependencies = [...(manifest.dependencies || [])];
  const ids = new Set(dependencies.map((item) => item.id));

  if (selected.has('cureka-backend') && changes.some((change) => (change.migrations || []).length > 0 || (change.categories || []).includes('database-migration'))) {
    const id = 'backend-migration-before-reload';
    if (!ids.has(id)) {
      dependencies.push({
        id,
        confirmed: true,
        source: 'scripts/deploy-beta.sh documents migration:run before pm2 reload for beta.',
        statement: 'Apply backend database migrations before reloading the backend process. Production confirmation: TBD.',
        review: 'Confirm the migration down() path and whether a data backfill is required.',
      });
    }
  }

  if (selected.has('cureka-backend') && selected.has('cureka-frontend') && (hasCategory(changes, 'api-integration') || hasCategory(changes, 'customer-facing'))) {
    dependencies.push({
      id: 'backend-api-frontend-review',
      confirmed: false,
      source: 'Inferred because both repositories are selected and the backend diff touches API or customer-facing files.',
      statement: 'Review whether the website must deploy with the backend API change.',
      review: 'Human review required. Do not treat this as a confirmed deployment order.',
    });
  }

  if (selected.has('cureka-backend') && selected.has('cureka-admin') && (hasCategory(changes, 'api-integration') || hasCategory(changes, 'admin-operational'))) {
    dependencies.push({
      id: 'backend-api-admin-review',
      confirmed: false,
      source: 'Inferred because both repositories are selected and the backend diff touches API or admin files.',
      statement: 'Review whether the admin panel must deploy with the backend API change.',
      review: 'Human review required. Do not treat this as a confirmed deployment order.',
    });
  }

  return dependencies;
}

export function buildQaChecklist(manifest, changes) {
  if ((manifest.qaChecklist || []).length > 0) return manifest.qaChecklist;
  const selected = new Set(manifest.repositories.filter((repo) => repo.selected).map((repo) => repo.id));
  const items = [];
  const add = (id, area, steps) => {
    items.push({ id, area, steps, result: '', evidence: '', owner: '', timestamp: '', signOff: '' });
  };

  if (selected.has('cureka-backend')) {
    add('qa-api-health', 'API health', 'Call GET /api/v1/health and record the HTTP status. The existing beta helper is bash scripts/health-check.sh. Do not mark this passed unless a person or a recorded test result says so.');
    add('qa-api-contract', 'API response contracts', 'Exercise the endpoints touched by this release. Compare status codes and response fields with the agreed contract.');
  }
  if (hasCategory(changes, 'security-auth') || changes.some((change) => /auth|permission|guard/i.test(JSON.stringify(change.files || [])))) {
    add('qa-auth', 'Authentication and authorization', 'Sign in with an allowed account and with an account that must be denied. Confirm protected routes reject missing credentials.');
  }
  if (hasCategory(changes, 'customer-facing') || hasCategory(changes, 'api-integration')) {
    add('qa-catalog', 'Catalog and integrations', 'Check the customer or integration flow named in the change log, including an empty result and one successful result.');
  }
  if (changes.some((change) => (change.migrations || []).length > 0 || (change.categories || []).includes('database-migration'))) {
    add('qa-migrations', 'Database migrations', 'Confirm the migration file list matches apps/api/database/migrations. Verify the new schema on a non-production database before production. Record the migration name that ran.');
  }
  if (changes.some((change) => (change.environmentVariableNames || []).length > 0)) {
    add('qa-env', 'Configuration', 'Confirm each listed environment-variable name is present in the target environment. Do not copy values into this checklist.');
  }
  if (hasCategory(changes, 'workers-queues')) {
    add('qa-queues', 'Queues and background jobs', 'Confirm the affected BullMQ queue is connected and one representative job finishes. Queue names live in packages/queue/src/queue.constants.ts.');
  }
  if (selected.has('cureka-frontend')) {
    add('qa-frontend', 'Website', 'Run the website smoke path that depends on this release and record the result.');
  }
  if (selected.has('cureka-admin')) {
    add('qa-admin', 'Admin panel', 'Run the admin smoke path that depends on this release and record the result.');
  }
  add('qa-regression', 'Regression', 'Run the project test command that applies to the selected repositories. Record the command, the outcome, and who observed it. A test file in the diff is not a pass.');
  add('qa-business', 'Critical business flows', 'Walk the business flows the dev lead names for this release. Leave this blank until those flows are confirmed.');
  return items;
}

export function buildDeployment(manifest, changes) {
  if (manifest.deployment && manifest.deployment.confirmed === true) return manifest.deployment;
  const selected = manifest.repositories.filter((repo) => repo.selected);
  const environmentVariables = [...new Set(changes.flatMap((change) => change.environmentVariableNames || []))].map((name) => ({
    name,
    value: null,
  }));
  const migrations = [...new Set(changes.flatMap((change) => change.migrations || []))].map((file) => ({
    file,
    apply: 'npm run migration:run',
    revert: 'npm run migration:revert',
    note: 'migration:revert rolls back the last applied migration only. Confirm the down() path before relying on it. Do not run either command from this tool.',
  }));

  const sequence = [];
  selected.forEach((repo, index) => {
    const documented = documentedDeployment(repo.id);
    sequence.push({
      order: index + 1,
      repositoryId: repo.id,
      sourceBranch: repo.sourceBranch || 'TBD',
      productionBranch: repo.productionBranch || 'TBD',
      range: repo.range || 'TBD',
      instruction: documented
        ? `Beta documentation exists for ${repo.id}. Production deployment steps are TBD.`
        : `No deployment documentation is configured for ${repo.id}. Owner: TBD.`,
      documentedBetaCommands: documented ? documented.deploy : [],
      rollback: documented ? documented.rollback : 'TBD',
      health: documented ? documented.health : 'TBD',
      notes: documented ? documented.notes : ['TBD'],
      crossRepoOrderConfirmed: false,
    });
  });

  return {
    confirmed: false,
    prerequisites: [
      'Dev lead, QA owner, and required approvers sign this playbook.',
      'Comparison ranges in the manifest match the commits intended for release.',
      'Production branch, production host, and production commands marked TBD are confirmed by the owner.',
    ],
    environmentVariables,
    migrations,
    sequence,
    restart: selected.some((repo) => repo.id === 'cureka-backend')
      ? 'Beta API reload is pm2 reload ecosystem.config.js --update-env. Image worker process cureka-image-worker stays off unless this release includes the image pipeline. Production restart command: TBD.'
      : 'TBD',
    rollbackLimitations: 'A generated rollback command is documentation, not authorization to run it. Database restores are TBD. migration:revert is not a full database recovery procedure.',
  };
}

export function unresolvedQuestions(manifest) {
  const questions = [...(manifest.unresolvedQuestions || [])];
  const add = (question) => {
    if (!questions.includes(question)) questions.push(question);
  };
  for (const repo of manifest.repositories.filter((item) => item.selected)) {
    if (!repo.sourceBranch || repo.sourceBranch === 'TBD') add(`Confirm the source branch for ${repo.id}.`);
    if (!repo.productionBranch || repo.productionBranch === 'TBD') add(`Confirm the production branch for ${repo.id}.`);
    if (!repo.localCheckoutPath || repo.localCheckoutPath === 'TBD') {
      add(`Confirm the local checkout path for ${repo.id} before the next Git refresh.`);
    }
  }
  if ((manifest.deployment && manifest.deployment.confirmed) !== true) {
    add('Confirm production deployment and rollback commands. Beta script names are not production approval.');
  }
  for (const approver of manifest.approvers || []) {
    if (!approver.name || approver.name === 'TBD') add(`Name the approver for role ${approver.role}.`);
  }
  if (!manifest.qaOwner || manifest.qaOwner.name === 'TBD') add('Name the QA owner.');
  return questions;
}
