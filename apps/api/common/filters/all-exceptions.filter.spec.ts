import { HttpException, HttpStatus, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter logging', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  const makeHost = () => {
    const send = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnValue({ send });
    const code = jest.fn().mockReturnValue({ header: jest.fn().mockReturnValue({ send }) });
    const response = { status, code, header: jest.fn().mockReturnThis(), send };
    const request = {
      id: 'test-request-id',
      method: 'GET',
      url: '/api/v1/secure-resource?token=secret',
    };
    return {
      host: {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => request,
        }),
      } as never,
      response,
      request,
      send,
    };
  };

  it('logs 401 as warn with requestId and does not change response shape', () => {
    const { host, response, send } = makeHost();
    const warnSpy = jest.spyOn((filter as any).logger, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);

    filter.catch(new UnauthorizedException('Unauthorized'), host);

    expect(warnSpy).toHaveBeenCalled();
    const [payload, message] = warnSpy.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        requestId: 'test-request-id',
        method: 'GET',
        statusCode: HttpStatus.UNAUTHORIZED,
        path: '/api/v1/secure-resource',
      }),
    );
    expect(message).toBe('Request rejected');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.UNAUTHORIZED,
      }),
    );
  });

  it('logs 403 as warn', () => {
    const { host } = makeHost();
    const warnSpy = jest.spyOn((filter as any).logger, 'warn').mockImplementation(() => undefined);

    filter.catch(new ForbiddenException('Forbidden'), host);

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({ statusCode: HttpStatus.FORBIDDEN }),
    );
  });

  it('logs 500 as error with stack', () => {
    const { host } = makeHost();
    const errorSpy = jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);

    filter.catch(new Error('boom'), host);

    expect(errorSpy).toHaveBeenCalled();
    const [payload, message] = errorSpy.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        requestId: 'test-request-id',
        method: 'GET',
        path: '/api/v1/secure-resource',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorName: 'Error',
        errorType: 'Error',
        errorMessage: 'boom',
        stack: expect.any(String),
      }),
    );
    expect(message).toBe('Request failed');
  });

  it('logs 400 as warn', () => {
    const { host } = makeHost();
    const warnSpy = jest.spyOn((filter as any).logger, 'warn').mockImplementation(() => undefined);

    filter.catch(new HttpException('bad', HttpStatus.BAD_REQUEST), host);

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST }),
    );
  });
});
