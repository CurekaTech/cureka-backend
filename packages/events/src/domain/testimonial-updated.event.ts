import { CacheDomainAction } from './cache-action.type';

export class TestimonialUpdatedEvent {
  constructor(
    public readonly refId: string,
    public readonly action: CacheDomainAction,
  ) {}
}
