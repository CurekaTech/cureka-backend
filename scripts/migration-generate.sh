#!/usr/bin/env bash
# Generate a new TypeORM migration
# Usage: ./scripts/migration-generate.sh AddMyFeature

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <MigrationName>"
  exit 1
fi

NAME=$1
npx ts-node -r tsconfig-paths/register \
  ./node_modules/typeorm/cli.js migration:generate \
  -d apps/api/src/database/data-source.ts \
  "apps/api/src/database/migrations/$NAME"
