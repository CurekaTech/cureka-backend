import { CacheDomainAction } from './cache-action.type';

export class SubscriptionFrequencyUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
