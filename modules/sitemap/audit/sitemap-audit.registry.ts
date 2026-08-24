import { Injectable } from '@nestjs/common';
import { SitemapAuditProvider, SitemapAuditType, isSitemapAuditType } from './sitemap-audit.types';

@Injectable()
export class SitemapAuditRegistry {
  private readonly providers = new Map<SitemapAuditType, SitemapAuditProvider>();

  register(provider: SitemapAuditProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: SitemapAuditType): SitemapAuditProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No sitemap audit provider registered for "${type}"`);
    }
    return provider;
  }

  tryGet(type: string): SitemapAuditProvider | null {
    if (!isSitemapAuditType(type)) return null;
    return this.providers.get(type) ?? null;
  }

  list(): SitemapAuditProvider[] {
    return [...this.providers.values()];
  }

  types(): SitemapAuditType[] {
    return [...this.providers.keys()];
  }
}
