# Current workflow and implementation status

This page describes the current code and distinguishes it from the target requirements in [product-spec.md](product-spec.md), [architecture.md](architecture.md), and [data-model.md](data-model.md).

## Mock identity and data

- In local mock mode only, the frontend uses demo actor `employee-1` and sends `x-user-id`, `x-user-role`, and optional `x-department-id` headers.
- The backend resolves mock IDs through the persisted `users` table and rejects unknown IDs, caller-selected roles, or mismatched departments. In mock mode only (never when `NODE_ENV=production`), that table is seeded at startup from fixed demo fixtures without overwriting existing rows. These are demo records, not real employees, and not production authentication.
- The browser now supports configurable OIDC Authorization Code + PKCE, and the backend can verify Bearer access tokens using configured issuer, audience, JWKS, and an allowlisted asymmetric signing algorithm (RS256 by default). The real company tenant is not configured in this repository yet. Local mock-header mode is explicit and is rejected when `NODE_ENV=production`.
- In automated tests only, the guard defaults to mock mode so the current HTTP tests can use example identities. These test values are fixtures, not users.
- Requests, comments, notifications, status history, and assignment history are persisted locally in SQLite by default. This is persistent demo data, not a directory of real employees. Use mock/example content only; do not enter real employee or confidential information.
- The schema has persisted `users` and `departments` tables; departments are the fixed set IT, HR and Finance, and user roles are `employee`, `staff`, `manager` and `admin` (the system admin role is not modelled yet). User and department IDs on request, comment, notification and history records are still strings, not foreign-key relationships.
- PostgreSQL connection configuration exists, but migrations and the documented relational constraints are not yet implemented. SQLite remains the local default.

## Implemented backend behavior

- Requests start at `SUBMITTED`; valid transitions are `SUBMITTED -> ASSIGNED -> IN_PROGRESS -> WAITING_ON_REQUESTER -> RESOLVED -> CLOSED`, with `WAITING_ON_REQUESTER -> IN_PROGRESS` and `RESOLVED -> IN_PROGRESS` allowed.
- Employees are filtered to their own requests. Staff/admin access is filtered by the department claim from a verified OIDC token or the department ID in local mock headers.
- Status changes are limited to the assigned staff member or a department admin (staff may also claim an unassigned request), with one exception: the requester can reopen their own Resolved request (Resolved -> In Progress).
- Comments are append-only through the API. Status changes and assignments have separate append-only history records.
- Department admins can reassign requests in their own department. In mock mode, targets must be staff registered in the persisted directory in the same department. OIDC mode has no trusted source of users yet, so targets are not validated there.
- Department admins can escalate a request in their own department to a manager registered for that department (`PATCH /requests/:id/escalate`). The manager becomes the assignee and can act on the request as its assignee, the change is recorded in assignment history, and the requester and manager are notified. Escalation depends on the persisted directory, so it works in mock mode only; OIDC mode rejects it until a trusted directory exists.
- In-app status, comment, and reassignment notifications are persisted by the backend. When a request is submitted, the requester and the registered staff of the request's department are notified (staff lookup is mock mode only, from the persisted directory). A failed notification or directory lookup does not stop the submission.
- Requesty intake returns an advisory candidate; the read-only assistant can query accessible requests. Automated tests mock provider responses.

## Current UI boundary

The UI supports local mock mode and configurable OIDC login, request list/detail, employee search by title/description/category, status/department/date filters, intake form, assistant, append-only status history, a visible comment thread with composer, and a recent notification feed polled every 10 seconds. In mock mode, the demo actor selector switches among sample employees, IT/HR/Finance staff, and department admins. Requesters see a Reopen request button on their own Resolved requests. Staff can see their mock department queue, claim unassigned requests, and advance requests they own. Admins can sort open department requests by status or priority, reassign to sample staff or escalate to a sample manager in the same department, and apply valid lifecycle transitions. These controls use the existing API authorization; the mock actor switcher is not available in OIDC mode.

The mock actor switcher and reassignment choices use fixed demo fixtures. OIDC login is not usable until provider settings and claim mapping are configured in `.env` files, and manager escalation is unavailable in OIDC mode until a trusted directory-backed role exists.

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
| `PATCH` | `/requests/:id/escalate` | Escalate as a department admin to a manager of the same department; record assignment history |
| `POST` | `/requests/intake` | Return an advisory intake candidate |
| `POST` | `/requests/agent` | Use authorized, read-only request lookup tools |

The headers shown in local examples and E2E tests are mock data, not proof of authentication. Set `AUTH_MODE=oidc` and configure the actual provider before deployment; do not expose mock mode as a production service.

## Remaining work from the docs

1. Obtain company issuer, API audience, JWKS URI, SPA client registration/redirect URL, API scope, and verified subject/role/department claim names and values; configure and validate the OIDC integration against that tenant.
2. Populate the persisted user/department directory from a trusted source (the company tenant), then validate OIDC identities and reassignment targets against it, and validate manager escalation against it.
3. Implement PostgreSQL migrations, foreign keys, and constraints from [ADR-001.md](../decisions/ADR-001.md).
4. Feed the UI staff, manager and admin controls from the directory instead of fixed demo lists, and make manager escalation available in OIDC mode once the directory is populated from a trusted source. The system admin role rules are still undecided.
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