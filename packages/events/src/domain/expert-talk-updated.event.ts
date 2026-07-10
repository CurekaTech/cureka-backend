import { CacheDomainAction } from './cache-action.type';

export class ExpertTalkUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
