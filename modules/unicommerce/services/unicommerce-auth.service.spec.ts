import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnicommerceAuthService } from './unicommerce-auth.service';

describe('UnicommerceAuthService', () => {
  let service: UnicommerceAuthService;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'UNICOMMERCE_USERNAME') return 'curekamarketplace_official';
      if (key === 'UNICOMMERCE_PASSWORD') return 'CurekaMp@123';
      return undefined;
    }),
  };

  const jwtService = {
    sign: jest.fn().mockReturnValue('token-123'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnicommerceAuthService,
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(UnicommerceAuthService);
  });

  it('returns SUCCESS for valid username/password', () => {
    const result = service.authenticate({
      username: 'curekamarketplace_official',
      password: 'CurekaMp@123',
    });

    expect(result).toEqual({ status: 'SUCCESS', accessToken: 'token-123' });
  });

  it('accepts merchantID when username is omitted', () => {
    const result = service.authenticate({
      merchantID: 'curekamarketplace_official',
      password: 'CurekaMp@123',
    });

    expect(result).toEqual({ status: 'SUCCESS', accessToken: 'token-123' });
    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'curekamarketplace_official', type: 'unicommerce' },
      expect.any(Object),
    );
  });

  it('returns INVALID_CREDENTIALS for wrong password', () => {
    const result = service.authenticate({
      username: 'curekamarketplace_official',
      password: 'wrong',
    });

    expect(result).toEqual({ status: 'INVALID_CREDENTIALS' });
  });
});
