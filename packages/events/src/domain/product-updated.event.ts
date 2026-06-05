import { CacheDomainAction } from './cache-action.type';

export class ProductUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
