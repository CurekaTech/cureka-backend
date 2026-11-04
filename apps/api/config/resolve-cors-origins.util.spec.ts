import { LOCAL_CORS_FALLBACK, panelOriginsFor, resolveCorsOrigins } from './resolve-cors-origins.util';

describe('panelOriginsFor', () => {
  it('adds doctor and admin siblings for a techbv storefront', () => {
    expect(panelOriginsFor('https://cureka.techbv.in')).toEqual([
      'https://cureka.techbv.in',
      'https://doctor.cureka.techbv.in',
      'https://admin.cureka.techbv.in',
    ]);
  });

  it('strips www before adding panel hosts', () => {
    expect(panelOriginsFor('https://www.cureka.com/')).toEqual([
      'https://www.cureka.com',
      'https://cureka.com',
      'https://doctor.cureka.com',
      'https://admin.cureka.com',
    ]);
  });

  it('does not nest doctor. on an already-panel host', () => {
    expect(panelOriginsFor('https://doctor.cureka.techbv.in')).toEqual([
      'https://doctor.cureka.techbv.in',
    ]);
  });
});

describe('resolveCorsOrigins', () => {
  it('keeps the listed storefront origin and adds the doctor panel', () => {
    const origins = resolveCorsOrigins({
      corsOriginsEnv: 'https://cureka.techbv.in',
      storefrontUrl: 'https://cureka.techbv.in',
    });
    expect(origins).toContain('https://cureka.techbv.in');
    expect(origins).toContain('https://doctor.cureka.techbv.in');
    expect(origins).toContain('https://admin.cureka.techbv.in');
  });

  it('does not drop extra explicit origins', () => {
    const origins = resolveCorsOrigins({
      corsOriginsEnv: 'https://cureka.techbv.in,https://beta.cureka.com',
    });
    expect(origins).toContain('https://cureka.techbv.in');
    expect(origins).toContain('https://beta.cureka.com');
    expect(origins).toContain('https://doctor.beta.cureka.com');
  });

  it('uses local fallbacks when CORS_ORIGINS is empty', () => {
    const origins = resolveCorsOrigins({});
    for (const origin of LOCAL_CORS_FALLBACK.split(',')) {
      expect(origins).toContain(origin);
    }
  });
});
