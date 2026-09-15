import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty()
  title: string;
  @IsString()
  @IsNotEmpty()
  description: string;
  @IsString()
  @IsNotEmpty()
  category: string;
  @IsIn(['Low', 'Medium', 'High'])
  priority: string;
  @IsIn(['IT', 'HR', 'Finance'])
  departmentId: string;
  @IsString()
  @IsNotEmpty()
  createdBy: string;
}
