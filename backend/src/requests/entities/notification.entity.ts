import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('notifications')
export class NotificationEntry {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  requestId: string;

  @Column()
  type: 'STATUS_CHANGE' | 'COMMENT' | 'REASSIGNMENT';

  @Column('text')
  message: string;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  readAt: Date | null;
}
