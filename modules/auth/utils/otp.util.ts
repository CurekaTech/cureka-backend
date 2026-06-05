// import * as crypto from 'crypto'; // TODO: uncomment after SMS provider integration
import * as bcrypt from 'bcrypt';

/** bcrypt rounds for OTP hashing — lower than password since OTPs are short-lived */
const OTP_SALT_ROUNDS = 10;

export const OTP_CONFIG = {
  /** OTP validity window in minutes */
  EXPIRY_MINUTES: 5,
  /** Maximum verification attempts before the OTP is locked */
  MAX_ATTEMPTS: 5,
  /** Number of digits in the generated OTP */
  LENGTH: 4,
} as const;

/**
 * TODO: After SMS provider integration, replace the static OTP below with:
 * return String(crypto.randomInt(1000, 10000));
 */
export const generateOtp = (): string => '1234';

/**
 * Hashes an OTP using bcrypt before persisting to the database.
 * Never store plain-text OTPs.
 */
export const hashOtp = async (otp: string): Promise<string> =>
  bcrypt.hash(otp, OTP_SALT_ROUNDS);

/**
 * Compares a plain OTP against a stored bcrypt hash.
 */
export const compareOtp = async (plainOtp: string, hashedOtp: string): Promise<boolean> =>
  bcrypt.compare(plainOtp, hashedOtp);

/**
 * Returns the expiry Date object for a freshly issued OTP.
 */
export const getOtpExpiry = (): Date => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_CONFIG.EXPIRY_MINUTES);
  return expiry;
};

/**
 * Returns true if the OTP expiry timestamp has passed.
 */
export const isOtpExpired = (expiresAt: Date): boolean => new Date() > expiresAt;
