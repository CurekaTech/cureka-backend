#!/usr/bin/env bash
# Start local dev environment (Postgres + Redis)
set -e
echo "Starting local dev services..."
docker-compose -f docker-compose.dev.yml up -d
echo "Services ready. Run 'npm run dev' to start the API."
