import { BannerEntity } from '@modules/master/entities/banner.entity';
import { mapBannerToStorefrontItem } from '@modules/master/mappers/banner.mapper';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { mapCategoryEntityToPublicListItem } from './public-category.mapper';

describe('public CMS image alt text', () => {
  it('returns the saved banner and category alt text beside the file', () => {
    const banner = mapBannerToStorefrontItem(
      {
        refId: 'BAN1',
        title: 'Summer',
        imageUrl: { key: 'banners/summer.png', name: 'summer.png' },
        imageAltText: 'Summer sale',
      } as BannerEntity,
      '/shop',
    );
    const category = mapCategoryEntityToPublicListItem({
      refId: 'CAT1',
      name: 'Skin',
      slug: 'skin',
      position: 1,
      hierarchyLevel: 1,
      image: { key: 'categories/skin.png', name: 'skin.png' },
      imageAltText: 'Skin care',
      banner: null,
      bannerAltText: null,
      faqBanner: null,
      faqBannerAltText: '',
    } as unknown as CategoryEntity);

    expect(banner.imageAltText).toBe('Summer sale');
    expect(banner.imageUrl).toEqual({ key: 'banners/summer.png', name: 'summer.png' });
    expect(category.imageAltText).toBe('Skin care');
    expect(category.faqBannerAltText).toBe('');
    expect(category.bannerAltText).toBeNull();
  });
});
