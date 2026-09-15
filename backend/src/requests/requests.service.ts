import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';
import { RequestStatus } from './enums/request-status.enum';
import { CreateRequestDto } from './dto/create-request.dto';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';

// The only statuses a request may legally move to next, keyed by its current
// status. This is the single source of truth for the lifecycle rule in
// docs/product-spec.md ("Requests have a defined status lifecycle") and is
// enforced here in the API, not just assumed by a client — matching
// docs/architecture.md's Trust + Resilience section, which requires rules to
// be enforced server-side. Anything not listed here is rejected.
export const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.SUBMITTED]: [RequestStatus.ASSIGNED],
  [RequestStatus.ASSIGNED]: [RequestStatus.IN_PROGRESS],
  [RequestStatus.IN_PROGRESS]: [],
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

    return request;
  }

  findAll(actor: RequestActor): Promise<RequestEntity[]> {
    if (actor.role === 'employee') {
      return this.requestRepository.find({ where: { createdBy: actor.id }, order: { createdAt: 'DESC' } });
    }
    return this.requestRepository.find({ where: { departmentId: actor.departmentId }, order: { createdAt: 'DESC' } });
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
