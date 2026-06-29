import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { UnicommerceApiKeyGuard } from './unicommerce-api-key.guard';
import { UnicommerceUnauthorizedException } from '../exceptions/unicommerce-unauthorized.exception';

describe('UnicommerceApiKeyGuard', () => {
  const jwtService = {
    verify: jest.fn(),
  } as unknown as JwtService;

  const guard = new UnicommerceApiKeyGuard(jwtService);

  const createContext = (req: Partial<FastifyRequest>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a valid apiKey header token', () => {
    (jwtService.verify as jest.Mock).mockReturnValue({ sub: 'seller', type: 'unicommerce' });

    const request = {
      url: '/api/v1/unicommerce/products',
      headers: { apikey: 'valid-token' },
    } as unknown as FastifyRequest;

    expect(guard.canActivate(createContext(request))).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
  });

  it('accepts Authorization bearer token', () => {
    (jwtService.verify as jest.Mock).mockReturnValue({ sub: 'seller', type: 'unicommerce' });

    const request = {
      url: '/api/v1/unicommerce/productsCount',
      headers: { authorization: 'Bearer valid-token' },
    } as unknown as FastifyRequest;

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it('rejects missing token with endpoint-specific unauthorized exception', () => {
    const request = {
      url: '/api/v1/unicommerce/productsCount',
      headers: {},
    } as unknown as FastifyRequest;

    expect(() => guard.canActivate(createContext(request))).toThrow(
      UnicommerceUnauthorizedException,
    );

    try {
      guard.canActivate(createContext(request));
    } catch (error) {
      expect(error).toBeInstanceOf(UnicommerceUnauthorizedException);
      expect((error as UnicommerceUnauthorizedException).endpoint).toBe('productsCount');
    }
  });

  it('rejects token with invalid type', () => {
    (jwtService.verify as jest.Mock).mockReturnValue({ sub: 'seller', type: 'admin' });

    const request = {
      url: '/api/v1/unicommerce/updateInventory',
      headers: { apiKey: 'invalid-type-token' },
    } as unknown as FastifyRequest;

    expect(() => guard.canActivate(createContext(request))).toThrow(
      UnicommerceUnauthorizedException,
    );
  });
});
