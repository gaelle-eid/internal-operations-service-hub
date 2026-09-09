# Problem/Context
At a company, the employees regularly need help from internal staff and departments, but nowadays the requests are scattered across mails and messages or even face to face in the hallway . There is no single place to submit a request, to see its status or know who is responsible for resolving it.  This leads to confusion because the requests can be lost or duplicated , and we have no visibility into how long things take.

# known facts
- The system serves 3 internal deparmtents : IT , HR and  Finance
- Every request needs an owner , a status and a visible history
- Employees are the ones that send requests, meanwhile the department staff are responsible to resolve 


# actors/stakeholders
Employees, department staff and admin, system admin

# fctional requirements
- Employees can submit a request and can view the status and history of their own requests
- Department staff can view, claim, and update requests assigned to their department
- Requests have a defined status lifecycle: Submitted → Assigned → In Progress → Waiting on Requester → Resolved → Closed
- Requests can be commented on by both requester and resolver (a visible thread)
- Requests can be reassigned between staff within a department, or given to a manager
- Employees receive notifications on status changes and new comments
- Department admins can view all requests for their department 
- Employees can search and filter their requests (by status, department, date)

# non-fct requirements
- Only authenticated employees can access the system 
- Each department can only see and act on requests assigned to it 
- Request history and comments must be preserved and auditable — no silent edits/deletes
- Notifications should be near-real-time

# assumptions/constraints/unknowns
- Departments and categories are a fixed, small, known set for v1 (not dynamically created by end users).
- One request maps to one department at a time
- Internal tool only — no external/public-facing requirements.
- Dashboards for admins: Not sure yet if admins need charts/reports (like average response time) 
- Not sure yet if uploaded files need virus scanning, or if there should be a max file size
- For now, notifications only show inside the app. Not sure yet if we'll also add email or Slack alerts later.

# non-goals
- No AI-driven auto-routing or auto-resolution of requests , may do it later tho 
- No support for external/customer-facing requests — internal employees only.
- No mobile app
- No complex approval workflows, just request → resolve.

# acceptance criteria
- An employee submits a request to IT; it appears in the IT queue as "Submitted" and the employee sees it as "Submitted" in their own list.
- An IT staff member claims the request; its status changes to "Assigned" and the employee is notified.
- The IT staff member starts working on it; its status changes to "In Progress" and the employee is notified.
- The requester adds a comment asking a question; the resolver sees it and can reply in the same thread.
- The resolver marks the request "Resolved"; the requester can see the resolution and, if unsatisfied, can reopen or comment before it's "Closed."
- An HR staff member cannot see or act on a request submitted to IT.
- A department admin can see every request currently open in their department, sorted by status or priority.
