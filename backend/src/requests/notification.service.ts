import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { NotificationEntry } from './entities/notification.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntry)
    private readonly notificationRepository: Repository<NotificationEntry>,
  ) {}

  async listForUser(userId: string): Promise<NotificationEntry[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async notifyStatusChange(requestId: string, userId: string, fromStatus: string, toStatus: string): Promise<NotificationEntry> {
    return this.notificationRepository.save({
      id: randomUUID(),
      userId,
      requestId,
      type: 'STATUS_CHANGE',
      message: `Request status changed from ${fromStatus} to ${toStatus}`,
      createdAt: new Date(),
      readAt: null,
    });
  }

  async notifyComment(requestId: string, userId: string, commentBody: string): Promise<NotificationEntry> {
    return this.notificationRepository.save({
      id: randomUUID(),
      userId,
      requestId,
      type: 'COMMENT',
      message: commentBody,
      createdAt: new Date(),
      readAt: null,
    });
  }

  async notifyReassignment(requestId: string, userId: string, message: string): Promise<NotificationEntry> {
    return this.notificationRepository.save({
      id: randomUUID(),
      userId,
      requestId,
      type: 'REASSIGNMENT',
      message,
      createdAt: new Date(),
      readAt: null,
    });
  }
}
