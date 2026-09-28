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
import { AuthGuard } from './auth.guard';
import { getDatabaseConfig } from '../database.config';

describe('request persistence integration', () => {
  let service: RequestsService;
  let notificationService: NotificationService;
  let requestRepository: Repository<RequestEntity>;

  it('requires authenticated user headers for all access', () => {
    const guard = new AuthGuard();
    const validContext = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-user-id': 'employee-1', 'x-user-role': 'employee' } }),
      }),
    } as any;
    const invalidContext = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-user-id': 'employee-1' } }),
      }),
    } as any;

    expect(guard.canActivate(validContext)).toBe(true);
    expect(() => guard.canActivate(invalidContext)).toThrow('x-user-id and x-user-role headers are required');
  });

  it('uses postgres settings when postgres env vars are configured', () => {
    const previous = { ...process.env };
    process.env.DB_TYPE = 'postgres';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'svc_user';
    process.env.DB_PASSWORD = 'secret';
    process.env.DB_NAME = 'service_hub';

    try {
      const config = getDatabaseConfig() as any;
      expect(config.type).toBe('postgres');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.username).toBe('svc_user');
      expect(config.password).toBe('secret');
      expect(config.database).toBe('service_hub');
    } finally {
      process.env = previous;
    }
  });

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

  it('allows a department admin to reassign a request and blocks staff reassignment', async () => {
    const request = await service.create({
      title: 'Printer issue',
      description: 'The printer is offline',
      category: 'Hardware',
      priority: 'Medium',
      departmentId: 'IT',
      createdBy: 'employee-4',
    }, { id: 'employee-4', role: 'employee' });

    const reassigned = await service.reassign(request.id, 'it-staff-2', { id: 'it-admin-1', role: 'admin', departmentId: 'IT' });

    expect(reassigned.assignedTo).toBe('it-staff-2');
    await expect(service.reassign(request.id, 'it-staff-3', { id: 'it-staff-1', role: 'staff', departmentId: 'IT' }))
      .rejects.toThrow('Only department admins can reassign requests');
  });
});
