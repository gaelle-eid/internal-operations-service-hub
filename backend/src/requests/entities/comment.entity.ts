import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// Index from docs/data-model.md: load a request's full thread.
@Index('IDX_comments_request', ['requestId'])
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