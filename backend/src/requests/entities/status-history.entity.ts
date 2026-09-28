import { RequestStatus } from '../enums/request-status.enum';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// Append-only log entry. Fields match docs/data-model.md's StatusHistory
// attribute list. Nothing in this codebase ever edits or deletes an entry
// once written — see docs/decisions/ADR-001.md.
// Index from docs/data-model.md: load a request's full history.
@Index('IDX_status_history_request', ['requestId'])
@Entity('status_history')
export class StatusHistoryEntry {
  @PrimaryColumn()
  id: string;
  @Column()
  requestId: string;
  @Column({ nullable: true, type: 'text' })
  fromStatus: RequestStatus | null;
  @Column({ type: 'text' })
  toStatus: RequestStatus;
  @Column()
  changedBy: string;
  @Column({ type: 'datetime' })
  changedAt: Date;
}