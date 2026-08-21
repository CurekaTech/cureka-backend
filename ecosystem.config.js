/**
 * PM2 ecosystem for Cureka NestJS API (beta VM).
 *
 * Usage (from repo root):
 *   pm2 start ecosystem.config.js
 *   pm2 reload ecosystem.config.js --update-env
 *
 * Nest ConfigModule loads `.env` from cwd; NODE_ENV is set here for production.
 */

'use strict';

module.exports = {
  apps: [
    {
      name: 'cureka-backend',
      cwd: __dirname,
      script: 'dist/apps/api/main.js',

      exec_mode: 'cluster',
      instances: 2,

      // Paired with process.send('ready') in apps/api/main.ts
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,

      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Refreshed by: pm2 reload ecosystem.config.js --update-env
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'beta',
      },

      // Pino writes NDJSON to the process stdout/stderr. Do not set
      // log_date_format — PM2 would prefix each line and break JSON parsing
      // for the GCP Ops Agent. These files are PM2 captures of that stream,
      // not an application-level file logger.
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
    },
  ],
};
