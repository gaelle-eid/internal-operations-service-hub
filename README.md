# Internal Operations Service Hub

A company-internal system for requesting and tracking help from departments such as IT, HR, and Finance. Employees submit requests to the right department, follow their status, and communicate with whoever is resolving them , this replaces scattered emails, chat messages, and hallway conversations.

**Status:** v0.1 — Product Foundation. This repository defines the problem, architecture, and data model. No implementation yet.
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
