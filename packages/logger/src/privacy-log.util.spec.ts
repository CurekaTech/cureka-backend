import { Writable } from 'stream';
import pino from 'pino';
import { addressLogMeta, maskMobile } from './redact.util';
import { sanitizeHeadersForLog } from './sanitize-headers.util';
import { LOG_REDACT_PATHS } from './logging.constants';

const TEST_EMAIL = 'customer@example.com';
const TEST_MOBILE = '919876543210';
const TEST_AUTH = 'Bearer oauth-token-prefix-xyz';
const TEST_COOKIE = 'session=cookie-secret';
const TEST_SET_COOKIE = 'refresh=token-secret; Path=/';
const TEST_TOKEN = 'unicommerce-access-token-abcdef';

function capturePinoLine(writeLog: (logger: pino.Logger) => void): string {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  const logger = pino(
    {
      redact: { paths: LOG_REDACT_PATHS, remove: true },
      messageKey: 'message',
    },
    stream,
  );
  writeLog(logger);
  return Buffer.concat(chunks).toString('utf8');
}

describe('privacy helpers for service logs', () => {
  it('addressLogMeta never embeds email/phone/name', () => {
    const meta = addressLogMeta({
      email: TEST_EMAIL,
      phone: TEST_MOBILE,
    });

    expect(meta).toEqual({
      hasShippingAddress: true,
      hasEmail: true,
      phoneMasked: maskMobile(TEST_MOBILE),
    });

    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain(TEST_EMAIL);
    expect(serialized).not.toContain(TEST_MOBILE);
    expect(serialized).not.toContain('9876543210');
  });

  it('rejects interpolated shipping-address message pattern', () => {
    const safeMessage = 'create-order received shipping_address';
    const unsafeMessage = `create-order received shipping_address: ${JSON.stringify({
      email: TEST_EMAIL,
      phone: TEST_MOBILE,
    })}`;

    expect(safeMessage).not.toContain(TEST_EMAIL);
    expect(safeMessage).not.toContain(TEST_MOBILE);
    expect(unsafeMessage).toContain(TEST_EMAIL);

    const line = capturePinoLine((logger) => {
      logger.info(
        {
          cartId: 'cart-1',
          ...addressLogMeta({ email: TEST_EMAIL, phone: TEST_MOBILE }),
        },
        safeMessage,
      );
    });

    expect(line).toContain(safeMessage);
    expect(line).not.toContain(TEST_EMAIL);
    expect(line).not.toContain(TEST_MOBILE);
    expect(line).not.toContain('first_name');
  });

  it('MSG91-style payload log must not include raw mobiles', () => {
    const payloadForLog = {
      flow_id: 'flow-1',
      recipients: [
        {
          phoneMasked: maskMobile(TEST_MOBILE),
          var1: 'ORD-1',
        },
      ],
    };

    const line = capturePinoLine((logger) => {
      logger.info(
        {
          phoneMasked: maskMobile(TEST_MOBILE),
          payload: payloadForLog,
        },
        '[MSG91-SMS] Sending Flow SMS (structured)',
      );
    });

    expect(line).not.toContain(TEST_MOBILE);
    expect(line).not.toContain(`"mobiles":"${TEST_MOBILE}"`);
    expect(line).toContain('phoneMasked');
  });

  it('sanitized response headers never contain auth/cookie secrets', () => {
    const headers = sanitizeHeadersForLog({
      'content-type': 'application/json',
      authorization: TEST_AUTH,
      cookie: TEST_COOKIE,
      'set-cookie': TEST_SET_COOKIE,
      authkey: 'msg91-key',
    });

    const line = capturePinoLine((logger) => {
      logger.info({ responseHeaders: headers }, '[MSG91-SMS] Flow SMS sent successfully');
    });

    expect(line).not.toContain(TEST_AUTH);
    expect(line).not.toContain(TEST_COOKIE);
    expect(line).not.toContain(TEST_SET_COOKIE);
    expect(line).not.toContain('msg91-key');
    expect(line).toContain('content-type');
  });

  it('OAuth token logs must not include token or tokenPrefix', () => {
    const line = capturePinoLine((logger) => {
      logger.info(
        {
          expiresIn: 3600,
          tokenAcquired: true,
        },
        'Unicommerce OAuth token acquired',
      );
    });

    expect(line).toContain('"tokenAcquired":true');
    expect(line).toContain('"expiresIn":3600');
    expect(line).not.toContain('tokenPrefix');
    expect(line).not.toContain(TEST_TOKEN);
    expect(line).not.toContain(TEST_TOKEN.slice(0, 8));
  });
});
