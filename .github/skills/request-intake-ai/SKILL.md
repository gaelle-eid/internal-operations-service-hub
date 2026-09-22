---
name: request-intake-ai
description: 'Build or review the Internal Operations Service Hub AI-assisted request intake. Use for bounded free-text classification, product-owned validation, trusted context, provider failure handling, and repeatable offline evals.'
argument-hint: 'Describe the intake behavior, provider change, or evaluation case to implement.'
---

# Request Intake AI

## Outcome

Produce an advisory candidate from employee free text without allowing an AI provider to become the business authority. The backend must validate the candidate against product-owned values and rules before it can be used by the request workflow.

## Procedure

1. Read `docs/product-spec.md`, `docs/architecture.md`, and `docs/week4-production-ai.md` to identify the current authority boundaries and fixed product values.
2. Keep the provider behind an interface. The provider returns structured unknown data; it does not write entities or decide authorization.
3. Validate every returned field in the backend. Treat missing or out-of-set values as `NEEDS_CLARIFICATION` or `INVALID_AI_OUTPUT`, never as a silent fallback.
4. Apply trusted context only where the product explicitly permits it, validate that context against the same product-owned values, and document precedence over advisory guesses.
5. Make provider failure explicit and actionable. Preserve the normal deterministic request submission path as the fallback.
5. Make provider failure explicit and actionable. Preserve the normal human-reviewed request submission path as the fallback.
6. Add 5-8 representative eval cases using mocked Requesty responses, covering clear, thin, ambiguous, trusted-context, conditional, invalid-output, and provider-failure behavior.
7. Run the focused eval command, the normal backend tests, the E2E tests, and the production build.
8. Update `docs/week4-production-ai.md` and `README.md` when the endpoint, setup, or evaluation command changes.

## Completion Checks

- AI output is never persisted without backend validation.
- Product-owned departments, categories, and priorities are explicit in code and tests.
- Human/software authority remains final; the AI result is advisory.
- The eval suite is repeatable, uses mocked Requesty responses, and documents failure behavior.