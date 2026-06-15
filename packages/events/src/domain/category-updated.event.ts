import { CacheDomainAction } from './cache-action.type';

export class CategoryUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
