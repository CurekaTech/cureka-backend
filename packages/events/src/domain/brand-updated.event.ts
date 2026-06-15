import { CacheDomainAction } from './cache-action.type';

export class BrandUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
