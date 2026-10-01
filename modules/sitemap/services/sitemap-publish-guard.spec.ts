import { assertSitemapPublishAllowed } from './sitemap-publish-guard';

describe('assertSitemapPublishAllowed', () => {
  it('allows the live host into the production bucket', () => {
    expect(() =>
      assertSitemapPublishAllowed({
        baseUrl: 'https://www.cureka.com',
        storageDriver: 'gcs',
        bucket: 'cureka-files-prod',
        liveOrigin: 'https://www.cureka.com',
      }),
    ).not.toThrow();
  });

  it('allows a techbv host when the bucket is not production', () => {
    expect(() =>
      assertSitemapPublishAllowed({
        baseUrl: 'https://cureka.techbv.in',
        storageDriver: 'gcs',
        bucket: 'cureka-files-staging',
        liveOrigin: 'https://cureka.techbv.in',
      }),
    ).not.toThrow();
  });

  it('refuses to replace the live www index with a techbv host', () => {
    expect(() =>
      assertSitemapPublishAllowed({
        baseUrl: 'https://cureka.techbv.in',
        storageDriver: 'local',
        bucket: null,
        liveOrigin: 'https://www.cureka.com',
      }),
    ).toThrow(/Refusing to replace the live sitemap/);
  });

  it('refuses to write a techbv host into the production bucket even after a bad publish', () => {
    expect(() =>
      assertSitemapPublishAllowed({
        baseUrl: 'https://cureka.techbv.in/',
        storageDriver: 'gcs',
        bucket: 'cureka-files-prod',
        liveOrigin: 'https://cureka.techbv.in',
      }),
    ).toThrow(/production bucket cureka-files-prod/);
  });
});
