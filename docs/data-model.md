# Data model: Internal Operations Service Hub

## Implementation status

This is the target domain model, not a full description of the current database schema. The current demo persists request and event records and also has persisted `users` and `departments` tables. `users` holds the `employee`, `staff` and `admin` roles; the system admin role is not modelled yet because its rules are not decided. In local mock mode `users` is seeded from fixed demo fixtures; there is no trusted source of users for OIDC mode yet, and configurable OIDC verification is available but not connected to the company's tenant. Columns that reference users or departments on requests, comments and history records (for example `created_by`, `assigned_to`, `changed_by`, `department_id`) are still plain strings, not foreign keys. PostgreSQL is configurable, but SQLite is the local default and the foreign keys, constraints and migrations below have not yet been implemented. See [workflow.md](workflow.md) for the current boundary. Use mock data only.

## Domain

**Entities:**
- User : an employee, department staff member, department admin, or system admin. Has a name, email, and role
- Department : IT, HR, or Finance 
- Request : this belongs to one department, has a title, description, category, priority, and current status
- Comment : a message on a request's thread, written by either the requester or a resolver
- StatusHistory : a log entry recording a status change on a request.
- AssignmentHistory : a log entry recording an assignee change and the admin who made it.

**Attributes:**
- **User**: `id`, `name`, `email`, `role` (employee / department staff / department admin / system admin), `department_id` (nullable — set for staff/admin, empty for employees)
- **Department**: `id`, `name` (IT / HR / Finance)
- **Request**: `id`, `title`, `description`, `category`, `priority`, `status`, `department_id`, `created_by` (User), `assigned_to` (User, nullable), `created_at`
- **Comment**: `id`, `request_id`, `author_id` (User), `body`, `created_at`
- **StatusHistory**: `id`, `request_id`, `from_status`, `to_status`, `changed_by` (User), `changed_at`
- **AssignmentHistory**: `id`, `request_id`, `previous_assignee_id` (nullable User), `new_assignee_id` (User), `changed_by` (department admin), `changed_at`

**Relationships, cardinality, ownership:**
- A USER belongs to one DEPARTMENT , A DEPARTMENT has many USERS (1-N)
- A DEPARMTENT has many REQUESTS, A REQUEST belongs to one DEPARTMENT (N-1)
- A REQUEST is created by exactly one USER (the requester); a USER can create many REQUESTS (N-1). A REQUEST may also be assigned to zero or one USER (the resolver); a USER can be assigned many REQUESTS (N-1)
- A REQUEST has many COMMENTS (1-N) 
- A REQUEST has many STATUS HISTORY entries (1-N)
- A REQUEST has many ASSIGNMENT HISTORY entries (1-N)
- A COMMENT is written by one USER , A USER can write many COMMENTS(1-N)

## Lifecycle + rules

**Status lifecycle:** Submitted → Assigned → In Progress → Waiting on Requester → Resolved → Closed, with Resolved able to reopen back to In Progress if the requester isn't satisfied (per the acceptance criteria in product-spec.md). "Assigned" marks a staff member claiming the request; "In Progress" marks them actively working on it — these are tracked as separate steps so claim time and work time can be distinguished.

**Invariants:**
- A Request always belongs to exactly one Department , it never moves between departments (per the "one request maps to one department" assumption).
- Comments and StatusHistory entries are append-only , once written, they are never edited or deleted (per the "no silent edits/deletes" requirement).
- AssignmentHistory entries are append-only and record both assignees and the acting department admin.
- A Request's current status must always match its most recent StatusHistory entry.

**Authorization-sensitive rules:**
- Only staff belonging to a Request's own Department can view or act on it (department isolation).
- Only the assigned staff member or a Department Admin can change a Request's status, with one exception: the requester can reopen their own Resolved Request (Resolved → In Progress). Every other status change stays with staff and admins.
- Only a Department Admin can reassign a Request between staff or escalate it to a manager.
- Reassignment notifications are delivered to the requester and newly assigned staff member.
- A requester can only view, comment on, and (when Resolved) reopen their own Requests.

## Storage

**Relational reasoning**: Department → Requests, User → Requests, Request → Comments/History. Foreign keys naturally enforce "a request belongs to exactly one department" and make department-isolation checks straightforward at the query level. We chose a relational database over a document database for this reason — see `decisions/ADR-001.md` for the full comparison. Specifically, we chose **PostgreSQL**: it's free and open-source, has strong constraint/referential-integrity support (important since department isolation and audit integrity both lean on foreign keys), and supports JSON columns if we ever need flexible fields later without giving up enforced structure elsewhere.

**Durable vs derived:**
- Durable (source of truth, never overwritten): Request core fields, Comment entries, StatusHistory entries, AssignmentHistory entries.
- Derived for convenience: a Request's current status is stored directly on the Request row for fast lookups, but it is derived from — and must always agree with — its latest StatusHistory entry, which remains the durable audit trail.

## Access

**Important queries / access patterns:**
- Department staff viewing their queue: requests filtered by department + status.
- An employee viewing their own requests: requests filtered by requester.
- Loading a request's detail view: its comments and status history, ordered by time.
- A department admin viewing all open requests in their department, sorted by status or priority.

**Indexes:**
- `Request(department_id, status)` — supports the department queue view, the most frequent query in the system.
- `Request(created_by)` — supports an employee pulling up their own requests.
- `Comment(request_id)` and `StatusHistory(request_id)` — support loading a request's full thread and history without scanning the whole table.