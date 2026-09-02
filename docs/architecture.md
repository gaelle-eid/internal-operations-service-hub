# Purpose + Scope

**Requirements driving the design:** Employees need one place to submit requests to IT, HR, or Finance, track their status, and communicate with whoever is resolving them. Department staff need a list of the requests assigned to them, they can accept the request, update its status and reassign it if needed, and a comment thread. History must be preserved and auditable, and each department must only see its own requests

**Actors:** Employee (requester), Department Staff (resolver), Department Admin, System Admin

**System boundary:** This is a single internal web application. It owns requests, comments, users, and department categories data. It is not connected to any external ticketing system, and may include AI features

## Structure + Flow

**Components:**
- UI: what employees, staff, and admins interact with : submitting requests, viewing queues, commenting. Exists because there needs to be a single entry point instead of email/hallway conversations.
- API: enforces the rules — who can see or act on which requests, valid status transitions, who can comment
- Auth: confirms who a user is and what role they have (employee, department staff, admin)
- Data: holds requests, their status, department/category, and their full history/comment thread. Requests, history, and comments must persist and be auditable 
- Notification Service: sends alerts when a request's status changes or a new comment is added

**External dependencies:** Only the company login system that already exists 

**Important data flows:**
1. Employee submits a request → API validates it (has department, title, etc.) → stored with status "Submitted" → Notification Service tells relevant department staff.
2. Department staff claims and updates a request → API checks the staff member belongs to that department → status changes and is recorded in history → Notification Service tells the requester.
3. Receiver or sender can comment → API appends to the request's thread  → Notification Service tells the other party.

                    +-------------------+
                    |       Users       |
                    | Employee/Staff/    |
                    |      Admin         |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    |    Web client     |
                    | Submit, track,    |
                    |     comment       |
                    +---------+---------+
                              |
                              v
+----------------+  +-------------------+
|  Login system   |  |  API / application |
|  (external)     |->|      layer         |
|  identity check |  | Enforces rules &   |
+----------------+   |    auth             |
                    +----+----------+----+
                         |          |
                         v          v 
              +-------------------+  +-------------------+
              |  Request store    |  |   Notifications   |
              | Append-only       |  |  In-app, decoupled|
              |  history log      |  |                   |
              +-------------------+  +-------------------+




## Trust + Resilience

**Trust / authorization boundaries:**
- Every request into the API must be authenticated 
- The API checks department membership before letting staff view or act on a request outside their own department
- Only admins can reassign requests to a manager or across staff within a department.
- History and comments are append-only at the API level, there's no "edit" or "delete" operation so the audit trail can be trustworthy 

**Failure scenarios:**
- If the Notification Service is unavailable, request submission and status updates should still succeed because a failure there shouldn't lose or corrupt a request.
- If the login system is unavailable, no one can authenticate
- If the Request Store is unavailable, both submission and viewing fail 
- Bad connection

**Realistic scalability/reliability notes:** Only a few hundred people will use this at once, since it's just for one company. So one API and one database are enough , no need for extra servers, caching, or splitting things into microservices.

## Decisions

- Single application, not microservices
- Department isolation enforced in the API, not just the UI
- History/comments are append-only, we can only add new entries, never edit or delete old ones
- Notifications are separate from the main flow , they only show in-app for now (not email yet for ex). If they break, it won't stop someone from submitting or updating a request
- No AI routing: no AI decides which department gets a request, employees just pick the department themselves when they submit.
