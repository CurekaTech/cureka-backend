/**
 * PM2 ecosystem for Cureka NestJS API (beta / production-style VM deploys).
 *
 * Why this file exists:
 * - Single source of truth for process name, entrypoint, cluster settings, and
 *   graceful-reload behaviour used by deploy-beta.sh / rollback.sh.
 * - `pm2 reload ecosystem.config.js --update-env` picks up env changes without
 *   a hard restart (near-zero downtime in cluster mode).
 *
 * Usage (on the Debian VM, from /var/www/Cureka-backend):
 *   pm2 start ecosystem.config.js --env beta
 *   pm2 reload ecosystem.config.js --update-env
 *   pm2 save
 */

'use strict';

const path = require('path');
const fs = require('fs');

/** Absolute app root — keeps cwd stable regardless of where `pm2` is invoked. */
const APP_ROOT = __dirname;

/**
 * Load KEY=VALUE pairs from .env into the PM2 `env` object.
 * PM2 does not natively parse dotenv files; this keeps Nest ConfigService happy
 * after `--update-env` without requiring a shell wrapper.
 */
function loadDotEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip matching single/double quotes around values.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const dotenvPath = path.join(APP_ROOT, '.env');
const fileEnv = loadDotEnv(dotenvPath);

/** Cluster worker count: override with PM2_INSTANCES (number or "max"). */
const instancesEnv = process.env.PM2_INSTANCES || fileEnv.PM2_INSTANCES || 'max';
const instances =
  instancesEnv === 'max' ? 'max' : Math.max(1, parseInt(instancesEnv, 10) || 2);

module.exports = {
  apps: [
    {
      // Stable name referenced by deploy/rollback scripts and `pm2 describe`.
      name: 'cureka-api',

      // Nest monorepo build output (nest-cli project "api").
      script: path.join(APP_ROOT, 'dist/apps/api/main.js'),

      // Ensure relative paths (uploads, secrets, .env) resolve from repo root.
      cwd: APP_ROOT,

      // Cluster = rolling reload across workers → near-zero downtime.
      exec_mode: 'cluster',
      instances,

      // Prefer IPv4 localhost health checks; Nest listens on 0.0.0.0 already.
      // Autorestart crashed workers; exponential backoff on flapping.
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,

      // Memory safety net for Node 22 + Nest heap growth under load.
      max_memory_restart: process.env.PM2_MAX_MEMORY || fileEnv.PM2_MAX_MEMORY || '1G',

      // Graceful reload: wait for process.send('ready') from main.ts.
      wait_ready: true,
      // Give Nest bootstrap (DB/Redis) enough time before PM2 kills the old worker.
      listen_timeout: 15000,
      // Allow in-flight requests to finish after SIGINT (enableShutdownHooks).
      kill_timeout: 8000,
      // Send SIGINT first so Nest shutdown hooks run (not SIGKILL).
      shutdown_with_message: true,

      // Merge .env + explicit defaults. `--update-env` refreshes these on reload.
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
      },

      // Optional named env for `pm2 start --env beta`.
      env_beta: {
        NODE_ENV: 'staging',
        ...fileEnv,
      },

      // Structured logs under ./logs (directory created by deploy script).
      out_file: path.join(APP_ROOT, 'logs/pm2-out.log'),
      error_file: path.join(APP_ROOT, 'logs/pm2-error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Avoid watching source in production — deploys are git-driven.
      watch: false,
      // Do not interpret source maps at runtime in prod workers.
      source_map_support: false,

      // Node 22 runtime flags — keep lean; add --heapsnapshot only when debugging.
      node_args: '--enable-source-maps',
    },
  ],
};
