import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';
import { UserEntity } from './entities/user.entity';
import { DirectoryService } from './directory.service';
import { MOCK_USERS } from './mock-directory';

describe('persisted user and department directory', () => {
  let directory: DirectoryService;
  let departmentRepository: Repository<DepartmentEntity>;
  let userRepository: Repository<UserEntity>;
  const previousMode = process.env.AUTH_MODE;

  async function build(): Promise<void> {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', dropSchema: true, synchronize: true, entities: [DepartmentEntity, UserEntity] }),
        TypeOrmModule.forFeature([DepartmentEntity, UserEntity]),
      ],
      providers: [DirectoryService],
    }).compile();
    directory = module.get(DirectoryService);
    departmentRepository = module.get(getRepositoryToken(DepartmentEntity));
    userRepository = module.get(getRepositoryToken(UserEntity));
  }

  afterEach(() => {
    if (previousMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousMode;
  });

  it('seeds the fixed departments and the demo users in mock mode, without duplicating on a second run', async () => {
    process.env.AUTH_MODE = 'mock';
    await build();
    await directory.seed();
    await directory.seed();

    const departments = await departmentRepository.find({ order: { id: 'ASC' } });
    expect(departments.map((department) => department.id)).toEqual(['Finance', 'HR', 'IT']);
    expect(await userRepository.count()).toBe(MOCK_USERS.length);
  });

  it('never overwrites an existing user when seeding', async () => {
    process.env.AUTH_MODE = 'mock';
    await build();
    await directory.seed();
    await userRepository.update({ id: 'it-staff-1' }, { name: 'Renamed' });
    await directory.seed();

    expect((await directory.findUser('it-staff-1'))?.name).toBe('Renamed');
  });

  it('seeds departments but no users outside mock mode', async () => {
    process.env.AUTH_MODE = 'oidc';
    await build();
    await directory.seed();

    expect(await departmentRepository.count()).toBe(3);
    expect(await userRepository.count()).toBe(0);
    expect(await directory.findUser('it-staff-1')).toBeNull();
  });

  it('lists only the staff of the requested department, in a stable order', async () => {
    process.env.AUTH_MODE = 'mock';
    await build();
    await directory.seed();

    expect(await directory.listStaffIds('IT')).toEqual(['it-staff-1', 'it-staff-2']);
    expect(await directory.listStaffIds('HR')).toEqual(['hr-staff-1']);
    expect(await directory.listStaffIds('Unknown')).toEqual([]);
  });
});