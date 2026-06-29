import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UnicommerceUnauthorizedFilter } from './unicommerce-exception.filter';
import { UnicommerceUnauthorizedException } from '../exceptions/unicommerce-unauthorized.exception';

describe('UnicommerceUnauthorizedFilter', () => {
  const filter = new UnicommerceUnauthorizedFilter();

  const createHost = (send: jest.Mock): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getResponse: () =>
          ({
            code: jest.fn().mockReturnValue({ send }),
          }) as unknown as FastifyReply,
      }),
    }) as ArgumentsHost;

  it('returns empty object for productsCount auth failures', () => {
    const send = jest.fn();
    const code = jest.fn().mockReturnValue({ send });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ code }) as unknown as FastifyReply,
      }),
    } as ArgumentsHost;

    filter.catch(new UnicommerceUnauthorizedException('productsCount'), host);

    expect(code).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(send).toHaveBeenCalledWith({});
  });

  it('returns message for products auth failures', () => {
    const send = jest.fn();
    const code = jest.fn().mockReturnValue({ send });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ code }) as unknown as FastifyReply,
      }),
    } as ArgumentsHost;

    filter.catch(new UnicommerceUnauthorizedException('products'), host);

    expect(send).toHaveBeenCalledWith({ message: 'Invalid User/Token' });
  });

  it('returns failed inventory response for updateInventory auth failures', () => {
    const send = jest.fn();
    const code = jest.fn().mockReturnValue({ send });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ code }) as unknown as FastifyReply,
      }),
    } as ArgumentsHost;

    filter.catch(new UnicommerceUnauthorizedException('updateInventory'), host);

    expect(send).toHaveBeenCalledWith({
      status: 'FAILED',
      failedProductList: [],
    });
  });
});
