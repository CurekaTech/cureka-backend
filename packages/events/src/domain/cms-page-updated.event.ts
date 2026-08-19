import { CacheDomainAction } from './cache-action.type';

export class CmsPageUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
