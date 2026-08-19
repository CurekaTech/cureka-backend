import { CacheDomainAction } from './cache-action.type';

export class SupportArticleUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
