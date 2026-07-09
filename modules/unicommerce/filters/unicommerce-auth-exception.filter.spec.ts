import { HttpStatus } from '@nestjs/common';
import { UnicommerceAuthExceptionFilter } from './unicommerce-auth-exception.filter';

describe('UnicommerceAuthExceptionFilter', () => {
  const filter = new UnicommerceAuthExceptionFilter();

  it('returns INVALID_CREDENTIALS shape for validation errors', () => {
    const send = jest.fn();
    const code = jest.fn().mockReturnValue({ send });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ code }),
      }),
    };

    filter.catch(new Error('validation failed'), host as never);

    expect(code).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(send).toHaveBeenCalledWith({ status: 'INVALID_CREDENTIALS' });
  });

  it('returns INVALID_CREDENTIALS shape for unexpected server errors', () => {
    const send = jest.fn();
    const code = jest.fn().mockReturnValue({ send });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ code }),
      }),
    };

    filter.catch(new Error('database unavailable'), host as never);

    expect(code).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(send).toHaveBeenCalledWith({ status: 'INVALID_CREDENTIALS' });
  });
});
