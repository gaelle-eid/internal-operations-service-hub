import { Column, Entity, PrimaryColumn } from 'typeorm';

// Fields match docs/data-model.md's User attribute list. departmentId is set for
// staff/admin and empty for employees. The system admin role is not modelled yet
// because the docs define no rules for it.
@Entity('users')
export class UserEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ type: 'text' })
  role: 'employee' | 'staff' | 'manager' | 'admin';

  @Column({ type: 'text', nullable: true })
  departmentId: string | null;
}