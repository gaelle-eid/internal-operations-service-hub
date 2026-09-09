import { RequestStatus } from '../enums/request-status.enum';

export class TransitionRequestDto {
  toStatus: RequestStatus;
  changedBy: string;
}
