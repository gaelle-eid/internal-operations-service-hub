import { RequestStatus } from '../enums/request-status.enum';
import { Column, Entity, PrimaryColumn } from 'typeorm';

// Fields match docs/data-model.md's Request attribute list.
@Entity('requests')
export class RequestEntity {
  @PrimaryColumn()
  id: string;
  @Column()
  title: string;
  @Column('text')
  description: string;
  @Column()
  category: string;
  @Column()
  priority: string;
  @Column()
  departmentId: string;
  @Column()
  createdBy: string;
  @Column({ nullable: true })
  assignedTo: string | null;
  @Column({ type: 'text' })
  status: RequestStatus;
  @Column({ type: 'datetime' })
  createdAt: Date;
}
