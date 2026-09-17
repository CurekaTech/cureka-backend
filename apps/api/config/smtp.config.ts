import { registerAs } from '@nestjs/config';

export const smtpConfig = registerAs('smtp', () => {
  const port = Number(process.env['SMTP_PORT'] ?? 587);
  const secureEnv = process.env['SMTP_SECURE'];
  const secure =
    secureEnv !== undefined
      ? secureEnv.toLowerCase() === 'true'
      : port === 465;

  return {
    host: (process.env['SMTP_HOST'] ?? '').trim(),
    port,
    secure,
    user: (process.env['SMTP_USER'] ?? '').trim(),
    pass: process.env['SMTP_PASS'] ?? '',
    from: (process.env['SMTP_FROM'] ?? '').trim(),
  };
});
