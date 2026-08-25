import { ConfigService } from '@nestjs/config';
import { Msg91SmsService } from './msg91-sms.service';

const TEST_MOBILE = '919876543210';
const TEST_AUTHKEY = 'msg91-super-secret-authkey';

function buildService(): Msg91SmsService {
  const values: Record<string, unknown> = {
    'msg91.enabled': true,
    'msg91.authKey': TEST_AUTHKEY,
    'msg91.baseUrl': 'https://control.msg91.com/api/v5',
    'msg91.timeoutMs': 5000,
    'msg91.shortUrl': '0',
    'msg91.senderId': 'CUREKA',
    'msg91.dltTemplateId': 'dlt-1',
    'msg91.peId': 'pe-1',
    'msg91.passSenderInFlow': true,
    'msg91.orderThankYouTemplateText': 'Hello ##var1##',
    'msg91.otpTemplateId': 'otp-1',
    'msg91.orderThankYouTemplateId': 'flow-1',
  };
  const config = {
    get: <T>(key: string): T => values[key] as T,
  } as ConfigService;
  return new Msg91SmsService(config);
}

describe('Msg91SmsService privacy logging', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not log raw mobile, authkey, or sensitive response headers', async () => {
    const service = buildService();
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ type: 'success', request_id: 'req-1' }),
      headers: {
        forEach(cb: (value: string, key: string) => void) {
          cb('application/json', 'content-type');
          cb('session=leaked', 'set-cookie');
          cb('Bearer leaked', 'authorization');
          cb(TEST_AUTHKEY, 'authkey');
        },
      },
    }) as unknown as typeof fetch;

    await service.sendFlowSms({
      templateId: 'flow-1',
      phone: TEST_MOBILE,
      variables: { var1: 'ORD-1' },
      context: { source: 'test' },
    });

    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls];
    const serialized = JSON.stringify(allCalls);

    expect(serialized).not.toContain(TEST_MOBILE);
    expect(serialized).not.toContain(`"mobiles":"${TEST_MOBILE}"`);
    expect(serialized).not.toContain(TEST_AUTHKEY);
    expect(serialized).not.toContain('session=leaked');
    expect(serialized).not.toContain('Bearer leaked');
    expect(serialized).not.toMatch(/Mobile:\n?919876543210/);

    const requestLog = logSpy.mock.calls.find(
      (call) => call[1] === '[MSG91-SMS] Sending Flow SMS (structured)',
    );
    const requestPayload = requestLog?.[0] as Record<string, unknown> | undefined;
    expect(requestPayload).toEqual(
      expect.objectContaining({
        phoneMasked: expect.any(String),
        payload: expect.objectContaining({
          recipients: [
            expect.objectContaining({
              phoneMasked: expect.any(String),
              var1: 'ORD-1',
            }),
          ],
        }),
      }),
    );
    expect(JSON.stringify(requestPayload?.['payload'])).not.toContain('"mobiles"');
  });
});
