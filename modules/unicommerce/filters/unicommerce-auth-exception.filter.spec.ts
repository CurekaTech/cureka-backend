import { UnicommerceAuthExceptionFilter } from './unicommerce-auth-exception.filter';

describe('UnicommerceAuthExceptionFilter', () => {
  const filter = new UnicommerceAuthExceptionFilter();

  it('returns INVALID_CREDENTIALS shape with HTTP 200 for validation errors', () => {
    const send = jest.fn();
    const header = jest.fn().mockReturnValue({ send });
    const code = jest.fn().mockReturnValue({ header });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ code, header }),
      }),
    };

    filter.catch(new Error('validation failed'), host as never);

    expect(code).toHaveBeenCalledWith(200);
    expect(header).toHaveBeenCalledWith('Content-Type', 'application/json; charset=UTF-8');
    expect(send).toHaveBeenCalledWith({ status: 'INVALID_CREDENTIALS' });
  });

  it('returns INVALID_CREDENTIALS shape with HTTP 200 for unexpected server errors', () => {
    const send = jest.fn();
    const header = jest.fn().mockReturnValue({ send });
    const code = jest.fn().mockReturnValue({ header });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ code, header }),
      }),
    };

    filter.catch(new Error('database unavailable'), host as never);

    expect(code).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith({ status: 'INVALID_CREDENTIALS' });
  });
});
