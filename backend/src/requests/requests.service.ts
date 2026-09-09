import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.SUBMITTED]: [RequestStatus.ASSIGNED],
  [RequestStatus.ASSIGNED]: [RequestStatus.IN_PROGRESS],
  [RequestStatus.IN_PROGRESS]: [],
};

@Injectable()
export class RequestsService {
  // In-memory store for now. docs/decisions/ADR-001.md documents the plan to
  // move this to PostgreSQL; this stands in for that store until persistence
  // is added, but the shape mirrors docs/data-model.md so the swap is direct.
  private requests: RequestEntity[] = [];
  private history: StatusHistoryEntry[] = [];

  create(dto: CreateRequestDto): RequestEntity {
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
    this.requests.push(request);

    // Every request gets a StatusHistory entry from the moment it's
    // submitted, so the audit trail is complete from creation onward.
    this.recordHistory(request.id, null, RequestStatus.SUBMITTED, dto.createdBy);

    return request;
  }

  findAll(): RequestEntity[] {
    return this.requests;
  }

  findOne(id: string): RequestEntity {
    const request = this.requests.find((r) => r.id === id);
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return request;
  }

  getHistory(id: string): StatusHistoryEntry[] {
    this.findOne(id); // 404s if the request doesn't exist
    return this.history.filter((h) => h.requestId === id);
  }

  transition(id: string, toStatus: RequestStatus, changedBy: string): RequestEntity {
    const request = this.findOne(id);
    const allowed = VALID_TRANSITIONS[request.status] ?? [];

    if (!allowed.includes(toStatus)) {
      throw new InvalidTransitionException(request.status, toStatus);
    }

    const fromStatus = request.status;
    request.status = toStatus;

    if (toStatus === RequestStatus.ASSIGNED) {
      request.assignedTo = changedBy;
    }

    this.recordHistory(id, fromStatus, toStatus, changedBy);
    return request;
  }

  private recordHistory(
    requestId: string,
    fromStatus: RequestStatus | null,
    toStatus: RequestStatus,
    changedBy: string,
  ): void {
    // Append-only: this is the only place a history entry is ever written,
    // and there is no method anywhere that edits or deletes one.
    this.history.push({
      id: randomUUID(),
      requestId,
      fromStatus,
      toStatus,
      changedBy,
      changedAt: new Date(),
    });
  }
}
