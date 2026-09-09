# Workflow: Request Lifecycle API (NestJS)

This describes the business logic implemented in `backend/src/requests/`, and how it ties back to `docs/product-spec.md`, `docs/architecture.md`, and `docs/data-model.md`.

## What's implemented now

A **status lifecycle** for the `Request` entity, covering the first two steps: `SUBMITTED → ASSIGNED → IN_PROGRESS`. There is no UI and no authentication yet — this is API-only, built to prove the lifecycle rules work before anything else is layered on.

> **Note — deviation from the current docs:** `docs/product-spec.md` and `docs/data-model.md` currently define the lifecycle as `Submitted → In Progress → Waiting on Requester → Resolved → Closed` — with no `Assigned` state; a staff member "claims" a request and it goes straight to `In Progress`. This implementation adds `ASSIGNED` as its own step between `Submitted` and `In Progress`, representing "a staff member has taken ownership but hasn't started work yet." The remaining states (`WAITING_ON_REQUESTER`, `RESOLVED`, `CLOSED`) aren't implemented yet. **The docs should be updated to include `ASSIGNED` once this is confirmed** — flagging this rather than changing them unilaterally.

## Where the business logic lives

All lifecycle logic is in **`requests.service.ts`** — not the controller, and not the client. This matches `docs/architecture.md`'s Trust + Resilience section, which requires rules to be enforced server-side rather than assumed by a UI.

**The transition rule is one map:**
```ts
const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.SUBMITTED]: [RequestStatus.ASSIGNED],
  [RequestStatus.ASSIGNED]: [RequestStatus.IN_PROGRESS],
  [RequestStatus.IN_PROGRESS]: [],
};
```
`transition()` looks up the request's current status, checks whether the requested `toStatus` is in its allowed list, and throws `InvalidTransitionException` (a 400) if not. This is why `SUBMITTED → IN_PROGRESS` is rejected: `IN_PROGRESS` isn't in `VALID_TRANSITIONS[SUBMITTED]`.

**One generic endpoint, not one per transition:** `PATCH /requests/:id/status` handles every transition, rather than having a separate `/assign` and `/start` route. This means the lifecycle can grow later (adding `WAITING_ON_REQUESTER`, `RESOLVED`, `CLOSED`) by only editing the `VALID_TRANSITIONS` map — no new routes needed.

**Append-only history:** every successful transition — including the initial `SUBMITTED` on creation — calls `recordHistory()`, which pushes a new `StatusHistoryEntry` and never edits or deletes one. This directly implements `docs/decisions/ADR-001.md`'s decision and `docs/data-model.md`'s `StatusHistory` entity. There is no method anywhere in the service that updates or removes a history entry.

**In-memory store for now:** `requests` and `history` are plain arrays inside the service, not a database. `docs/decisions/ADR-001.md` documents the plan to move this to PostgreSQL — the entity shapes here already match `docs/data-model.md`'s attribute lists, so that swap should be mostly mechanical (replacing the arrays with repository calls) rather than a redesign.

## Endpoints

| Method | Path | Does |
|---|---|---|
| `POST` | `/requests` | Submit a new request (starts at `SUBMITTED`) |
| `GET` | `/requests` | List all requests |
| `GET` | `/requests/:id` | Get one request |
| `GET` | `/requests/:id/history` | Get a request's full append-only status history |
| `PATCH` | `/requests/:id/status` | Attempt a status transition — `{ "toStatus": "ASSIGNED", "changedBy": "user-id" }` |

## Testing the two valid transitions + the one invalid one

```bash
# 1. Submit a request (starts at SUBMITTED)
curl -X POST http://localhost:3000/requests -H "Content-Type: application/json" -d '{
  "title": "Laptop won'\''t boot",
  "description": "Blue screen on startup",
  "category": "Hardware",
  "priority": "High",
  "departmentId": "IT",
  "createdBy": "employee-1"
}'
# → copy the "id" from the response for the calls below

# 2. Valid: SUBMITTED → ASSIGNED
curl -X PATCH http://localhost:3000/requests/<id>/status -H "Content-Type: application/json" -d '{
  "toStatus": "ASSIGNED", "changedBy": "it-staff-1"
}'
# → 200, status is now ASSIGNED

# 3. Valid: ASSIGNED → IN_PROGRESS
curl -X PATCH http://localhost:3000/requests/<id>/status -H "Content-Type: application/json" -d '{
  "toStatus": "IN_PROGRESS", "changedBy": "it-staff-1"
}'
# → 200, status is now IN_PROGRESS

# 4. Invalid: submit a NEW request, then try SUBMITTED → IN_PROGRESS directly
curl -X PATCH http://localhost:3000/requests/<new-id>/status -H "Content-Type: application/json" -d '{
  "toStatus": "IN_PROGRESS", "changedBy": "it-staff-1"
}'
# → 400 Bad Request: "Invalid transition: cannot move a request from SUBMITTED to IN_PROGRESS"
```

## Running it

```bash
cd backend
npm install
npm run start
```
API runs on `http://localhost:3000`.
