import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestActor } from './requests.service';
import { OidcAuthService } from './oidc-auth.service';
import { getAuthMode } from './mock-directory';
import { DirectoryService } from './directory.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly oidcAuthService: OidcAuthService, private readonly directoryService: DirectoryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers ?? {};
    const mode = getAuthMode();

    if (mode === 'mock') {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Mock authentication is disabled in production');
      }
      request.user = await this.mockActor(headers);
      return true;
    }

    if (mode !== 'oidc') throw new UnauthorizedException('AUTH_MODE must be oidc or mock');
    const authorization = headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
    if (!match) throw new UnauthorizedException('A valid bearer token is required');

    request.user = await this.oidcAuthService.authenticate(match[1]);
    return true;
  }

  private async mockActor(headers: Record<string, string | undefined>): Promise<RequestActor> {
    const userId = headers['x-user-id'];
    const role = headers['x-user-role'];
    if (!userId || !role || !['employee', 'staff', 'manager', 'admin'].includes(role)) {
      throw new UnauthorizedException('Mock mode requires x-user-id and a valid x-user-role');
    }
    const registeredUser = await this.directoryService.findUser(userId);
    if (!registeredUser) throw new UnauthorizedException('Mock user is not registered');
    if (role !== registeredUser.role) throw new UnauthorizedException('x-user-role does not match the registered mock user');
    const departmentId = registeredUser.departmentId ?? undefined;
    if (headers['x-department-id'] !== departmentId) {
      throw new UnauthorizedException('x-department-id does not match the registered mock user');
    }
    return departmentId ? { id: registeredUser.id, role: registeredUser.role, departmentId } : { id: registeredUser.id, role: registeredUser.role };
  }
}