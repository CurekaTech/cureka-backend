/**
 * Manual BOB /fulfillments-create smoke test (WhatsApp #2 path).
 *
 * SAFE BY DEFAULT — prints payload + config only unless --send is passed.
 * Reads BOB_* from process env / Nest config (same as production workers).
 * WHATSAPP_* env is ignored by Cureka — BOB sends WhatsApp after accepting this API.
 *
 * Usage:
 *   npm run bob:test-fulfillment -- --order-id=<uuid>
 *   npm run bob:test-fulfillment -- --order-id=<uuid> --awb=11633336773305
 *   npm run bob:test-fulfillment -- --order-id=<uuid> --awb=... --phone=+91XXXXXXXXXX --send
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { OrdersRepository } from '../../../../modules/orders/repositories/orders.repository';
import { ShipmentsRepository } from '../../../../modules/shipping/repositories/shipments.repository';
import { BobNotifyService } from '../../../../modules/bob/services/bob-notify.service';
import { mapBobFulfillment } from '../../../../modules/bob/mappers/bob.mapper';
import { ShipmentEntity } from '../../../../modules/shipping/entities/shipment.entity';
import { toBobE164Phone } from '../../../../modules/bob/utils/bob.util';

interface CliOptions {
  orderId: string;
  awb?: string;
  phone?: string;
  send: boolean;
}

const printUsage = (): void => {
  console.log(`
bob:test-fulfillment — POST BOB /fulfillments-create for one order

Options:
  --order-id <uuid>   Cureka order UUID (required)
  --awb <awb>         Override / fill tracking_number when shipment AWB missing
  --phone <+91...>    Override recipient phone (E.164) for a safe test number
  --send              Actually POST to BOB_NOTIFY_URL (default: dry-run print only)

Env required (server .env):
  BOB_NOTIFY_URL      e.g. https://customstore.bonb.io/curekanew
  BOB_GUEST_ID        x-guest-id / x-api-key value
  BOB_API_KEY         optional; workers currently send guest id as api key
  BOB_TIMEOUT_MS      optional (default 15000)

Examples:
  npm run bob:test-fulfillment -- --order-id=d56ed9a0-a717-476c-8dbb-2f5aa7a99614
  npm run bob:test-fulfillment -- --order-id=... --awb=11633336773305 --send
`);
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = { orderId: '', send: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--send') {
      opts.send = true;
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
    if (arg === '--phone' || arg.startsWith('--phone=')) {
      opts.phone = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }
  }
  return opts;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid-url)';
  }
};

const mask = (value: string | undefined): string => {
  if (!value) return '(missing)';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
};

async function main(): Promise<void> {
  const logger = new Logger('bob:test-fulfillment');
  const opts = parseCli(process.argv.slice(2));

  if (!opts.orderId.trim()) {
    printUsage();
    process.exit(1);
  }

  const bobNotifyUrl = (process.env['BOB_NOTIFY_URL'] ?? '').trim();
  const bobGuestId = (process.env['BOB_GUEST_ID'] ?? '').trim();
  const bobApiKey = (process.env['BOB_API_KEY'] ?? '').trim();

  logger.warn(
    {
      orderId: opts.orderId,
      awb: opts.awb ?? null,
      phoneOverride: Boolean(opts.phone),
      dryRun: !opts.send,
      bobNotifyHost: bobNotifyUrl ? hostOf(bobNotifyUrl) : '(unset)',
      bobGuestId: mask(bobGuestId),
      bobApiKey: mask(bobApiKey || bobGuestId),
      note: 'WHATSAPP_* is ignored — BOB sends WhatsApp after /fulfillments-create',
    },
    'Starting BOB fulfillment API test',
  );

  if (!bobNotifyUrl || !bobGuestId) {
    logger.error('BOB_NOTIFY_URL and BOB_GUEST_ID must be set in the environment');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const ordersRepository = app.get(OrdersRepository);
    const shipmentsRepository = app.get(ShipmentsRepository);
    const bobNotify = app.get(BobNotifyService);

    const order = await ordersRepository.findByIdOrRefId(opts.orderId.trim());
    if (!order) {
      throw new Error(`Order not found: ${opts.orderId}`);
    }

    let shipment = await shipmentsRepository.findByOrderId(order.id);
    if (!shipment && opts.awb?.trim()) {
      shipment = {
        id: 'synthetic-for-bob-test',
        orderId: order.id,
        orderNumber: order.orderNumber,
        awbNumber: opts.awb.trim(),
        trackingUrl: null,
        courierName: 'TestCourier',
        pushedAt: new Date(),
        updatedAt: new Date(),
      } as ShipmentEntity;
      logger.warn(
        { awb: opts.awb.trim() },
        'No local shipment row — using synthetic shipment for payload only',
      );
    }

    if (!shipment) {
      throw new Error(
        'No local shipment for order. Pass --awb=... or run shipway:reconcile-order --apply first.',
      );
    }

    if (opts.awb?.trim() && shipment.awbNumber !== opts.awb.trim()) {
      shipment = { ...shipment, awbNumber: opts.awb.trim() } as ShipmentEntity;
    }

    const payload = mapBobFulfillment(order, shipment);
    if (opts.phone?.trim()) {
      const phone = toBobE164Phone(opts.phone.trim());
      payload.phone = phone;
      payload.customer.phone = phone;
    }

    const idempotencyKey = `fulfillments-create:test:${order.id}:${Date.now()}`;

    console.log(
      JSON.stringify(
        {
          dryRun: !opts.send,
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            paymentMethod: order.paymentMethod,
            orderStatus: order.orderStatus,
          },
          shipment: {
            id: shipment.id,
            awbNumber: shipment.awbNumber,
            courierName: shipment.courierName,
          },
          endpoint: `${bobNotifyUrl.replace(/\/$/, '')}/fulfillments-create`,
          idempotencyKey,
          payload,
        },
        null,
        2,
      ),
    );

    if (!opts.send) {
      logger.log('Dry-run complete — re-run with --send to POST to BOB');
      return;
    }

    const result = await bobNotify.post('/fulfillments-create', payload, {
      idempotencyKey,
    });

    console.log(JSON.stringify({ result }, null, 2));
    if (!result.accepted) {
      process.exitCode = 2;
      logger.error(result, 'BOB rejected /fulfillments-create');
      return;
    }
    logger.log(result, 'BOB accepted /fulfillments-create (WhatsApp delivery is BOB-side)');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
