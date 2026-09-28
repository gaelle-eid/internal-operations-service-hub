import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { OidcAuthService } from './oidc-auth.service';

const contextFor = (headers: Record<string, string>) => ({
  switchToHttp: () => ({ getRequest: () => ({ headers }) }),
}) as any;

describe('AuthGuard', () => {
  const originalAuthMode = process.env.AUTH_MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  const oidcAuthService = { authenticate: jest.fn() } as unknown as OidcAuthService;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalAuthMode;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('accepts mock headers only in explicit non-production mock mode', async () => {
    process.env.AUTH_MODE = 'mock';
    process.env.NODE_ENV = 'development';
    const request = { headers: { 'x-user-id': 'employee-1', 'x-user-role': 'employee' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;

    await expect(new AuthGuard(oidcAuthService).canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({ user: { id: 'employee-1', role: 'employee' } });
    expect(oidcAuthService.authenticate).not.toHaveBeenCalled();
  });

  it('rejects unknown mock identities and caller-selected elevated roles', async () => {
    process.env.AUTH_MODE = 'mock';
    process.env.NODE_ENV = 'development';
    const guard = new AuthGuard(oidcAuthService);

    await expect(guard.canActivate(contextFor({
      'x-user-id': 'unregistered-user',
      'x-user-role': 'admin',
      'x-department-id': 'IT',
    }))).rejects.toThrow('not registered');
    await expect(guard.canActivate(contextFor({
      'x-user-id': 'employee-1',
      'x-user-role': 'admin',
      'x-department-id': 'IT',
    }))).rejects.toThrow('does not match');
  });

  it('derives department from the mock directory and rejects department spoofing', async () => {
    process.env.AUTH_MODE = 'mock';
    process.env.NODE_ENV = 'development';
    const request = { headers: { 'x-user-id': 'it-staff-1', 'x-user-role': 'staff', 'x-department-id': 'HR' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;

    await expect(new AuthGuard(oidcAuthService).canActivate(context)).rejects.toThrow('x-department-id does not match');
  });

  it('rejects mock mode in production even if it is explicitly enabled', async () => {
    process.env.AUTH_MODE = 'mock';
    process.env.NODE_ENV = 'production';

    await expect(new AuthGuard(oidcAuthService).canActivate(contextFor({
      'x-user-id': 'forged-admin',
      'x-user-role': 'admin',
    }))).rejects.toThrow('Mock authentication is disabled in production');
  });

  it('requires a bearer token in OIDC mode and ignores identity headers', async () => {
    process.env.AUTH_MODE = 'oidc';
    process.env.NODE_ENV = 'development';

    await expect(new AuthGuard(oidcAuthService).canActivate(contextFor({
      'x-user-id': 'forged-admin',
      'x-user-role': 'admin',
    }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(oidcAuthService.authenticate).not.toHaveBeenCalled();
  });

  it('uses verified claims from the OIDC service instead of caller headers', async () => {
    process.env.AUTH_MODE = 'oidc';
    process.env.NODE_ENV = 'development';
    (oidcAuthService.authenticate as jest.Mock).mockResolvedValue({ id: 'verified-user', role: 'employee' });
    const request = { headers: { authorization: 'Bearer signed-token', 'x-user-id': 'forged-admin', 'x-user-role': 'admin' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;

    await expect(new AuthGuard(oidcAuthService).canActivate(context)).resolves.toBe(true);
    expect(oidcAuthService.authenticate).toHaveBeenCalledWith('signed-token');
    expect(request).toMatchObject({ user: { id: 'verified-user', role: 'employee' } });
  });
});