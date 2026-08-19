import { CacheDomainAction } from './cache-action.type';

export class WellnessGoalUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
