# Internal Operations Service Hub

v0.4 is a full-stack internal Service Request flow with Requesty-powered advisory intake and a read-only assistant. Employees can turn free text into a bounded candidate, review it, submit the request, and ask about an accessible request by selected context or name and date. The backend owns validation, authorization, lifecycle rules, and append-only status history.

## Repository

```text
backend/   NestJS API, TypeORM persistence in SQLite, tests, and Requesty integration
frontend/  React + Vite request dashboard and global assistant
docs/      product, architecture, data model, workflow, and delivery documentation
decisions/ architecture decision records
```

## Prerequisites

Node.js 20+ and npm.

## Configure Requesty

Put the real Requesty configuration in `backend/.env`:

```env
REQUESTY_API_KEY=your-requesty-key
REQUESTY_MODEL=google/gemma-4-31b-it
REQUESTY_BASE_URL=https://router.requesty.ai/v1/chat/completions
```

The backend uses Requesty only. Never put the real key in Markdown, source code, or a committed file.

## Install and run

Start the API:

```powershell
cd backend
npm install
npm run start:dev
```

The API runs at `http://localhost:3000` and creates `backend/service-hub.sqlite` automatically.

In a second terminal, start the web app:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/`. The global **Requesty assistant** is visible without selecting a request.

## Browser verification scenarios

Use **New request**, **Suggest fields**, and **Ask assistant**. Compare the browser result with the expected result below.

1. **Clear IT intake**
   - Input: `My laptop will not boot and I cannot work.`
   - Action: Click **Suggest fields**.
   - Expected: Requesty suggests IT, Hardware, and High priority. The fields are editable and nothing is submitted until **Submit request**.

2. **HR intake**
   - Input: `My payroll is incorrect on this month's payslip.`
   - Action: Click **Suggest fields**.
   - Expected: Requesty suggests HR and People with a bounded priority.

3. **Finance intake**
   - Input: `I need help paying an invoice for a software supplier.`
   - Action: Click **Suggest fields**.
   - Expected: Requesty suggests Finance. The backend rejects categories, priorities, or departments outside the product-owned values.

4. **Ambiguous intake**
   - Input: `Something is wrong and I need help.`
   - Action: Click **Suggest fields**.
   - Expected: The assistant asks for clarification or reports that the department is unclear. It must not silently guess.

5. **Status by name and date**
   - Input: `What is the status of "Requesty live name date" created on 2026-09-22?`
   - Action: Click **Ask assistant** without selecting a request.
   - Expected: The assistant finds the matching accessible request and reports its status without asking for the long request ID.

6. **Provider or output failure**
   - Action: Stop Requesty or use an invalid provider response in a test setup, then click **Suggest fields** or **Ask assistant**.
   - Expected: The UI shows an unavailable or invalid-output message. No unvalidated AI result is submitted, and the normal form remains available.

The assistant is advisory. Software and human authority remain final.

## AI chatbot testing

The chatbot is the global **Requesty assistant** panel below the request workspace. It is visible even when no request is selected. The browser calls the backend `/requests/agent`; the browser never calls Requesty directly.

1. **Selected-request status**
   - Setup: Create and submit a request, then select it in the request list.
   - Chat: `What is the status of this request?`
   - Expected: The assistant reports the selected request's current status without asking for its ID.

2. **Name-and-date status lookup**
   - Setup: Create a request titled `Laptop issue` on the current date.
   - Chat: `What is the status of "Laptop issue" created on YYYY-MM-DD?`
   - Expected: The assistant finds the accessible request using `find_request_by_name_date` and reports its status, even with no request selected.

3. **Unknown request**
   - Chat: `What is the status of "Does not exist" created on 2026-09-22?`
   - Expected: The assistant says that no accessible request matched. It must not invent a request or status.

4. **Ambiguous request**
   - Setup: Create two requests with the same title on the same date.
   - Chat: `What is the status of "Laptop issue" created on YYYY-MM-DD?`
   - Expected: The assistant asks for more detail instead of choosing one silently.

5. **General assistant response**
   - Chat: `What can you help me with?`
   - Expected: Requesty answers conversationally or explains that it can help with request status. It must not execute a write action.

6. **Requesty failure**
   - Action: Stop the backend's Requesty access or simulate a provider error, then click **Ask assistant**.
   - Expected: The UI shows an unavailable/error message. No request is changed and the normal request workflow remains available.

The chatbot currently has read-only tools only: `get_request_status` and `find_request_by_name_date`. The backend validates tool arguments and authorization before reading any request.

## API contract

Identity headers:

```text
x-user-id       actor identifier
x-user-role     employee | staff | admin
x-department-id required for staff/admin requests
```

| Method | Path | Purpose |
|---|---|---|
| POST | `/requests` | Validate and persist a request as `SUBMITTED` |
| POST | `/requests/intake` | Ask Requesty for an advisory bounded candidate |
| POST | `/requests/agent` | Ask the Requesty assistant to use authorized read-only tools |
| GET | `/requests` | Employee's own requests or staff department queue |
| GET | `/requests/:id` | Read one authorized request |
| GET | `/requests/:id/history` | Read append-only status history |
| PATCH | `/requests/:id/status` | Apply `SUBMITTED -> ASSIGNED -> IN_PROGRESS` |

The agent supports `get_request_status` for a selected request or UUID and `find_request_by_name_date` for a request title plus creation date. The backend validates the tool call and applies authorization before reading data.

## Tests and builds

```powershell
cd backend
npm test                 # unit, persistence, and mocked Requesty tests
npm run test:eval        # seven intake evaluation cases
npm run test:e2e         # HTTP intake and agent workflow tests
npm run build            # NestJS production build

cd ../frontend
npm run build            # React/Vite production build
```

See [docs/week4-production-ai.md](docs/week4-production-ai.md) for the trust boundary, evaluation cases, and Requesty integration details. See [docs/product-spec.md](docs/product-spec.md), [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md), and [docs/workflow.md](docs/workflow.md) for the broader product and architecture context.

Author: Gaelle - AI Academy 2026
