import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';
import { CommentEntry } from './entities/comment.entity';
import { NotificationEntry } from './entities/notification.entity';
import { AssignmentHistoryEntry } from './entities/assignment-history.entity';
import { RequestStatus } from './enums/request-status.enum';
import { RequestsService } from './requests.service';
import { NotificationService } from './notification.service';
import { AuthGuard } from './auth.guard';
import { getDatabaseConfig } from '../database.config';

describe('request persistence integration', () => {
  let service: RequestsService;
  let notificationService: NotificationService;
  let requestRepository: Repository<RequestEntity>;
  let assignmentHistoryRepository: Repository<AssignmentHistoryEntry>;
  let statusHistoryRepository: Repository<StatusHistoryEntry>;

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
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', dropSchema: true, synchronize: true, entities: [RequestEntity, StatusHistoryEntry, CommentEntry, NotificationEntry, AssignmentHistoryEntry] }),
        TypeOrmModule.forFeature([RequestEntity, StatusHistoryEntry, CommentEntry, NotificationEntry, AssignmentHistoryEntry]),
      ],
      providers: [RequestsService, NotificationService],
    }).compile();

    service = module.get(RequestsService);
    notificationService = module.get(NotificationService);
    requestRepository = module.get(getRepositoryToken(RequestEntity));
    assignmentHistoryRepository = module.get(getRepositoryToken(AssignmentHistoryEntry));
    statusHistoryRepository = module.get(getRepositoryToken(StatusHistoryEntry));
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

  it('lists notifications for a user in reverse chronological order', async () => {
    const request = await service.create({
      title: 'VPN issue',
      description: 'VPN keeps dropping',
      category: 'Access',
      priority: 'High',
      departmentId: 'IT',
      createdBy: 'employee-5',
    }, { id: 'employee-5', role: 'employee' });

    await service.transition(request.id, RequestStatus.ASSIGNED, 'it-staff-4', { id: 'it-staff-4', role: 'staff', departmentId: 'IT' });
    const notifications = await notificationService.listForUser('employee-5');

    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0].type).toBe('STATUS_CHANGE');
    expect(notifications[0].requestId).toBe(request.id);
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
    const requesterNotifications = await notificationService.listForUser('employee-4');
    const assigneeNotifications = await notificationService.listForUser('it-staff-2');
    expect(requesterNotifications.map((notification) => notification.type)).toContain('REASSIGNMENT');
    expect(assigneeNotifications.map((notification) => notification.type)).toContain('REASSIGNMENT');
    await expect(assignmentHistoryRepository.findOneBy({ requestId: request.id })).resolves.toMatchObject({
      previousAssigneeId: null,
      newAssigneeId: 'it-staff-2',
      changedBy: 'it-admin-1',
    });
    await expect(statusHistoryRepository.countBy({ requestId: request.id })).resolves.toBe(1);
    await expect(service.reassign(request.id, 'hr-staff-1', { id: 'it-admin-1', role: 'admin', departmentId: 'IT' }))
      .rejects.toThrow('Assignee must be registered staff in the request department');
    await expect(service.reassign(request.id, 'unknown-staff', { id: 'it-admin-1', role: 'admin', departmentId: 'IT' }))
      .rejects.toThrow('Assignee must be registered staff in the request department');
    await expect(service.reassign(request.id, 'it-staff-3', { id: 'it-staff-1', role: 'staff', departmentId: 'IT' }))
      .rejects.toThrow('Only department admins can reassign requests');
  });

  it('lets the requester reopen their own Resolved request but nothing else', async () => {
    const requester = { id: 'employee-6', role: 'employee' as const };
    const staff = { id: 'it-staff-1', role: 'staff' as const, departmentId: 'IT' };
    const request = await service.create({
      title: 'Monitor flicker',
      description: 'The monitor flickers on startup',
      category: 'Hardware',
      priority: 'Low',
      departmentId: 'IT',
      createdBy: 'employee-6',
    }, requester);

    await expect(service.transition(request.id, RequestStatus.ASSIGNED, 'employee-6', requester)).rejects.toThrow('Only the assigned staff member or department admin can change status');
    await service.transition(request.id, RequestStatus.ASSIGNED, 'it-staff-1', staff);
    await service.transition(request.id, RequestStatus.IN_PROGRESS, 'it-staff-1', staff);
    await expect(service.transition(request.id, RequestStatus.RESOLVED, 'employee-6', requester)).rejects.toThrow('Only the assigned staff member or department admin can change status');
    await service.transition(request.id, RequestStatus.RESOLVED, 'it-staff-1', staff);

    await expect(service.transition(request.id, RequestStatus.CLOSED, 'employee-6', requester)).rejects.toThrow('Only the assigned staff member or department admin can change status');
    await expect(service.transition(request.id, RequestStatus.IN_PROGRESS, 'employee-7', { id: 'employee-7', role: 'employee' })).rejects.toThrow('You are not allowed to access this department request');

    const reopened = await service.transition(request.id, RequestStatus.IN_PROGRESS, 'employee-6', requester);
    expect(reopened.status).toBe(RequestStatus.IN_PROGRESS);

    const history = await service.getHistory(request.id, requester);
    expect(history[history.length - 1]).toMatchObject({ fromStatus: RequestStatus.RESOLVED, toStatus: RequestStatus.IN_PROGRESS, changedBy: 'employee-6' });
    const staffNotifications = await notificationService.listForUser('it-staff-1');
    expect(staffNotifications[0]).toMatchObject({ type: 'STATUS_CHANGE', requestId: request.id });
  });
});
