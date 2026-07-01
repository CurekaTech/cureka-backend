import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'typesense';

@Injectable()
export class TypesenseClientService {
  private readonly logger = new Logger(TypesenseClientService.name);
  private adminClient: Client | null = null;
  private searchClient: Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('typesense.enabled') ?? false;
  }

  getCollectionName(): string {
    return this.configService.get<string>('typesense.collection') ?? 'products';
  }

  getAdminClient(): Client {
    if (!this.isEnabled()) {
      throw new Error('Typesense is not configured');
    }

    if (!this.adminClient) {
      this.adminClient = this.createClient(
        this.configService.get<string>('typesense.adminApiKey')!,
      );
    }

    return this.adminClient;
  }

  getSearchClient(): Client {
    if (!this.isEnabled()) {
      throw new Error('Typesense is not configured');
    }

    if (!this.searchClient) {
      const searchKey = this.configService.get<string>('typesense.searchApiKey');
      const apiKey = searchKey?.trim() || this.configService.get<string>('typesense.adminApiKey')!;
      this.searchClient = this.createClient(apiKey);
    }

    return this.searchClient;
  }

  private createClient(apiKey: string): Client {
    const host = this.configService.get<string>('typesense.host')!;
    const parsed = new URL(host);

    const client = new Client({
      nodes: [
        {
          host: parsed.hostname,
          port: parsed.port ? Number(parsed.port) : parsed.protocol === 'http:' ? 80 : 443,
          protocol: parsed.protocol.replace(':', ''),
        },
      ],
      apiKey,
      connectionTimeoutSeconds: 10,
    });

    this.logger.log(`Typesense client configured for ${parsed.protocol}//${parsed.hostname}`);
    return client;
  }
}
