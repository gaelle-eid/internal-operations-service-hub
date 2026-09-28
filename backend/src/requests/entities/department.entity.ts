import { Column, Entity, PrimaryColumn } from 'typeorm';

// Fields match docs/data-model.md's Department attribute list. The set is fixed
// (IT, HR, Finance) per docs/product-spec.md; the id is the department name, which is
// what requests already store in departmentId.
@Entity('departments')
export class DepartmentEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;
}