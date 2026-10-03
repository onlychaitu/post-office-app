# Post Office Shipment Management

Angular + Node.js (Express) + PostgreSQL application for managing shipments (letters and
packages) between post offices identified by ZIP code.

**Features**

- Register shipments (letter or package, weight category, origin and destination post office).
  Every shipment gets a unique shipment number.
- Move a shipment through its lifecycle: *received at origin* → *received at destination* → *delivered*.
  Every step is recorded in a status history.
- Shipments grid with server-side paging, sorting and filters (type, weight, status, origin,
  destination), plus an exact lookup by shipment number.
- Shipment detail page with the full status history timeline.
- Manage post offices (add, edit including the ZIP code, delete).

## Run with Docker

```bash
docker compose up --build
```

The first start takes a minute (images are built and the Angular dev server compiles).

| Service | URL |
|---|---|
| Web UI (Angular dev server) | http://localhost:4200 |
| API | http://localhost:3000/api (health: `/api/health`) |
| Postgres | `localhost:5433` (user / password / db: `postoffice`) |

On first start the database is created and filled with **8 post offices and 30 demo
shipments** in all three statuses, so every screen has something to show. Migrations run
automatically when the API starts.

To start over with a fresh database:

```bash
docker compose down -v && docker compose up --build
```

## Run without Docker for the apps (development)

Only the database runs in Docker; the API and the UI run on your machine with live reload:

```bash
docker compose up -d db
cd backend  && npm install && npm run dev     # API on :3000
cd frontend && npm install && npm start       # UI on :4200 (proxies /api to :3000)
```

Requires Node.js 24+. The API reads `DATABASE_URL` (see `.env.example`); the default matches the
compose database.

## Tests

```bash
docker compose up -d db                        # the backend tests need Postgres
cd backend  && npm test                        # API integration tests (use their own `postoffice_test` database)
cd frontend && npm test -- --watch=false       # Angular unit tests
```

## Project layout

```
backend/    Express API (TypeScript), SQL migrations in backend/migrations
frontend/   Angular app (Angular Material)
docker-compose.yml   Postgres + API + Angular dev server
```

## Design notes

**Data model**

- `post_office` (id, zip_code, name, address): `zip_code` is unique and editable. Other tables
  reference the internal `id`, so changing a ZIP code touches one row. The API only exposes ZIP
  codes, never the internal ids.
- `shipment`: unique `shipment_number`, type, weight category, origin and destination office,
  current status, created/updated timestamps.
- `shipment_status_history`: one row per status change with the office where it happened
  (origin office for the first step, destination office for the next two) and a timestamp.
- Types, weight categories and statuses are application-managed enums stored as `varchar`
  (guarded by `CHECK` constraints).

**Shipment numbers** come from a database sequence (`SHP-0000000001`, …), so they are unique by
construction, with no collision handling in application code. They are sequential and therefore
guessable; the app has no customer-facing tracking, so this was accepted as a trade-off.

**Status changes** are strictly one step forward and never skipped or reversed. The status update
and its history row are written in one transaction, and the shipment row is locked while that
happens. The advance endpoint also accepts an `expectedStatus`, which the UI always sends: if
someone else already advanced the shipment, the request is rejected with 409 instead of silently
skipping a step.

**Deleting a post office** deletes the shipments sent from or to it, together with their history
(`ON DELETE CASCADE`). The UI asks for confirmation and states how many shipments are affected.

**Indexes** are kept basic: the primary keys and unique constraints, the foreign key columns
(Postgres does not index those by itself), `created_at` for the default sort, and `current_status`
for the status filter.

**Demo data** lives in the last migration (`backend/migrations/*_seed-demo-shipments.sql`) and only
runs when there are no shipments yet. Leave it out of a production deployment.

## API overview

All endpoints are under `/api`. Errors use `{ "error": "..." }`, with `details` per field for
validation failures (400); 404 means not found, 409 a conflict.

| Method | Path | |
|---|---|---|
| GET | `/shipments` | Paged list. Query: `page`, `pageSize`, `sort` (`createdAt`\|`shipmentNumber`), `order`, `shipmentNumber`, `type`, `weightCategory`, `status`, `originZip`, `destinationZip`. Returns `{ items, total, page, pageSize }` |
| POST | `/shipments` | Create (`type`, `weightCategory`, `originZip`, `destinationZip`) |
| GET | `/shipments/:shipmentNumber` | Shipment with its status history |
| POST | `/shipments/:shipmentNumber/advance` | Move to the next status (optional `{ expectedStatus }`) |
| DELETE | `/shipments/:shipmentNumber` | Delete shipment and history |
| GET | `/post-offices` | List (`?search=` on ZIP code or name) |
| GET | `/post-offices/:zip` | One office, including `shipmentCount` |
| POST | `/post-offices` | Create (`zipCode`, `name`, `address`) |
| PUT | `/post-offices/:zip` | Update all fields, including the ZIP code |
| DELETE | `/post-offices/:zip` | Delete (cascades as described above) |
