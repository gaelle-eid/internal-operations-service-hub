import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';
import { UserEntity } from './entities/user.entity';
import { getAuthMode, MOCK_USERS } from './mock-directory';

export const DEPARTMENT_NAMES = ['IT', 'HR', 'Finance'] as const;

// The persisted user/department directory (docs/data-model.md). Departments are a fixed
// set. Users are seeded from the demo fixtures in mock mode only; OIDC mode has no
// trusted source of users yet (docs/workflow.md, remaining work).
@Injectable()
export class DirectoryService implements OnModuleInit {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentRepository: Repository<DepartmentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  // Idempotent: never overwrites or duplicates an existing row.
  async seed(): Promise<void> {
    for (const name of DEPARTMENT_NAMES) {
      if (!(await this.departmentRepository.findOneBy({ id: name }))) {
        await this.departmentRepository.save({ id: name, name });
      }
    }
    if (getAuthMode() !== 'mock' || process.env.NODE_ENV === 'production') return;
    for (const user of MOCK_USERS) {
      if (!(await this.userRepository.findOneBy({ id: user.id }))) {
        await this.userRepository.save({ ...user });
      }
    }
  }

  findUser(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ id });
  }

  async listStaffIds(departmentId: string): Promise<string[]> {
    const staff = await this.userRepository.find({ where: { role: 'staff', departmentId }, order: { id: 'ASC' } });
    return staff.map((user) => user.id);
  }
}