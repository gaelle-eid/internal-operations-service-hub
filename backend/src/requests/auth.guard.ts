import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestActor } from './requests.service';
import { OidcAuthService } from './oidc-auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly oidcAuthService: OidcAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers ?? {};
    const mode = process.env.AUTH_MODE ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'oidc');

    if (mode === 'mock') {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Mock authentication is disabled in production');
      }
      request.user = this.mockActor(headers);
      return true;
    }

    if (mode !== 'oidc') throw new UnauthorizedException('AUTH_MODE must be oidc or mock');
    const authorization = headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
    if (!match) throw new UnauthorizedException('A valid bearer token is required');

    request.user = await this.oidcAuthService.authenticate(match[1]);
    return true;
  }

  private mockActor(headers: Record<string, string | undefined>): RequestActor {
    const role = headers['x-user-role'];
    if (!headers['x-user-id'] || !role || !['employee', 'staff', 'admin'].includes(role)) {
      throw new UnauthorizedException('Mock mode requires x-user-id and a valid x-user-role');
    }
    return { id: headers['x-user-id'], role: role as RequestActor['role'], departmentId: headers['x-department-id'] };
  }
}
