import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';
import { RequestStatus } from './enums/request-status.enum';
import { RequestsService } from './requests.service';

describe('request persistence integration', () => {
  let service: RequestsService;
  let requestRepository: Repository<RequestEntity>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', dropSchema: true, synchronize: true, entities: [RequestEntity, StatusHistoryEntry] }),
        TypeOrmModule.forFeature([RequestEntity, StatusHistoryEntry]),
      ],
      providers: [RequestsService],
    }).compile();

    service = module.get(RequestsService);
    requestRepository = module.get(getRepositoryToken(RequestEntity));
  });

  it('persists a submitted request and its append-only history', async () => {
    const request = await service.create({
      title: 'VPN access',
      description: 'Need access for a client call',
      category: 'Access',
      priority: 'High',
      departmentId: 'IT',
      createdBy: 'employee-1',
    }, { id: 'employee-1', role: 'employee' });

    const stored = await requestRepository.findOneByOrFail({ id: request.id });
    const history = await service.getHistory(request.id, { id: 'employee-1', role: 'employee' });

    expect(stored.status).toBe(RequestStatus.SUBMITTED);
    expect(history).toHaveLength(1);
    expect(history[0].toStatus).toBe(RequestStatus.SUBMITTED);
  });
});
