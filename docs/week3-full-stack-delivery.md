# Week 3 full-stack delivery

## Delivered slice

v0.3 contains one end-to-end Service Request flow:

1. An employee submits a request from the React web app.
2. The NestJS API validates the payload and persists the request in SQLite.
3. The employee sees their persisted request and its lifecycle.
4. IT staff can claim an IT request.
5. A staff member from another department is denied with `403 Forbidden`.
6. Status history is persisted as append-only rows.

SQLite is used for local development so the repository has real relational persistence without requiring a separate database service. TypeORM is the persistence boundary; the database path can be changed with `DB_PATH`.

## Explicit API contract

The API runs at `http://localhost:3000`. Every request needs these identity headers:

- `x-user-id`: actor identifier
- `x-user-role`: `employee`, `staff`, or `admin`
- `x-department-id`: required for staff/admin department authorization

### `POST /requests`

Request body:

```json
{
  "title": "Laptop will not boot",
  "description": "Blue screen on startup",
  "category": "Hardware",
  "priority": "High",
  "departmentId": "IT",
  "createdBy": "employee-1"
}
```

Allowed priorities are `Low`, `Medium`, and `High`. Allowed departments are `IT`, `HR`, and `Finance`. A successful response is `201` with the created request, initially in `SUBMITTED` status.

### `GET /requests`

Employees receive their own requests. Staff and admins receive requests in their department. The response is an array of request objects.

### `GET /requests/:id` and `GET /requests/:id/history`

These return a request or its append-only status history. Employees can access only their own requests; staff/admins can access only their department's requests.

### `PATCH /requests/:id/status`

Request body:

```json
{
  "toStatus": "ASSIGNED",
  "changedBy": "it-staff-1"
}
```

The lifecycle currently supports `SUBMITTED -> ASSIGNED -> IN_PROGRESS`. A staff member can claim an unassigned request only within their department. After that, only the assigned staff member or a department admin can transition it.

## Intentional failures

- Invalid body data, such as an empty title or `priority: "Urgent"`, returns `400`.
- Missing actor headers returns `401`.
- A user outside the request department returns `403`.
- A skipped lifecycle transition returns `400` with an invalid-transition message.
- A missing request returns `404`.

## Automated protection

- `src/requests/requests.service.spec.ts`: business rule and regression protection for the existing lifecycle.
- `src/requests/requests.persistence.spec.ts`: integration test proving requests and initial history are written to SQLite through TypeORM.
- `test/requests.e2e-spec.ts`: HTTP E2E test covering submission, an allowed IT claim, denied HR access to an IT request, and deliberate invalid input rejection.

## Run it

Terminal 1:

```bash
cd backend
npm install
npm run start:dev
```

Terminal 2:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in Terminal 2, normally `http://localhost:5173`.

Run the automated checks:

```bash
cd backend
npm test
npm run test:e2e
npm run build
```

Build the frontend:

```bash
cd frontend
npm run build
```
