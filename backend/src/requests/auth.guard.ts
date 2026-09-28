import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers ?? {};
    const userId = headers['x-user-id'];
    const role = headers['x-user-role'];

    if (!userId || !role || !['employee', 'staff', 'admin'].includes(role)) {
      throw new UnauthorizedException('x-user-id and x-user-role headers are required');
    }

    request.user = {
      id: userId,
      role,
      departmentId: headers['x-department-id'],
    };

    return true;
  }
}
