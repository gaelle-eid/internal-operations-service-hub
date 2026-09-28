import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';
import { CommentEntry } from './entities/comment.entity';
import { NotificationEntry } from './entities/notification.entity';
import { AssignmentHistoryEntry } from './entities/assignment-history.entity';
import { RequestStatus } from './enums/request-status.enum';
import { CreateRequestDto } from './dto/create-request.dto';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { NotificationService } from './notification.service';

// The only statuses a request may legally move to next, keyed by its current
// status. This is the single source of truth for the lifecycle rule in
// docs/product-spec.md ("Requests have a defined status lifecycle") and is
// enforced here in the API, not just assumed by a client — matching
// docs/architecture.md's Trust + Resilience section, which requires rules to
// be enforced server-side. Anything not listed here is rejected.
export const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.SUBMITTED]: [RequestStatus.ASSIGNED],
  [RequestStatus.ASSIGNED]: [RequestStatus.IN_PROGRESS],
  [RequestStatus.IN_PROGRESS]: [RequestStatus.WAITING_ON_REQUESTER, RequestStatus.RESOLVED],
  [RequestStatus.WAITING_ON_REQUESTER]: [RequestStatus.IN_PROGRESS, RequestStatus.RESOLVED],
  [RequestStatus.RESOLVED]: [RequestStatus.IN_PROGRESS, RequestStatus.CLOSED],
  [RequestStatus.CLOSED]: [],
};

export type RequestActor = {
  id: string;
  role: 'employee' | 'staff' | 'admin';
  departmentId?: string;
};

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly requestRepository: Repository<RequestEntity>,
    @InjectRepository(StatusHistoryEntry)
    private readonly historyRepository: Repository<StatusHistoryEntry>,
    @InjectRepository(CommentEntry)
    private readonly commentRepository: Repository<CommentEntry>,
    @InjectRepository(NotificationEntry)
    private readonly notificationRepository: Repository<NotificationEntry>,
    @InjectRepository(AssignmentHistoryEntry)
    private readonly assignmentHistoryRepository: Repository<AssignmentHistoryEntry>,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateRequestDto, actor: RequestActor): Promise<RequestEntity> {
    if (actor.role === 'employee' && actor.id !== dto.createdBy) {
      throw new ForbiddenException('Employees can only submit requests for themselves');
    }
    const request: RequestEntity = {
      id: randomUUID(),
      title: dto.title,
      description: dto.description,
      category: dto.category,
      priority: dto.priority,
      departmentId: dto.departmentId,
      createdBy: dto.createdBy,
      assignedTo: null,
      status: RequestStatus.SUBMITTED,
      createdAt: new Date(),
    };
    await this.requestRepository.save(request);

    // Every request gets a StatusHistory entry from the moment it's
    // submitted, so the audit trail is complete from creation onward.
    await this.recordHistory(request.id, null, RequestStatus.SUBMITTED, dto.createdBy);
    await this.notificationService.notifyStatusChange(request.id, dto.createdBy, 'NEW', RequestStatus.SUBMITTED);

    return request;
  }

  findAll(actor: RequestActor): Promise<RequestEntity[]> {
    if (actor.role === 'employee') {
      return this.requestRepository.find({ where: { createdBy: actor.id }, order: { createdAt: 'DESC' } });
    }
    return this.requestRepository.find({ where: { departmentId: actor.departmentId }, order: { createdAt: 'DESC' } });
  }

  async findByTitleAndDate(title: string, date: string, actor: RequestActor): Promise<RequestEntity[]> {
    const requests = await this.findAll(actor);
    const normalizedTitle = title.trim().toLowerCase();
    return requests.filter((request) => request.title.toLowerCase().includes(normalizedTitle)
      && request.createdAt.toISOString().slice(0, 10) === date);
  }

  async findOne(id: string, actor?: RequestActor): Promise<RequestEntity> {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    if (actor && !this.canAccess(request, actor)) {
      throw new ForbiddenException('You are not allowed to access this department request');
    }
    return request;
  }

  async getHistory(id: string, actor: RequestActor): Promise<StatusHistoryEntry[]> {
    await this.findOne(id, actor);
    return this.historyRepository.find({ where: { requestId: id }, order: { changedAt: 'ASC' } });
  }

  async addComment(requestId: string, authorId: string, body: string, actor: RequestActor): Promise<CommentEntry> {
    const request = await this.findOne(requestId, actor);
    if (actor.role === 'employee' && request.createdBy !== actor.id) {
      throw new ForbiddenException('Employees can only comment on their own requests');
    }
    if (actor.role !== 'admin' && actor.id !== request.createdBy && actor.id !== request.assignedTo) {
      throw new ForbiddenException('Only the requester, assigned staff member, or admin can comment');
    }
    if (!body || !body.trim()) {
      throw new ForbiddenException('Comment body cannot be empty');
    }

    const comment = {
      id: randomUUID(),
      requestId,
      authorId,
      body: body.trim(),
      createdAt: new Date(),
    };
    await this.commentRepository.save(comment);

    const recipientIds = new Set<string>([request.createdBy, request.assignedTo].filter(Boolean) as string[]);
    for (const recipientId of recipientIds) {
      if (recipientId !== authorId) {
        await this.notificationService.notifyComment(requestId, recipientId, body.trim());
      }
    }

    return comment;
  }

  async getComments(id: string, actor: RequestActor): Promise<CommentEntry[]> {
    await this.findOne(id, actor);
    return this.commentRepository.find({ where: { requestId: id }, order: { createdAt: 'ASC' } });
  }

  async reassign(id: string, newAssigneeId: string, actor: RequestActor): Promise<RequestEntity> {
    const request = await this.findOne(id, actor);
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only department admins can reassign requests');
    }
    if (request.departmentId !== actor.departmentId) {
      throw new ForbiddenException('Admins can only reassign requests in their own department');
    }

    const previousAssigneeId = request.assignedTo;
    request.assignedTo = newAssigneeId;
    await this.requestRepository.save(request);
    await this.assignmentHistoryRepository.save({
      id: randomUUID(),
      requestId: id,
      previousAssigneeId,
      newAssigneeId,
      changedBy: actor.id,
      changedAt: new Date(),
    });

    const notifications = new Map<string, string>([
      [request.createdBy, `Request reassigned to ${newAssigneeId}`],
      [newAssigneeId, `You have been assigned to request ${request.title}`],
    ]);
    for (const [userId, message] of notifications) {
      await this.notificationService.notifyReassignment(id, userId, message);
    }
    return request;
  }

  async transition(id: string, toStatus: RequestStatus, changedBy: string, actor: RequestActor): Promise<RequestEntity> {
    const request = await this.findOne(id, actor);
    const isClaim = toStatus === RequestStatus.ASSIGNED && request.assignedTo === null && actor.role === 'staff';
    if (actor.role !== 'admin' && actor.id !== request.assignedTo && !isClaim) {
      throw new ForbiddenException('Only the assigned staff member or department admin can change status');
    }
    if (actor.id !== changedBy) {
      throw new ForbiddenException('The actor must match changedBy');
    }
    const allowed = VALID_TRANSITIONS[request.status] ?? [];

    if (!allowed.includes(toStatus)) {
      throw new InvalidTransitionException(request.status, toStatus);
    }

    const fromStatus = request.status;
    request.status = toStatus;

    if (toStatus === RequestStatus.ASSIGNED) {
      request.assignedTo = changedBy;
    }

    await this.requestRepository.save(request);
    await this.recordHistory(id, fromStatus, toStatus, changedBy);

    const recipientIds = new Set<string>([request.createdBy, request.assignedTo].filter(Boolean) as string[]);
    for (const recipientId of recipientIds) {
      await this.notificationService.notifyStatusChange(id, recipientId, fromStatus, toStatus);
    }

    return request;
  }

  private async recordHistory(
    requestId: string,
    fromStatus: RequestStatus | null,
    toStatus: RequestStatus,
    changedBy: string,
  ): Promise<void> {
    // Append-only: this is the only place a history entry is ever written,
    // and there is no method anywhere that edits or deletes one.
    await this.historyRepository.save({
      id: randomUUID(),
      requestId,
      fromStatus,
      toStatus,
      changedBy,
      changedAt: new Date(),
    });
  }

  private canAccess(request: RequestEntity, actor: RequestActor): boolean {
    return actor.role === 'employee'
      ? request.createdBy === actor.id
      : request.departmentId === actor.departmentId;
  }
}
