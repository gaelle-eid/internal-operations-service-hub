import { RequestStatus } from '../enums/request-status.enum';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class TransitionRequestDto {
  @IsEnum(RequestStatus)
  toStatus: RequestStatus;
  @IsString()
  @IsNotEmpty()
  changedBy: string;
}
