import { Logger } from '@nestjs/common';
import { CspReportController } from './csp-report.controller';

describe('CspReportController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a violation report and returns no body', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const controller = new CspReportController();

    expect(
      controller.report({ 'csp-report': { 'violated-directive': 'script-src' } }),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"violated-directive":"script-src"'),
    );
  });

  it('accepts an empty report without logging', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    new CspReportController().report(null);
    expect(warn).not.toHaveBeenCalled();
  });
});
