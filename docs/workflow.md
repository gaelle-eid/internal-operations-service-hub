# Current workflow and implementation status

This page describes the current code and distinguishes it from the target requirements in [product-spec.md](product-spec.md), [architecture.md](architecture.md), and [data-model.md](data-model.md).

## Mock identity and data

- In local mock mode only, the frontend uses demo actor `employee-1` and sends `x-user-id`, `x-user-role`, and optional `x-department-id` headers.
- The browser now supports configurable OIDC Authorization Code + PKCE, and the backend can verify Bearer access tokens using configured issuer, audience, JWKS, and an allowlisted asymmetric signing algorithm (RS256 by default). The real company tenant is not configured in this repository yet. Local mock-header mode is explicit and is rejected when `NODE_ENV=production`.
- In automated tests only, the guard defaults to mock mode so the current HTTP tests can use example identities. These test values are fixtures, not users.
- Requests, comments, notifications, status history, and assignment history are persisted locally in SQLite by default. This is persistent demo data, not a directory of real employees. Use mock/example content only; do not enter real employee or confidential information.
- The current schema has no persisted `User` or `Department` entities. User and department IDs on records are strings, not foreign-key relationships.
- PostgreSQL connection configuration exists, but migrations and the documented relational constraints are not yet implemented. SQLite remains the local default.

## Implemented backend behavior

- Requests start at `SUBMITTED`; valid transitions are `SUBMITTED -> ASSIGNED -> IN_PROGRESS -> WAITING_ON_REQUESTER -> RESOLVED -> CLOSED`, with `WAITING_ON_REQUESTER -> IN_PROGRESS` and `RESOLVED -> IN_PROGRESS` allowed.
- Employees are filtered to their own requests. Staff/admin access is filtered by the department claim from a verified OIDC token or the department ID in local mock headers.
- Comments are append-only through the API. Status changes and assignments have separate append-only history records.
- Department admins can reassign requests in their own department. Because there is no trusted user directory, the API cannot yet verify that the target assignee belongs to that department or is a manager.
- In-app status, comment, and reassignment notifications are persisted by the backend.
- Requesty intake returns an advisory candidate; the read-only assistant can query accessible requests. Automated tests mock provider responses.

## Current UI boundary

The employee UI supports local mock mode and configurable OIDC login, request list/detail, intake form, assistant, append-only status history, a visible comment thread with composer, and a recent notification feed polled every 10 seconds. It does not yet provide staff/admin queues or reassignment controls, employee search/filters, or admin sorting. The actual company login is not usable until provider settings and claim mapping are configured in `.env` files.

## API routes

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/requests` | Submit a request |
| `GET` | `/requests` | List own requests or the header-selected department queue |
| `GET` | `/requests/:id` | Read one accessible request |
| `GET` | `/requests/:id/history` | Read append-only status history |
| `PATCH` | `/requests/:id/status` | Apply an allowed lifecycle transition |
| `GET` / `POST` | `/requests/:id/comments` | Read or append request comments |
| `GET` | `/requests/notifications` | List notifications for the authenticated actor |
| `PATCH` | `/requests/:id/reassign` | Reassign as a department admin; record assignment history |
| `POST` | `/requests/intake` | Return an advisory intake candidate |
| `POST` | `/requests/agent` | Use authorized, read-only request lookup tools |

The headers shown in local examples and E2E tests are mock data, not proof of authentication. Set `AUTH_MODE=oidc` and configure the actual provider before deployment; do not expose mock mode as a production service.

## Remaining work from the docs

1. Obtain company issuer, API audience, JWKS URI, SPA client registration/redirect URL, API scope, and verified subject/role/department claim names and values; configure and validate the OIDC integration against that tenant.
2. Add or connect a trusted user/department directory, then validate reassignment targets and manager escalation.
3. Implement PostgreSQL migrations, foreign keys, and constraints from [ADR-001.md](../decisions/ADR-001.md).
4. Complete staff/admin UI, employee search and filters, and department queue sorting.
5. Add end-to-end acceptance coverage for the full documented workflow.

## Validation

```powershell
cd backend
npm test
npm run test:e2e
npm run build

cd ../frontend
npm run build
```
