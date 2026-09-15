/**
 * Replay / backfill Cureka orders into Unicommerce createSaleOrder.
 *
 * 1. Put order numbers (or UUIDs / refIds) in ORDER_IDS below.
 * 2. Dry-run (default): loads each order and prints the payload, no API call.
 * 3. Push: npm run unicommerce:push-orders -- --apply
 *
 * Usage:
 *   npm run unicommerce:push-orders
 *   npm run unicommerce:push-orders -- --apply
 *   npm run unicommerce:push-orders -- --force --apply
 *   npm run unicommerce:push-orders -- --orders=ORD111,ORD222 --apply
 */
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppDataSource } from '../data-source';
import { OrderEntity } from '../../../../modules/orders/entities/order.entity';
import { isReadyForUnicommercePush } from '../../../../modules/orders/utils/fulfillment-readiness.util';
import { mapOrderToUnicommercePayload } from '../../../../modules/unicommerce/mappers/unicommerce-order.mapper';
import { UnicommerceOrderApiService } from '../../../../modules/unicommerce/services/unicommerce-order-api.service';
import { IUnicommerceCreateSaleOrderResponse } from '../../../../modules/unicommerce/interfaces/unicommerce-order.interface';

// ─────────────────────────────────────────────────────────────────────────────
// Add order numbers (ORD…) here for the next backfill. CLI --orders= overrides.
// ─────────────────────────────────────────────────────────────────────────────
const ORDER_IDS: string[] = [
  'ORD470831170087',
  'ORD450775521054',
  'ORD429782686481',
  'ORD507272275915',
];

interface CliOptions {
  ids: string[];
  apply: boolean;
  force: boolean;
  help: boolean;
}

type PushStatus =
  | 'dry_run'
  | 'pushed'
  | 'already_exists'
  | 'rejected'
  | 'not_found'
  | 'not_ready'
  | 'error';

interface PushResult {
  input: string;
  orderId: string | null;
  orderNumber: string | null;
  status: PushStatus;
  note: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const printUsage = (): void => {
  console.log(`
unicommerce:push-orders — Push existing Cureka orders to Unicommerce

Edit ORDER_IDS at the top of:
  apps/api/database/scripts/unicommerce-push-orders.runner.ts

  Dry-run:  npm run unicommerce:push-orders
  Push:     npm run unicommerce:push-orders -- --apply

Options:
  --apply              Call Unicommerce createSaleOrder (default: dry-run)
  --force              Push even if prepaid is unpaid / order is still PENDING
  --orders=ID,ID       Override ORDER_IDS (ORD number, refId, or UUID)
  --help
`);
};

const splitIds = (raw: string): string[] =>
  raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    ids: [...ORDER_IDS],
    apply: false,
    force: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--orders=')) {
      options.ids = splitIds(arg.slice('--orders='.length));
    } else if (arg === '--orders' && next) {
      options.ids = splitIds(next);
      index += 1;
    }
  }

  return options;
};

const envTrim = (value: string | undefined): string => (value ?? '').trim();

const buildConfigService = (): ConfigService => {
  const facilityRaw = envTrim(process.env['UNICOMMERCE_DEFAULT_FACILITY_CODE']);
  const facilityCode =
    !facilityRaw || facilityRaw === '{}' || facilityRaw === 'null' || facilityRaw === 'undefined'
      ? ''
      : facilityRaw;

  const values: Record<string, string | number | boolean> = {
    'unicommerceOrder.enabled': envTrim(process.env['UNICOMMERCE_ORDER_PUSH_ENABLED']) === 'true',
    'unicommerceOrder.tenant': envTrim(process.env['UNICOMMERCE_TENANT']) || 'stgcureka',
    'unicommerceOrder.username': envTrim(process.env['UNICOMMERCE_USERNAME']),
    'unicommerceOrder.password': envTrim(process.env['UNICOMMERCE_PASSWORD']),
    'unicommerceOrder.channel': envTrim(process.env['UNICOMMERCE_CHANNEL']) || 'CUSTOM',
    'unicommerceOrder.facilityCode': facilityCode,
    'unicommerceOrder.currency': envTrim(process.env['UNICOMMERCE_ORDER_CURRENCY']) || 'INR',
    'unicommerceOrder.timeoutMs': parseInt(
      envTrim(process.env['UNICOMMERCE_ORDER_TIMEOUT_MS']) || '15000',
      10,
    ),
  };

  return {
    get: <T = unknown>(key: string): T => values[key] as T,
  } as ConfigService;
};

const looksLikeDuplicate = (response: IUnicommerceCreateSaleOrderResponse): boolean => {
  const haystack = [
    response.message ?? '',
    ...(response.errors ?? []).map(
      (error) => error.description ?? error.message ?? error.fieldName ?? '',
    ),
  ]
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes('already exist') ||
    haystack.includes('duplicate') ||
    haystack.includes('sale order code already')
  );
};

async function findOrder(idOrNumber: string): Promise<OrderEntity | null> {
  const repo = AppDataSource.getRepository(OrderEntity);
  const relations = { user: true, items: { product: true } } as const;
  const order = { items: { createdAt: 'ASC' as const } };

  if (UUID_RE.test(idOrNumber)) {
    return repo.findOne({
      where: { id: idOrNumber },
      relations,
      order,
    });
  }

  return (
    (await repo.findOne({
      where: { orderNumber: idOrNumber },
      relations,
      order,
    })) ??
    (await repo.findOne({
      where: { refId: idOrNumber },
      relations,
      order,
    }))
  );
}

async function pushOne(
  input: string,
  api: UnicommerceOrderApiService,
  config: ConfigService,
  options: CliOptions,
): Promise<PushResult> {
  const order = await findOrder(input);
  if (!order) {
    return {
      input,
      orderId: null,
      orderNumber: null,
      status: 'not_found',
      note: 'Order not found (tried orderNumber, refId, UUID)',
    };
  }

  if (!options.force && !isReadyForUnicommercePush(order)) {
    return {
      input,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'not_ready',
      note:
        `Not ready for Unicommerce (status=${order.orderStatus}, ` +
        `payment=${order.paymentStatus}, method=${order.paymentMethod}). Use --force to push anyway.`,
    };
  }

  const payload = mapOrderToUnicommercePayload(order, {
    currency: config.get<string>('unicommerceOrder.currency'),
    channel: config.get<string>('unicommerceOrder.channel'),
  });

  const summary =
    `source=${order.orderSource ?? '-'} status=${order.orderStatus} ` +
    `method=${order.paymentMethod} payment=${order.paymentStatus} ` +
    `items=${payload.saleOrder.saleOrderItems.length} ` +
    `channel=${payload.saleOrder.channel} COD=${payload.saleOrder.cashOnDelivery}`;

  if (!options.apply) {
    return {
      input,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'dry_run',
      note: `Would push ${summary}`,
    };
  }

  const response = await api.createSaleOrder(payload);
  if (response.successful) {
    return {
      input,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'pushed',
      note:
        `Unicommerce accepted (${summary}) ` +
        `ucCode=${response.saleOrderDetailDTO?.code ?? order.orderNumber} ` +
        `ucStatus=${response.saleOrderDetailDTO?.status ?? '-'}`,
    };
  }

  if (looksLikeDuplicate(response)) {
    return {
      input,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'already_exists',
      note: response.message ?? 'Sale order already exists in Unicommerce',
    };
  }

  return {
    input,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: 'rejected',
    note: `${response.message ?? 'Unicommerce rejected'} ${JSON.stringify(response.errors ?? [])}`,
  };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const ids = [...new Set(options.ids.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    console.error('No order ids. Edit ORDER_IDS at the top of the script or pass --orders=...');
    process.exitCode = 1;
    return;
  }

  const config = buildConfigService();
  const username = config.get<string>('unicommerceOrder.username');
  const password = config.get<string>('unicommerceOrder.password');
  if (options.apply && (!username || !password)) {
    console.error('Unicommerce credentials missing. Set UNICOMMERCE_TENANT, UNICOMMERCE_USERNAME, UNICOMMERCE_PASSWORD.');
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        force: options.force,
        count: ids.length,
        tenant: config.get<string>('unicommerceOrder.tenant'),
        channel: config.get<string>('unicommerceOrder.channel'),
        enabled: config.get<boolean>('unicommerceOrder.enabled'),
      },
      null,
      2,
    ),
  );
  console.log('');

  await AppDataSource.initialize();
  const api = new UnicommerceOrderApiService(config);
  const results: PushResult[] = [];

  try {
    for (const id of ids) {
      try {
        const result = await pushOne(id, api, config, options);
        results.push(result);
        if (options.apply) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          input: id,
          orderId: null,
          orderNumber: null,
          status: 'error',
          note: message,
        });
      }
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }

  for (const row of results) {
    console.log(`${row.input}  [${row.status}]`);
    console.log(`  orderNumber: ${row.orderNumber ?? '-'}`);
    console.log(`  orderId:     ${row.orderId ?? '-'}`);
    console.log(`  note:        ${row.note}`);
    console.log('');
  }

  const failed = results.filter((row) =>
    ['not_found', 'not_ready', 'rejected', 'error'].includes(row.status),
  );
  console.log(
    `Done: ${results.length} order(s). ` +
      `pushed=${results.filter((row) => row.status === 'pushed').length} ` +
      `already_exists=${results.filter((row) => row.status === 'already_exists').length} ` +
      `dry_run=${results.filter((row) => row.status === 'dry_run').length} ` +
      `failed=${failed.length}`,
  );

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
