<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## Deploying a no-cost demo on Render

The Render Blueprint and Dockerfile run this Laravel app with SQLite on Render's free web-service plan. It does not provision a paid database. Free instances can sleep when idle, and their local filesystem is ephemeral, so user/order data can disappear after a restart or redeploy. This setup is for a demo, not production or persistent customer data.

1. Open the [Render service](https://lemurra-traders-demo.onrender.com). The service is configured by the [Render Blueprint](https://dashboard.render.com/blueprint/exs-db88dvlg1s2s739efcgg).
2. Review the plan before confirming. Do not add a paid database, disk, or upgrade if you want to keep this deployment at $0.
3. The startup script generates a valid Laravel encryption key if one isn't configured, builds the app, runs migrations and the demo catalog seeder, then provides a public `onrender.com` URL.

To enable an admin login, add `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` as private environment variables in the Render service settings. The password must be at least 20 characters. An optional `DEMO_ADMIN_NAME` sets the display name. The startup seeder hashes the password and provisions that account; if either required variable is missing, it skips admin creation. Sign in from the site's Account page using the configured email and password. Never put the password in Git or send it in chat. Changing the password variable changes the account password at the next service restart/deploy. The old bundled admin password and demo-account credentials have been removed from the public app.

The public demo does not seed any bundled customer accounts. Do not import the local SQL dump: it contains customer and order records. Demo catalog data comes from `database/seeds_data.json`.

## Preparing Railway production with PostgreSQL

`railway.json` and `Dockerfile.railway` prepare a PHP/Apache deployment with PostgreSQL support. The Railway startup script requires a stable `APP_KEY`, `DB_CONNECTION=pgsql`, a `DB_URL` reference to the Railway PostgreSQL service, and a public domain. It runs migrations and serves the app with Apache; it does not create Railway services or set credentials.

After creating and funding Railway services yourself:

1. Create a PostgreSQL service and a web service from this repository. Set the web service's `DB_CONNECTION` to `pgsql` and `DB_URL` to a Railway reference such as `${{Postgres.DATABASE_URL}}` (use your actual PostgreSQL service name).
2. Add `APP_ENV=production`, `APP_DEBUG=false`, `APP_KEY`, `APP_URL`, `SESSION_DRIVER=database`, `CACHE_STORE=database`, `QUEUE_CONNECTION=sync`, and `LOG_CHANNEL=stderr` to the web service. Generate an application key with `php artisan key:generate --show` and set it directly in Railway; never commit or share it.
3. Add `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` (at least 20 characters) before initial seeding. Set Zoho SMTP variables and the active Razorpay variables described below directly in Railway's private Variables panel.
4. After the first successful deployment/migrations, run `php artisan db:seed --force` once from the web service shell to add the catalog, coupons, and configured admin. Do not rerun the seeder on an existing store: product seeding restores the initial stock values.
5. Generate a Railway public domain and set `APP_URL` to its HTTPS URL. Configure Razorpay automatic capture before accepting live payments.

This repository contains deployment configuration only. The Railway services, PostgreSQL database, domain, secrets, and any billing were not created or changed.

### Payments and order email

The Render Blueprint and the Railway instructions configure Zoho SMTP (`smtp.zoho.in`, SSL on port 465). Set `MAIL_MAILER=smtp`, `MAIL_HOST=smtp.zoho.in`, `MAIL_PORT=465`, `MAIL_ENCRYPTION=ssl`, `MAIL_USERNAME=admin@lemurra.in`, `MAIL_FROM_ADDRESS=admin@lemurra.in`, `MAIL_FROM_NAME="Lemurra Traders"`, and `ORDER_NOTIFICATION_EMAIL=admin@lemurra.in`. Set the rotated Zoho app password as `MAIL_PASSWORD` directly in the hosting provider's private environment settings; never put credentials in Git or chat. Alternatively use port 587 with `MAIL_ENCRYPTION=tls` if required by the provider.

Set `RAZORPAY_KEY` and `RAZORPAY_SECRET` using an active Razorpay key pair in the hosting provider's private environment settings. The key ID is exposed to the browser for Checkout; the secret must remain server-side. Payment verification requires a valid signature and a Razorpay payment marked captured with the matching INR amount and order ID. Missing or invalid gateway configuration fails payment rather than simulating success. After changing credentials, redeploy/restart the service so Laravel reloads its configuration.

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

You may also try the [Laravel Bootcamp](https://bootcamp.laravel.com), where you will be guided through building a modern Laravel application from scratch.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com/)**
- **[Tighten Co.](https://tighten.co)**
- **[WebReinvent](https://webreinvent.com/)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel/)**
- **[Cyber-Duck](https://cyber-duck.co.uk)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Jump24](https://jump24.co.uk)**
- **[Redberry](https://redberry.international/laravel/)**
- **[Active Logic](https://activelogic.com)**
- **[byte5](https://byte5.de)**
- **[OP.GG](https://op.gg)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
