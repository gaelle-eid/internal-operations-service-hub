import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TrustedIntakeContextDto {
  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class IntakeRequestDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrustedIntakeContextDto)
  trustedContext?: TrustedIntakeContextDto;
}