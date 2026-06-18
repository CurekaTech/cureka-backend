import { Injectable } from '@nestjs/common';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import { HomepageSectionsResponse } from '../interfaces/homepage-section.interface';
import { HomepageService } from './homepage.service';

@Injectable()
export class HomepageSectionsService {
  private readonly loaders: Partial<
    Record<HomepageSectionKey, () => Promise<HomepageSectionsResponse[HomepageSectionKey]>>
  > = {
    [HomepageSectionKey.SHOP_BY_CATEGORY]: () => this.homepageService.getShopByCategoryTree(),
  };

  constructor(private readonly homepageService: HomepageService) {}

  async getSections(requested?: HomepageSectionKey[]): Promise<HomepageSectionsResponse> {
    const availableKeys = Object.keys(this.loaders) as HomepageSectionKey[];
    const sectionKeys = requested?.length
      ? requested.filter((key) => key in this.loaders)
      : availableKeys;

    const entries = await Promise.all(
      sectionKeys.map(async (key) => {
        const loader = this.loaders[key]!;
        return [key, await loader()] as const;
      }),
    );

    return Object.fromEntries(entries) as HomepageSectionsResponse;
  }
}
