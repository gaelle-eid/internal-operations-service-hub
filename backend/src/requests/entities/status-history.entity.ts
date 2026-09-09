import { RequestStatus } from '../enums/request-status.enum';

// Append-only log entry. Fields match docs/data-model.md's StatusHistory
// attribute list. Nothing in this codebase ever edits or deletes an entry
// once written — see docs/decisions/ADR-001.md.
export class StatusHistoryEntry {
  id: string;
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  changedBy: string;
  changedAt: Date;
}
