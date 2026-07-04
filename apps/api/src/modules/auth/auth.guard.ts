import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { JwtSignService } from './jwt.service';

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtSignService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7)
      : (req.cookies as Record<string, string> | undefined)?.access_token;
    if (!token) throw new UnauthorizedException('Требуется авторизация');
    try {
      req.user = await this.jwt.verifyAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Токен недействителен или истёк');
    }
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
