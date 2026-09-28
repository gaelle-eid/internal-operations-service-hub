import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import jwksClient = require('jwks-rsa');
import { JwksClient } from 'jwks-rsa';
import { RequestActor } from './requests.service';

@Injectable()
export class OidcAuthService {
  private client: JwksClient | undefined;

  async authenticate(token: string): Promise<RequestActor> {
    const issuer = process.env.OIDC_ISSUER;
    const audience = process.env.OIDC_AUDIENCE;
    const jwksUri = process.env.OIDC_JWKS_URI;
    if (!issuer || !audience || !jwksUri) {
      throw new UnauthorizedException('OIDC issuer, audience, and JWKS URI must be configured');
    }

    const payload = await this.verify(token, issuer, audience, jwksUri);
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('The bearer token must have a valid expiry');
    }
    const roleClaimName = process.env.OIDC_ROLE_CLAIM || 'role';
    const departmentClaimName = process.env.OIDC_DEPARTMENT_CLAIM || 'departmentId';
    const subjectClaimName = process.env.OIDC_SUBJECT_CLAIM || 'sub';
    const roleValue = this.readRole(payload[roleClaimName]);
    const subject = payload[subjectClaimName];
    const departmentId = payload[departmentClaimName];

    if (typeof subject !== 'string' || !roleValue) {
      throw new UnauthorizedException('The access token is missing a valid subject or role claim');
    }
    if (roleValue !== 'employee' && typeof departmentId !== 'string') {
      throw new UnauthorizedException('The access token is missing a department claim');
    }

    return { id: subject, role: roleValue, departmentId: typeof departmentId === 'string' ? departmentId : undefined };
  }

  private verify(token: string, issuer: string, audience: string, jwksUri: string): Promise<jwt.JwtPayload> {
    this.client ??= jwksClient({ jwksUri, cache: true, rateLimit: true, jwksRequestsPerMinute: 10 });
    const algorithm = process.env.OIDC_SIGNING_ALGORITHM || 'RS256';
    if (!['RS256', 'PS256', 'ES256'].includes(algorithm)) {
      throw new UnauthorizedException('OIDC_SIGNING_ALGORITHM must be RS256, PS256, or ES256');
    }

    return new Promise((resolve, reject) => {
      const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
        if (!header.kid) {
          callback(new Error('Token signing key ID is missing'));
          return;
        }
        this.client!.getSigningKey(header.kid, (error, key) => {
          callback(error, key?.getPublicKey());
        });
      };

      jwt.verify(token, getKey, { algorithms: [algorithm as jwt.Algorithm], issuer, audience }, (error, decoded) => {
        if (error || !decoded || typeof decoded === 'string') {
          reject(new UnauthorizedException('The bearer token is invalid or expired'));
          return;
        }
        resolve(decoded);
      });
    });
  }

  private readRole(value: unknown): RequestActor['role'] | undefined {
    const mapping = this.roleMapping();
    const values = Array.isArray(value) ? value : [value];
    for (const claim of values) {
      if (typeof claim !== 'string') continue;
      const mapped = mapping[claim] ?? claim;
      if (mapped === 'employee' || mapped === 'staff' || mapped === 'admin') return mapped;
    }
    return undefined;
  }

  private roleMapping(): Record<string, RequestActor['role']> {
    const raw = process.env.OIDC_ROLE_MAP;
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, RequestActor['role']] =>
        entry[1] === 'employee' || entry[1] === 'staff' || entry[1] === 'admin'));
    } catch {
      throw new UnauthorizedException('OIDC_ROLE_MAP must be a JSON object mapping trusted role values');
    }
  }
}