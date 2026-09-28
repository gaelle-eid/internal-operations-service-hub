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
    const request = { headers: { 'x-user-id': 'demo-employee', 'x-user-role': 'employee' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;

    await expect(new AuthGuard(oidcAuthService).canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({ user: { id: 'demo-employee', role: 'employee' } });
    expect(oidcAuthService.authenticate).not.toHaveBeenCalled();
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