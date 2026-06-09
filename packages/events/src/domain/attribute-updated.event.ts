import { CacheDomainAction } from './cache-action.type';

export class AttributeUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
