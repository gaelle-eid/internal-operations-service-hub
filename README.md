# Internal Operations Service Hub

A company-internal system for requesting and tracking help from departments such as IT, HR, and Finance. Employees submit requests to the right department, follow their status, and communicate with whoever is resolving them , this replaces scattered emails, chat messages, and hallway conversations.

**Status:** v0.1 — Product Foundation. This repository defines the problem, architecture, and data model. No implementation yet.

## Repository structure

```
docs/
  product-spec.md    — the problem, requirements, and acceptance criteria
  architecture.md     — system components, data flow, trust boundaries, and key decisions
  data-model.md        — entities, relationships, lifecycle rules, storage, and access patterns
decisions/
  ADR-001.md            — record of one key architecture decision and its reasoning
```

## How the docs connect

1. **`product-spec.md`** defines *what* the system needs to do and for whom — the requirements, actors, and acceptance criteria.
2. **`architecture.md`** takes those requirements and defines *how* the system is structured — its components, data flow, and trust boundaries — with each major decision traced back to a specific requirement.
3. **`data-model.md`** takes the architecture's data-owning components and defines *what the system remembers* — entities, relationships, lifecycle rules, and how data is stored and queried.
4. **`decisions/ADR-001.md`** captures the reasoning behind one specific architectural decision in more depth.

## Author

Gaelle — AI Academy 2026
