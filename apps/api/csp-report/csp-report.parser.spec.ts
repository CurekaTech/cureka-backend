import { parseCspReportBody } from './csp-report.parser';

describe('parseCspReportBody', () => {
  it('parses a CSP report JSON body', () => {
    expect(
      parseCspReportBody(
        '{"csp-report":{"violated-directive":"script-src","document-uri":"https://www.cureka.com/"}}',
      ),
    ).toEqual({
      'csp-report': {
        'violated-directive': 'script-src',
        'document-uri': 'https://www.cureka.com/',
      },
    });
  });

  it('returns null for an empty body and keeps unreadable text', () => {
    expect(parseCspReportBody('   ')).toBeNull();
    expect(parseCspReportBody('not-json')).toEqual({ unparsed: 'not-json' });
  });
});
