#!/bin/sh
set -eu

if [ -z "${DB_URL:-}" ] || [ "${DB_CONNECTION:-}" != "pgsql" ]; then
    echo "Set DB_CONNECTION=pgsql and DB_URL to the Railway PostgreSQL DATABASE_URL reference." >&2
    exit 1
fi

if ! php -r '$key = getenv("APP_KEY") ?: ""; if (str_starts_with($key, "base64:")) { $decoded = base64_decode(substr($key, 7), true); $key = $decoded === false ? "" : $decoded; } exit(strlen($key) === 32 ? 0 : 1);'; then
    echo "Set APP_KEY to a valid Laravel key in Railway Variables." >&2
    exit 1
fi

if [ -z "${APP_URL:-}" ]; then
    if [ -z "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
        echo "Generate a Railway public domain or set APP_URL." >&2
        exit 1
    fi
    export APP_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
fi

PORT="${PORT:-8080}"
case "$PORT" in
    ''|*[!0-9]*)
        echo "PORT must be a numeric port." >&2
        exit 1
        ;;
esac

sed -i "s/8080/${PORT}/g" /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf

runuser -u www-data -- php artisan migrate --force

exec apache2-foreground
