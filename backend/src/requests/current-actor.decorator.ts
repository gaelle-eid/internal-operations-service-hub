import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestActor } from './requests.service';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestActor => context.switchToHttp().getRequest().user,
);