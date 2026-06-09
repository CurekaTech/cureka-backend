import { CacheDomainAction } from './cache-action.type';

export class ImporterUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
