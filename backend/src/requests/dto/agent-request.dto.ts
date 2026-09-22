import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AgentRequestDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}