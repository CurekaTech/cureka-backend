import { CacheDomainAction } from './cache-action.type';

export class PackerUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
