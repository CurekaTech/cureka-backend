import { CacheDomainAction } from './cache-action.type';

export class BlogPostUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
