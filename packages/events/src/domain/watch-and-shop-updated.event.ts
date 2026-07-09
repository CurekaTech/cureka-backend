import { CacheDomainAction } from './cache-action.type';

export class WatchAndShopUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
