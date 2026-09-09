import { BadRequestException } from '@nestjs/common';
import { RequestStatus } from '../enums/request-status.enum';

export class InvalidTransitionException extends BadRequestException {
  constructor(from: RequestStatus, to: RequestStatus) {
    super(`Invalid transition: cannot move a request from ${from} to ${to}`);
  }
}
