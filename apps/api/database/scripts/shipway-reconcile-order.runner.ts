/**
 * One-order Shipway OMS reconciliation / recovery.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 * Notifications are OFF unless --notify is passed together with --apply.
 * Never recreates the external OMS shipment — only fetches and persists locally.
 *
 * Usage (against the DB pointed to by your local .env — never auto-runs on prod):
 *   npm run shipway:reconcile-order -- --order-id=d56ed9a0-a717-476c-8dbb-2f5aa7a99614
 *   npm run shipway:reconcile-order -- --order-id=d56ed9a0-a717-476c-8dbb-2f5aa7a99614 --awb=11633336773305
 *   npm run shipway:reconcile-order -- --order-id=... --apply
 *   npm run shipway:reconcile-order -- --order-id=... --apply --notify
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { ShipwayShipmentReconciliationService } from '../../../../modules/shipping/services/shipway-shipment-reconciliation.service';
import { BobFulfillmentNotifyOutboxService } from '../../../../modules/bob/services/bob-fulfillment-notify-outbox.service';
import { isBobDispatchedOrLater } from '../../../../modules/bob/mappers/bob.mapper';

interface CliOptions {
  orderId: string;
  awb?: string;
  apply: boolean;
  notify: boolean;
}

const printUsage = (): void => {
  console.log(`
shipway:reconcile-order — Recover a missing local shipments row from OMS

Options:
  --order-id <uuid>   Cureka order UUID (required)
  --awb <awb>         Optional AWB hint
  --apply             Persist DB changes (default: dry-run)
  --notify            After --apply, emit SHIPMENT_UPDATED so BOB outbox may send
                      fulfillment WhatsApp (default: notifications disabled)

Examples:
  npm run shipway:reconcile-order -- --order-id=d56ed9a0-a717-476c-8dbb-2f5aa7a99614
  npm run shipway:reconcile-order -- --order-id=... --awb=11633336773305 --apply
  npm run shipway:reconcile-order -- --order-id=... --apply --notify
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { orderId: '', apply: false, notify: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') {
      opts.apply = true;
      continue;
    }
    if (arg === '--notify') {
      opts.notify = true;
      continue;
    }
    if (arg === '--order-id' || arg.startsWith('--order-id=')) {
      opts.orderId = arg.includes('=')
        ? arg.split('=').slice(1).join('=')
        : argv[++i] ?? '';
      continue;
    }
    if (arg === '--awb' || arg.startsWith('--awb=')) {
      opts.awb = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }
  }
  return opts;
};

async function main(): Promise<void> {
  const logger = new Logger('shipway:reconcile-order');
  const opts = parseCli(process.argv.slice(2));

  if (!opts.orderId.trim()) {
    printUsage();
    process.exit(1);
  }

  if (opts.notify && !opts.apply) {
    logger.error('--notify requires --apply');
    process.exit(1);
  }

  const dbHost = process.env['DB_HOST'] ?? process.env['DATABASE_HOST'] ?? '(unset)';
  const nodeEnv = process.env['NODE_ENV'] ?? '(unset)';
  logger.warn(
    {
      orderId: opts.orderId,
      awb: opts.awb ?? null,
      dryRun: !opts.apply,
      notify: opts.notify,
      nodeEnv,
      dbHost,
      note: 'Confirm this is NOT unexpected production before --apply',
    },
    'Starting Shipway order reconciliation',
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const reconcile = app.get(ShipwayShipmentReconciliationService);
    const fulfillmentOutbox = app.get(BobFulfillmentNotifyOutboxService);
    const result = await reconcile.reconcileOrderByUuid({
      orderUuid: opts.orderId.trim(),
      awbNumber: opts.awb?.trim() ?? null,
      dryRun: !opts.apply,
      notify: opts.notify,
    });

    console.log(JSON.stringify(result, null, 2));

    if (!opts.apply) {
      logger.log('Dry-run complete — re-run with --apply to persist');
    } else if (!opts.notify) {
      if (result.shipment) {
        const suppress = await fulfillmentOutbox.suppressFulfillmentNotify({
          orderId: result.order?.id ?? opts.orderId.trim(),
          orderNumber: result.order?.orderNumber ?? result.shipment.orderNumber,
          shipmentId: result.shipment.id,
          reason: 'recovery_apply_without_notify',
        });
        logger.log(
          {
            suppress,
            note: 'Later webhooks will not enqueue BOB fulfillment while outbox is suppressed/accepted/ambiguous',
          },
          'Applied without notify — wrote durable suppression to bob_notify_outbox',
        );
      } else {
        logger.log('Applied without notify — no shipment to suppress');
      }
    } else if (result.shipment && isBobDispatchedOrLater(result.shipment.shipmentStatus)) {
      logger.log(
        'Applied with notify — SHIPMENT_UPDATED was emitted; check bob_notify_outbox for accepted/failed/ambiguous',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
