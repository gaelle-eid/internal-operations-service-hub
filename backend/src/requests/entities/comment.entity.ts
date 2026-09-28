import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('comments')
export class CommentEntry {
  @PrimaryColumn()
  id: string;

  @Column()
  requestId: string;

  @Column()
  authorId: string;

  @Column('text')
  body: string;

  @Column({ type: 'datetime' })
  createdAt: Date;
}
