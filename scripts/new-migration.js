const { execSync } = require('child_process');

const args = process.argv.slice(2).filter((a) => a !== '--');
const name = args[0];

if (!name) {
  console.error('Error: migration name is required.');
  console.error('Usage: npm run migration:new -- <MigrationName>');
  console.error('Example: npm run migration:new -- AddUserPhone');
  process.exit(1);
}

const path = `apps/api/database/migrations/${name}`;

console.log(`Generating migration: ${path}`);

try {
  execSync(
    `ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:generate -d apps/api/database/data-source.ts ${path}`,
    { stdio: 'inherit', shell: true },
  );
} catch (error) {
  // TypeORM exits with code 1 when no schema changes are found.
  // The message is already printed above via stdio: 'inherit'.
  process.exit(error.status ?? 1);
}
