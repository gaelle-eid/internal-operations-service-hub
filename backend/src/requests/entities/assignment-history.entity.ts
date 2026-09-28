import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('assignment_history')
export class AssignmentHistoryEntry {
  @PrimaryColumn()
  id: string;

  @Column()
  requestId: string;

  @Column({ nullable: true, type: 'text' })
  previousAssigneeId: string | null;

  @Column({ type: 'text' })
  newAssigneeId: string;

  @Column()
  changedBy: string;

  @Column({ type: 'datetime' })
  changedAt: Date;
}