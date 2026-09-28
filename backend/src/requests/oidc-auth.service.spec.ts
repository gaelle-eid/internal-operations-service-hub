import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { OidcAuthService } from './oidc-auth.service';

describe('OidcAuthService', () => {
  let server: Server;
  let jwksUri: string;
  let privateKey: string;
  const issuer = 'http://localhost:43123/issuer';
  const audience = 'service-hub-api';
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicKey = pair.publicKey.export({ format: 'jwk' });
    server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ keys: [{ ...publicKey, kid: 'test-key', alg: 'RS256', use: 'sig' }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    jwksUri = `http://127.0.0.1:${address.port}/.well-known/jwks.json`;
    process.env.OIDC_ISSUER = issuer;
    process.env.OIDC_AUDIENCE = audience;
    process.env.OIDC_JWKS_URI = jwksUri;
    process.env.OIDC_ROLE_CLAIM = 'roles';
    process.env.OIDC_ROLE_MAP = '{"hub-agent":"staff"}';
    process.env.OIDC_DEPARTMENT_CLAIM = 'department';
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    process.env = previousEnv;
  });

  const issueToken = (claims: Record<string, unknown>, overrides: jwt.SignOptions = {}) => {
    const options: jwt.SignOptions = {
    algorithm: 'RS256',
    keyid: 'test-key',
    issuer,
    audience,
    expiresIn: '5m',
    ...overrides,
    };
    if (Object.prototype.hasOwnProperty.call(overrides, 'expiresIn') && overrides.expiresIn === undefined) {
      delete options.expiresIn;
    }
    return jwt.sign({
      sub: 'employee-oidc-42',
      roles: ['hub-agent'],
      department: 'IT',
      ...claims,
    }, privateKey, options);
  };

  it('verifies signature and maps trusted token claims to the actor', async () => {
    const actor = await new OidcAuthService().authenticate(issueToken({}));
    expect(actor).toEqual({ id: 'employee-oidc-42', role: 'staff', departmentId: 'IT' });
  });

  it('rejects tokens with a wrong issuer or audience', async () => {
    const wrongIssuer = issueToken({}, { issuer: 'https://untrusted.example' });
    const wrongAudience = issueToken({}, { audience: 'another-api' });
    await expect(new OidcAuthService().authenticate(wrongIssuer)).rejects.toThrow('invalid or expired');
    await expect(new OidcAuthService().authenticate(wrongAudience)).rejects.toThrow('invalid or expired');
  });

  it('rejects validly signed tokens without a recognized role or department', async () => {
    await expect(new OidcAuthService().authenticate(issueToken({ roles: ['unknown-role'] })))
      .rejects.toThrow('subject or role claim');
    await expect(new OidcAuthService().authenticate(issueToken({ department: undefined })))
      .rejects.toThrow('department claim');
  });

  it('rejects correctly signed access tokens without an expiry', async () => {
    await expect(new OidcAuthService().authenticate(issueToken({}, { expiresIn: undefined })))
      .rejects.toThrow('valid expiry');
  });
});