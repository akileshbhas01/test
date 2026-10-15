#!/bin/sh
set -eu

export APP_URL="${RENDER_EXTERNAL_URL:-${APP_URL:-http://localhost}}"

php artisan migrate --force
php artisan db:seed --force

exec php artisan serve --host 0.0.0.0 --port "${PORT:-10000}"
