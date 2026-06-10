import { CacheDomainAction } from './cache-action.type';

export class BannerUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
