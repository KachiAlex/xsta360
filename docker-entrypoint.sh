#!/bin/sh
set -e

# Wait for the database to be ready
echo "Waiting for database..."
until pg_isready -h db -U xsta360 -d xsta360 2>/dev/null; do
  sleep 1
done
echo "Database is ready."

# Run migrations (force flag to skip interactive prompts in non-TTY)
echo "Running database migrations..."
npx drizzle-kit push --force --config=drizzle.config.ts 2>&1 || {
  echo "drizzle-kit push failed, trying with yes pipe..."
  yes | npx drizzle-kit push --config=drizzle.config.ts 2>&1
}

echo "Migrations complete. Starting app..."
exec "$@"
