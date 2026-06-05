import { createHash } from 'crypto';
import { FastifyRequest } from 'fastify';
import { IDeviceContext } from '../interfaces/session.interface';

const DEVICE_ID_HEADER = 'x-device-id';
const DEVICE_NAME_HEADER = 'x-device-name';

const parseUserAgent = (userAgent?: string): { browser?: string; os?: string } => {
  if (!userAgent) return {};

  let os: string | undefined;
  if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/mac os x/i.test(userAgent)) os = 'macOS';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  let browser: string | undefined;
  if (/edg\//i.test(userAgent)) browser = 'Edge';
  else if (/chrome\//i.test(userAgent)) browser = 'Chrome';
  else if (/safari\//i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/firefox\//i.test(userAgent)) browser = 'Firefox';

  return { browser, os };
};

export const extractDeviceContext = (req: FastifyRequest): IDeviceContext => {
  const userAgent = req.headers['user-agent'];
  const { browser, os } = parseUserAgent(userAgent);

  const headerDeviceId = req.headers[DEVICE_ID_HEADER];
  const deviceId =
    (typeof headerDeviceId === 'string' && headerDeviceId.trim()) ||
    createHash('sha256')
      .update(`${userAgent ?? 'unknown'}|${req.ip ?? 'unknown'}`)
      .digest('hex')
      .slice(0, 32);

  const headerDeviceName = req.headers[DEVICE_NAME_HEADER];
  const deviceName =
    (typeof headerDeviceName === 'string' && headerDeviceName.trim()) ||
    [browser, os].filter(Boolean).join(' on ') ||
    'Unknown device';

  return {
    deviceId,
    deviceName,
    browser,
    os,
    ipAddress: req.ip,
  };
};
