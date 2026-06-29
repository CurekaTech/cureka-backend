import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { UnicommerceUnauthorizedException } from '../exceptions/unicommerce-unauthorized.exception';
import { resolveUnicommerceEndpoint } from '../filters/unicommerce-exception.filter';

export interface IUnicommerceRequest extends FastifyRequest {
  unicommerceUsername?: string;
}

@Injectable()
export class UnicommerceApiKeyGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IUnicommerceRequest>();
    const endpoint = resolveUnicommerceEndpoint(request);
    const token = this.extractToken(request);

    if (!token) {
      throw new UnicommerceUnauthorizedException(endpoint);
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; type?: string }>(token);
      if (payload.type !== 'unicommerce') {
        throw new Error('invalid token type');
      }
      request.unicommerceUsername = payload.sub;
      return true;
    } catch {
      throw new UnicommerceUnauthorizedException(endpoint);
    }
  }

  private extractToken(req: FastifyRequest): string | null {
    const apiKeyHeader = req.headers['apikey'] ?? req.headers['apiKey'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
      return apiKeyHeader.trim();
    }

    const authorization = req.headers['authorization'];
    if (!authorization || typeof authorization !== 'string') {
      return null;
    }

    if (authorization.startsWith('Bearer ')) {
      return authorization.slice(7).trim() || null;
    }

    return authorization.trim() || null;
  }
}
