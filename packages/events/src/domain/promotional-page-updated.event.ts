import { CacheDomainAction } from './cache-action.type';

export class PromotionalPageUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly pageId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
