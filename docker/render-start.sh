#!/bin/sh
set -eu

export APP_URL="${RENDER_EXTERNAL_URL:-${APP_URL:-http://localhost}}"

if ! php -r '$key = getenv("APP_KEY") ?: ""; if (str_starts_with($key, "base64:")) { $decoded = base64_decode(substr($key, 7), true); $key = $decoded === false ? "" : $decoded; } exit(strlen($key) === 32 ? 0 : 1);'; then
    export APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
fi

php artisan migrate --force
php artisan db:seed --force

exec php artisan serve --host 0.0.0.0 --port "${PORT:-10000}"
