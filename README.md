# DITZ Fashion Store

DITZ is a full-stack, JavaScript fashion store. It includes a React storefront, Node/Express API, PostgreSQL data model with Prisma migrations, customer accounts, saved shipping addresses, product administration, order management, WhatsApp order handoff, and server-side Paystack checkout.

GitHub stores and builds the source; it does not host the PostgreSQL database or run the Express server. Deploy the app to a Node.js host and configure a persistent PostgreSQL service before inviting customers to sign up or taking orders. GitHub Pages is not suitable for the account, database, admin, or payment features.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer, or a compatible managed PostgreSQL service
- A Paystack **test** secret key for online-checkout testing

## Local setup

1. Create a PostgreSQL database and a database user with access to it.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL connection string, for example `postgresql://<local-user>:<local-password>@localhost:5432/ditz_store?schema=public`. Create the database and local PostgreSQL user first. Change `SESSION_SECRET` to a long, random value (at least 32 characters). Keep `.env` private; it is ignored by Git.
4. Create the tables and load the example clothing catalogue:

   ```sh
   npm run db:generate
   npm run db:migrate:deploy
   npm run db:seed
   ```

   The seed adds example products and prices for demonstration. Replace or edit them in the DITZ Studio before launch.
5. Start the API and storefront together:

   ```sh
   npm run dev
   ```

   Open the Vite URL printed in the terminal. The Vite development server proxies `/api` requests to the Express server on port 5000.
6. Build and run the production app locally:

   ```sh
   npm run test
   npm run build
   npm start
   ```

   Set `NODE_ENV=production`, `CLIENT_URL` to the exact public website origin, and all server credentials in the hosting provider's environment settings.

## Store administrator

Create the first admin from an interactive terminal after the database tables are ready:

```sh
npm run admin:create -- admin@example.com ditzadmin
```

Enter the password at the hidden prompt. Use a unique password with at least 12 characters. The command hashes the password before saving it and does not create a public default admin account.

Then sign in at `/admin`. The DITZ Studio lets you:

- Publish new arrivals and hide products from the storefront.
- Edit product names, descriptions, images, categories, sizes, stock and prices.
- Add country-specific prices for the United States (USD), United Kingdom (GBP), Ghana (GHS), Kenya (KES), and South Africa (ZAR).
- Review customer orders and update fulfilment status.

Product prices entered in Studio are in major currency units. The server stores them as integer minor units. A product without a price for a selected country uses its NGN base price. For a consistent foreign-currency checkout, configure that country's price for every product that can be bought together.

## Customer accounts and shipping

Customers can register at `/account` with an email, username and password (minimum 10 characters), then sign in later with either their email or username. Passwords are hashed with bcrypt and the login session is held in a secure, HTTP-only cookie. Signed-in customers can save a shipping address and view their previous orders.

Customers explicitly supply the address; it is not inferred or collected from their IP address. Orders use the saved address and the server recalculates prices and checks stock before saving.

## Country pricing and IP suggestions

The storefront allows customers to choose a country. Nigeria (NGN) is the default. An address is required at checkout and the selected price country must match its shipping country.

IP geolocation is only used as a country **suggestion**, never as a user identity or an address. The API reads the `CF-IPCountry` header only when `TRUST_COUNTRY_HEADER=true`; enable this only when requests reach the application through Cloudflare, which sets the header. Otherwise Nigeria is the default and customers can choose their country manually. Other countries continue to use the NGN base price until country prices have been entered in the Studio.

## Checkout and inventory

- WhatsApp checkout creates a customer order on the server before opening a prepared message to the configured store WhatsApp number. The customer must still press **Send** in WhatsApp; opening the chat is not proof that it was sent or paid.
- Inventory is reserved when an order is created. If the customer abandons a WhatsApp order, an administrator can cancel it to release the reserved stock.
- Paystack checkout is currently limited to NGN orders. The secret key stays on the server; the server initializes checkout, then verifies payment reference, status, currency and exact amount. Signed Paystack webhooks can confirm payment if the browser return is interrupted.
- Keep Paystack in test mode until successful, failed, abandoned and webhook flows have all been tested. Only switch to live credentials after launch review.
- Delivery prices are not calculated automatically yet; DITZ confirms them with the customer before fulfilment.

## Environment variables

See `.env.example`. Important settings:

- `DATABASE_URL`: private PostgreSQL connection string.
- `SESSION_SECRET`: long random server-only signing secret.
- `CLIENT_URL`: exact public origin (required in production and used for origin checks).
- `PAYSTACK_SECRET_KEY`: server-only Paystack key; use `sk_test_...` during development.
- `PAYSTACK_CALLBACK_URL`: public `/payment/return` page for the deployed site.
- `WHATSAPP_PHONE_NUMBER`: store WhatsApp number in international digits, without `+`.
- `TRUST_COUNTRY_HEADER`: set `true` only behind Cloudflare.

Never add database credentials, session secrets, or Paystack secret keys to frontend variables such as `VITE_*`, source control, or screenshots.

## Local PostgreSQL and AWS DSQL

Local development connects directly to PostgreSQL on `localhost:5432`. It does not need AWS credentials, an IAM policy, or a DSQL auth token. Set the local PostgreSQL username, password, and database in your ignored `.env`.

AWS DSQL is a separate cloud database option. Its admin-connect token is short-lived (15 minutes), so do not save a generated token as a permanent `DATABASE_URL` password. The supplied AWS example uses the Node.js `pg` client directly; this application currently uses Prisma and is not yet wired to generate and refresh AWS DSQL tokens. Cloud use requires AWS SDK credentials with `dsql:DbConnectAdmin` permission and an AWS DSQL-compatible Prisma connection setup.

## GitHub and production deployment

The workflow in `.github/workflows/ci.yml` installs locked dependencies, generates Prisma Client, runs pricing tests, checks server syntax, and builds the site on pushes and pull requests.

For production:

1. Push the source to a GitHub repository.
2. Create a persistent managed PostgreSQL database and a Node.js 20+ host.
3. Set environment variables on the host; never commit a production `.env`.
4. Deploy with `npm ci`, `npm run db:generate`, and `npm run build`.
5. Apply committed migrations to the production database with `npm run db:migrate:deploy`. Create new migrations during development with `npm run db:migrate:dev -- --name descriptive_name`; review and commit the generated `prisma/migrations` files.
6. Run the initial product seed only if you want the example catalogue. Create an admin through a secure interactive terminal.
7. Register `https://YOUR-DOMAIN/api/webhooks/paystack` with Paystack, configure the callback URL, and verify the webhook in test mode.
8. Attach your domain and HTTPS, then smoke-test account signup, address saving, WhatsApp order creation/cancellation, and test-mode Paystack verification.
9. Switch to live Paystack credentials only after the test flows and launch checklist are approved.

This PostgreSQL migration project creates a new schema; it does not copy data from the previous MySQL database. Back up production data and review each migration before applying it.
