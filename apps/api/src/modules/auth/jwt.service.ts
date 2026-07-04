import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey } from 'node:crypto';
import {
  importPKCS8,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';
import type { AccessTokenPayload } from '@vedamatch/shared';

const KID = 'vedamatch-2026-1';

@Injectable()
export class JwtSignService implements OnModuleInit {
  private privateKey!: CryptoKey;
  private publicJwk!: JWK;
  private issuer!: string;
  private ttl!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const b64 = this.config.get<string>('JWT_PRIVATE_KEY_BASE64');
    if (!b64) {
      throw new Error(
        'JWT_PRIVATE_KEY_BASE64 is not set. Generate one with: node scripts/generate-keys.mjs',
      );
    }
    const pem = Buffer.from(b64, 'base64').toString('utf8');
    this.privateKey = await importPKCS8(pem, 'RS256');
    this.publicJwk = createPublicKey(pem).export({ format: 'jwk' });
    this.issuer = this.config.get<string>(
      'API_PUBLIC_URL',
      'http://localhost:4000',
    );
    this.ttl = this.config.get<string>('ACCESS_TOKEN_TTL', '15m');
  }

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({ email: payload.email, role: payload.role })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setAudience('vedamatch')
      .setExpirationTime(this.ttl)
      .sign(this.privateKey);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, this.publicJwk, {
      issuer: this.issuer,
      audience: 'vedamatch',
      algorithms: ['RS256'],
    });
    return {
      sub: payload.sub as string,
      email: payload.email as AccessTokenPayload['email'],
      role: payload.role as AccessTokenPayload['role'],
    };
  }

  getJwks() {
    return {
      keys: [{ ...this.publicJwk, alg: 'RS256', use: 'sig', kid: KID }],
    };
  }
}
