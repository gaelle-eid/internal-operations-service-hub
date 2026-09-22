# v0.4 Production AI: Request Intake

## Capability

`POST /requests/intake` accepts employee free text and returns a bounded candidate request context. The response is advisory only and is not persisted. A normal `POST /requests` submission remains the authoritative path for creating a request.

Example:

```bash
curl -X POST http://localhost:3000/requests/intake \
  -H "Content-Type: application/json" \
  -d '{"text":"My laptop will not boot and I cannot work"}'
```

The result is one of:

- `READY`: all candidate fields are valid and a product department is known.
- `NEEDS_CLARIFICATION`: the text or candidate does not identify IT, HR, or Finance.
- `INVALID_AI_OUTPUT`: the provider returned a malformed value or a value outside the product sets.
- `PROVIDER_UNAVAILABLE`: the advisory provider failed; the caller should use the normal form.

The candidate is bounded to these product-owned values:

- Departments: `IT`, `HR`, `Finance`
- Categories: `Hardware`, `Access`, `People`, `Finance`, `Other`
- Priorities: `Low`, `Medium`, `High`

The backend validates every provider field. A supplied `trustedContext.departmentId` is checked against the same department set and takes precedence over the provider's department guess. It cannot make an invalid category or priority valid.

## Provider boundary

The `IntakeProvider` interface isolates the Requesty model call from product rules. The application always uses Requesty. It calls `https://router.requesty.ai/v1/chat/completions` with model `google/gemma-4-31b-it` by default; override it with `REQUESTY_MODEL` if needed. `REQUESTY_BASE_URL` can override the endpoint for a compatible gateway.

PowerShell setup:

```powershell
cd backend
npm run start:dev
```

The values are stored in `backend/.env`, which is ignored by Git. The key must be revoked and regenerated if it is exposed. Do not commit it, put it in source files, or send it in chat.

Automated tests inject mocked Requesty responses so they do not spend credits or call the network. Production code has no local provider or fallback.

The service catches provider exceptions and returns an explicit `503` response. Invalid provider data is returned as `INVALID_AI_OUTPUT`; it is never passed to request persistence. Human and software authority remain final: staff still review and submit the resulting request through the existing lifecycle API.

## Agent tools

`POST /requests/agent` is the first Requesty agent endpoint. It exposes two read-only tools: `get_request_status` for a selected request or UUID, and `find_request_by_name_date` for a request title plus creation date. Requesty may ask for either tool when an employee asks about a request, but the backend executes the lookup through the authorized request service methods, so normal authorization still applies. The model cannot create, update, assign, or transition requests through these tools.

The backend calls Requesty, validates the tool name and JSON arguments, and then performs the authorized read. If Requesty responds conversationally while the user gave an explicit quoted title and ISO date, the backend can still route that explicit lookup through the same authorization path. This is intentionally the smallest useful read-only agent surface before adding write actions.

## Evaluation

Seven representative cases live in `backend/src/requests/intake.eval.spec.ts`: clear input, thin input, ambiguous input, trusted context override, conditional behavior without trusted context, invalid provider output, and provider failure.

Run them repeatedly offline with:

```bash
cd backend
npm run test:eval
```

The normal backend suite remains available with `npm test`, and HTTP coverage remains available with `npm run test:e2e`.