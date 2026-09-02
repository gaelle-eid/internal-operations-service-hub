# Data model: Internal Operations Service Hub

## Domain

**Entities:**
- User : an employee, department staff member, department admin, or system admin. Has a name, email, and role
- Department : IT, HR, or Finance 
- Request : this belongs to one department, has a title, description, category, priority, and current status
- Comment : a message on a request's thread, written by either the requester or a resolver
- StatusHistory : a log entry recording a status change on a request.

**Relationships, cardinality, ownership:**
- A USER belongs to one DEPARTMENT , A DEPARTMENT has many USERS (1-N)
- A DEPARMTENT has many REQUESTS, A REQUEST belongs to one DEPARTMENT (N-1)
- A REQUEST is created by exactly one USER (the requester); a USER can create many REQUESTS (N-1). A REQUEST may also be assigned to zero or one USER (the resolver); a USER can be assigned many REQUESTS (N-1)
- A REQUEST has many COMMENTS (1-N) 
- A REQUEST has many STATUS HISTORY entries (1-N)
- A COMMENT is written by one USER , A USER can write many COMMENTS(1-N)

## Lifecycle + rules

**Status lifecycle:** Submitted → In Progress → Waiting on Requester → Resolved → Closed, with Resolved able to reopen back to In Progress if the requester isn't satisfied (per the acceptance criteria in product-spec.md).

**Invariants:**
- A Request always belongs to exactly one Department , it never moves between departments (per the "one request maps to one department" assumption).
- Comments and StatusHistory entries are append-only , once written, they are never edited or deleted (per the "no silent edits/deletes" requirement).
- A Request's current status must always match its most recent StatusHistory entry.

**Authorization-sensitive rules:**
- Only staff belonging to a Request's own Department can view or act on it (department isolation).
- Only the assigned staff member or a Department Admin can change a Request's status.
- Only a Department Admin can reassign a Request between staff or escalate it to a manager.
- A requester can only view and comment on their own Requests.

## Storage

**Relational reasoning**: Department → Requests, User → Requests, Request → Comments/History. Foreign keys naturally enforce "a request belongs to exactly one department" and make department-isolation checks straightforward at the query level.

**Durable vs derived:**
- Durable (source of truth, never overwritten): Request core fields, Comment entries, StatusHistory entries.
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
