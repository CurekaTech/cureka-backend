import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type SendMailPayload = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private missingConfigLogged = false;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const host = this.configService.get<string>('smtp.host') ?? '';
    const from = this.configService.get<string>('smtp.from') ?? '';
    return Boolean(host && from);
  }

  private getTransporter(): Transporter | null {
    if (!this.isConfigured()) {
      if (!this.missingConfigLogged) {
        this.logger.warn(
          'SMTP is not configured (SMTP_HOST / SMTP_FROM). Outbound email disabled.',
        );
        this.missingConfigLogged = true;
      }
      return null;
    }

    if (!this.transporter) {
      const host = this.configService.get<string>('smtp.host')!;
      const port = this.configService.get<number>('smtp.port') ?? 587;
      const secure = this.configService.get<boolean>('smtp.secure') ?? false;
      const user = this.configService.get<string>('smtp.user') ?? '';
      const pass = this.configService.get<string>('smtp.pass') ?? '';

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });
    }

    return this.transporter;
  }

  async send(payload: SendMailPayload): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      throw new Error('SMTP is not configured');
    }

    const from = this.configService.get<string>('smtp.from')!;
    await transporter.sendMail({
      from,
      to: payload.to.join(', '),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  }
}
