# Internal Operations Service Hub

v0.3 is a narrow full-stack Service Request flow: a React frontend, a NestJS API, and TypeORM persistence in SQLite. Employees submit and track requests; department staff can claim requests in their own department. The API owns validation, authorization, lifecycle rules, and append-only status history.

## Repository

```text
backend/   NestJS API, TypeORM entities, SQLite database, unit/integration/E2E tests
frontend/  React + Vite request dashboard
docs/      product, architecture, data model, workflow, and v0.3 delivery contract
decisions/ architecture decision records
```

## Prerequisites

Node.js 20+ and npm.

## Install and run

Start the API:

```bash
cd backend
npm install
npm run start:dev
```

The API runs at `http://localhost:3000` and creates `backend/service-hub.sqlite` automatically. Set `DB_PATH` to change the database location.

In a second terminal, start the web app:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. Use **New request** to submit a request. The list and detail panel are backed by the API, not browser-only state.

## API contract

The API uses explicit identity headers for this slice:

```text
x-user-id       actor identifier
x-user-role     employee | staff | admin
x-department-id required for staff/admin requests
```

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | `/requests` | Validate and persist a request as `SUBMITTED` |
| GET | `/requests` | Employee's own requests or staff department queue |
| GET | `/requests/:id` | Read one authorized request |
| GET | `/requests/:id/history` | Read append-only status history |
| PATCH | `/requests/:id/status` | Apply `SUBMITTED -> ASSIGNED -> IN_PROGRESS` |

Example submission:

```bash
curl -X POST http://localhost:3000/requests -H "Content-Type: application/json" -H "x-user-id: employee-1" -H "x-user-role: employee" -d "{\"title\":\"Laptop issue\",\"description\":\"It will not boot\",\"category\":\"Hardware\",\"priority\":\"High\",\"departmentId\":\"IT\",\"createdBy\":\"employee-1\"}"
```

For the complete request/response contract, authorization rule, and intentional failures, read [docs/week3-full-stack-delivery.md](docs/week3-full-stack-delivery.md).

## Tests and builds

```bash
cd backend
npm test                 # business rule + SQLite persistence integration
npm run test:e2e         # HTTP E2E flow, authorization, invalid input
npm run build            # NestJS production build

cd ../frontend
npm run build            # React/Vite production build
```

The automated coverage includes one allowed authorization case, one denied cross-department case, invalid request rejection, expected `401/403/404/400` failures, a business-rule test, a database integration test, an E2E test, and regression protection for the original lifecycle transitions.

## Product context

See [docs/product-spec.md](docs/product-spec.md), [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md), and [docs/workflow.md](docs/workflow.md).

Author: Gaelle — AI Academy 2026
# Internal Operations Service Hub

A company-internal system for requesting and tracking help from departments such as IT, HR, and Finance. Employees submit requests to the right department, follow their status, and communicate with whoever is resolving them — replacing scattered emails, chat messages, and hallway conversations.

**Status:** early backend — the request lifecycle API is implemented (no UI, no authentication yet).

## Repository structure

```
docs/
  product-spec.md      — the problem, requirements, and acceptance criteria
  architecture.md       — system components, data flow, trust boundaries, and key decisions
  data-model.md          — entities, relationships, lifecycle rules, storage, and access patterns
  workflow.md              — the request lifecycle business logic, as implemented in NestJS
decisions/
  ADR-001.md              — append-only history + relational vs. document database choice
backend/
  src/requests/              — NestJS module implementing the request lifecycle API
```

## How the docs connect

1. **`docs/product-spec.md`** defines *what* the system needs to do and for whom — the requirements, actors, and acceptance criteria.
2. **`docs/architecture.md`** takes those requirements and defines *how* the system is structured — its components, data flow, and trust boundaries — with each major decision traced back to a specific requirement.
3. **`docs/data-model.md`** defines *what the system remembers* — entities, relationships, lifecycle rules, and how data is stored and queried.
4. **`decisions/ADR-001.md`** records the reasoning behind the append-only history decision and the choice of a relational database (PostgreSQL).
5. **`docs/workflow.md`** describes the request lifecycle logic as actually implemented in `backend/`, including a known deviation from the lifecycle documented in `product-spec.md`/`data-model.md` (see workflow.md for details).

## Backend

A NestJS API implementing the request lifecycle: `SUBMITTED → ASSIGNED → IN_PROGRESS`, with invalid transitions rejected server-side and every status change recorded in an append-only history log. See `docs/workflow.md` for the full breakdown and example requests.

```bash
cd backend
npm install
npm run start
```

## Author

Gaelle — AI Academy 2026

## Repository structure

```
docs/
  product-spec.md    — the problem, requirements, and acceptance criteria
  architecture.md     — system components, data flow, trust boundaries, and key decisions
  data-model.md        — entities, relationships, lifecycle rules, storage, and access patterns
decisions/
  ADR-001.md            — record of one key architecture decision and its reasoning
```

## How the docs connect

1. **`product-spec.md`** defines *what* the system needs to do and for whom — the requirements, actors, and acceptance criteria.
2. **`architecture.md`** takes those requirements and defines *how* the system is structured — its components, data flow, and trust boundaries — with each major decision traced back to a specific requirement.
3. **`data-model.md`** takes the architecture's data-owning components and defines *what the system remembers* — entities, relationships, lifecycle rules, and how data is stored and queried.
4. **`decisions/ADR-001.md`** captures the reasoning behind one specific architectural decision in more depth.

## Author

Gaelle — AI Academy 2026
