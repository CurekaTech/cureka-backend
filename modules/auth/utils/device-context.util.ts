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

/** Prefer real client IP when the API sits behind nginx / a load balancer. */
export const resolveClientIp = (req: FastifyRequest): string | undefined => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    const first = forwarded[0].split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return req.ip;
};

export const extractDeviceContext = (req: FastifyRequest): IDeviceContext => {
  const userAgent = req.headers['user-agent'];
  const { browser, os } = parseUserAgent(userAgent);
  const ipAddress = resolveClientIp(req);

  const headerDeviceId = req.headers[DEVICE_ID_HEADER];
  const deviceId =
    (typeof headerDeviceId === 'string' && headerDeviceId.trim()) ||
    createHash('sha256')
      .update(`${userAgent ?? 'unknown'}|${ipAddress ?? 'unknown'}`)
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
    ipAddress,
  };
};
