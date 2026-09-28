import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';
import { CommentEntry } from './entities/comment.entity';
import { NotificationEntry } from './entities/notification.entity';
import { RequestStatus } from './enums/request-status.enum';
import { RequestsService } from './requests.service';
import { NotificationService } from './notification.service';

describe('request persistence integration', () => {
  let service: RequestsService;
  let notificationService: NotificationService;
  let requestRepository: Repository<RequestEntity>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', dropSchema: true, synchronize: true, entities: [RequestEntity, StatusHistoryEntry, CommentEntry, NotificationEntry] }),
        TypeOrmModule.forFeature([RequestEntity, StatusHistoryEntry, CommentEntry, NotificationEntry]),
      ],
      providers: [RequestsService, NotificationService],
    }).compile();

    service = module.get(RequestsService);
    notificationService = module.get(NotificationService);
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

  it('stores a request comment in an append-only thread', async () => {
    const request = await service.create({
      title: 'Payroll correction',
      description: 'My payslip is wrong',
      category: 'People',
      priority: 'High',
      departmentId: 'HR',
      createdBy: 'employee-2',
    }, { id: 'employee-2', role: 'employee' });

    const addedComment = await service.addComment(request.id, 'employee-2', 'I submitted the correction form.', { id: 'employee-2', role: 'employee', departmentId: 'HR' });
    const comments = await service.getComments(request.id, { id: 'employee-2', role: 'employee', departmentId: 'HR' });

    expect(addedComment.body).toBe('I submitted the correction form.');
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe('I submitted the correction form.');
    expect(comments[0].authorId).toBe('employee-2');
  });

  it('creates in-app notifications when a request changes status or receives a comment', async () => {
    const request = await service.create({
      title: 'Laptop issue',
      description: 'My laptop will not boot',
      category: 'Hardware',
      priority: 'High',
      departmentId: 'IT',
      createdBy: 'employee-3',
    }, { id: 'employee-3', role: 'employee' });

    await service.transition(request.id, RequestStatus.ASSIGNED, 'it-staff-1', { id: 'it-staff-1', role: 'staff', departmentId: 'IT' });
    await service.addComment(request.id, 'employee-3', 'The laptop is still failing at startup.', { id: 'employee-3', role: 'employee', departmentId: 'IT' });

    const employeeNotifications = await notificationService.listForUser('employee-3');
    const staffNotifications = await notificationService.listForUser('it-staff-1');

    expect(employeeNotifications.some((notification) => notification.requestId === request.id && notification.type === 'STATUS_CHANGE')).toBe(true);
    expect(staffNotifications.some((notification) => notification.requestId === request.id && notification.type === 'STATUS_CHANGE')).toBe(true);
    expect(staffNotifications.some((notification) => notification.requestId === request.id && notification.type === 'COMMENT')).toBe(true);
    expect(employeeNotifications.some((notification) => notification.requestId === request.id && notification.type === 'COMMENT')).toBe(false);
  });
});
