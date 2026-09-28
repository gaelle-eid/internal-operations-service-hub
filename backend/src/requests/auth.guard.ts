import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestActor } from './requests.service';
import { OidcAuthService } from './oidc-auth.service';
import { getAuthMode, getMockActor } from './mock-directory';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly oidcAuthService: OidcAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers ?? {};
    const mode = getAuthMode();

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
    const userId = headers['x-user-id'];
    const role = headers['x-user-role'];
    if (!userId || !role || !['employee', 'staff', 'admin'].includes(role)) {
      throw new UnauthorizedException('Mock mode requires x-user-id and a valid x-user-role');
    }
    const registeredActor = getMockActor(userId);
    if (!registeredActor) throw new UnauthorizedException('Mock user is not registered');
    if (role !== registeredActor.role) throw new UnauthorizedException('x-user-role does not match the registered mock user');
    if (headers['x-department-id'] !== registeredActor.departmentId) {
      throw new UnauthorizedException('x-department-id does not match the registered mock user');
    }
    return { ...registeredActor };
  }
}
