import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { getAuditActor } from '../utils/audit-actor.context';

/**
 * Sets PostgreSQL `app.audit_request_id` (SET LOCAL) at the start of every
 * TypeORM transaction so row triggers can stamp field-level history without
 * changing business write paths.
 */
@Injectable()
export class AuditPgCaptureService implements OnModuleInit {
  private readonly logger = new Logger(AuditPgCaptureService.name);
  private installed = false;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    if (this.installed) return;
    const driver = this.dataSource.driver as {
      createQueryRunner: (mode?: string) => QueryRunner;
    };
    const original = driver.createQueryRunner.bind(driver);
    driver.createQueryRunner = (mode?: string) => {
      const runner = original(mode);
      const startTransaction = runner.startTransaction.bind(runner);
      runner.startTransaction = async (isolationLevel?: string) => {
        await startTransaction(isolationLevel as never);
        const captureId = getAuditActor()?.requestId;
        if (!captureId) return;
        try {
          await runner.query(`SELECT set_config('app.audit_request_id', $1, true)`, [captureId.slice(0, 64)]);
        } catch (error) {
          this.logger.warn(
            `Could not set audit capture id: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      };
      return runner;
    };
    this.installed = true;
  }
}
