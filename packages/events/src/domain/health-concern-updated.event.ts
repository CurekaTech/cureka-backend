import { CacheDomainAction } from './cache-action.type';

export class HealthConcernUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
