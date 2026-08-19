import { CacheDomainAction } from './cache-action.type';

export class HomeSectionUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
