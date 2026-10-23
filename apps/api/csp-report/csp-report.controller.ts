import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { RawResponse } from '@packages/common';

/**
 * Storefront CSP `report-uri /api/csp-report`.
 * www.cureka.com/api is this process, so the path stays outside the api/v1 prefix.
 */
@Controller('api/csp-report')
export class CspReportController {
  private readonly logger = new Logger(CspReportController.name);

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RawResponse()
  report(@Body() body: unknown): void {
    if (body == null) return;
    try {
      const serialized = typeof body === 'string' ? body : JSON.stringify(body);
      if (!serialized) return;
      this.logger.warn(`[csp-report] ${serialized.slice(0, 4000)}`);
    } catch {
      // A bad report must not become a 500. The browser only needs 204.
    }
  }
}
