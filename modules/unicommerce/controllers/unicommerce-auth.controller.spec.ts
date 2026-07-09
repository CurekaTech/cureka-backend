import { Test, TestingModule } from '@nestjs/testing';
import { UnicommerceAuthController } from './unicommerce-auth.controller';
import { UnicommerceAuthService } from '../services/unicommerce-auth.service';
import type { FastifyReply } from 'fastify';

describe('UnicommerceAuthController', () => {
  let controller: UnicommerceAuthController;
  let authService: { authenticate: jest.Mock };

  beforeEach(async () => {
    authService = {
      authenticate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnicommerceAuthController],
      providers: [{ provide: UnicommerceAuthService, useValue: authService }],
    }).compile();

    controller = module.get(UnicommerceAuthController);
  });

  function createReply(): FastifyReply {
    return {
      code: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as FastifyReply;
  }

  it('returns SUCCESS payload for GET authToken', async () => {
    authService.authenticate.mockReturnValue({
      status: 'SUCCESS',
      accessToken: 'token-123',
    });
    const res = createReply();
    const dto = { username: 'seller', password: 'secret' };

    await controller.getAuthTokenViaQuery(dto, res);

    expect(authService.authenticate).toHaveBeenCalledWith(dto);
    expect(res.code).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ status: 'SUCCESS', accessToken: 'token-123' });
  });

  it('returns INVALID_CREDENTIALS with 401 for POST authToken', async () => {
    authService.authenticate.mockReturnValue({ status: 'INVALID_CREDENTIALS' });
    const res = createReply();
    const dto = { username: 'seller', password: 'wrong' };

    await controller.getAuthTokenViaBody(dto, res);

    expect(authService.authenticate).toHaveBeenCalledWith(dto);
    expect(res.code).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({ status: 'INVALID_CREDENTIALS' });
  });

  it('passes connector payload fields through to auth service', async () => {
    authService.authenticate.mockReturnValue({
      status: 'SUCCESS',
      accessToken: 'token-123',
    });
    const res = createReply();
    const dto = {
      username: 'seller',
      password: 'secret',
      merchantID: 'seller',
      channelWarehouseCodeToUniwareFacilityCode: '{}',
    };

    await controller.getAuthTokenViaBody(dto, res);

    expect(authService.authenticate).toHaveBeenCalledWith(dto);
    expect(res.send).toHaveBeenCalledWith({ status: 'SUCCESS', accessToken: 'token-123' });
  });
});
