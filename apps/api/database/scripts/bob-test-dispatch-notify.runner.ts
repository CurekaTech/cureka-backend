/**
 * BOB WhatsApp smoke test: /orders-create (confirmation) then /fulfillments-create (dispatched).
 *
 * SAFE BY DEFAULT — dry-run unless --send.
 * WHATSAPP_* env is ignored; BOB sends templates after accepting these APIs.
 *
 * Usage (prefer production server where the order exists in DB):
 *   npm run bob:test-dispatch-notify -- --order-id=<uuid> --awb=TESTAWB… --phone=+91…
 *   npm run bob:test-dispatch-notify -- --order-id=<uuid> --awb=… --phone=+91… --send
 *
 * Offline (no DB order row — builds payloads from CLI flags):
 *   npm run bob:test-dispatch-notify -- --offline --order-number=ORD… --phone=+91… --awb=… --send
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { OrdersRepository } from '../../../../modules/orders/repositories/orders.repository';
import { ShipmentsRepository } from '../../../../modules/shipping/repositories/shipments.repository';
import { BobNotifyService } from '../../../../modules/bob/services/bob-notify.service';
import { mapBobFulfillment, mapBobOrder } from '../../../../modules/bob/mappers/bob.mapper';
import { ShipmentEntity } from '../../../../modules/shipping/entities/shipment.entity';
import { toBobE164Phone, toBobOrderAlias } from '../../../../modules/bob/utils/bob.util';
import type { BobFulfillmentPayload, BobOrderPayload } from '../../../../modules/bob/interfaces/bob.interface';

interface CliOptions {
  orderId: string;
  orderNumber: string;
  awb: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  productName: string;
  sku: string;
  productId: string;
  variantId: string;
  grandTotal: number;
  offline: boolean;
  skipOrdersCreate: boolean;
  skipFulfillment: boolean;
  send: boolean;
}

const printUsage = (): void => {
  console.log(`
bob:test-dispatch-notify — POST BOB /orders-create then /fulfillments-create

Options:
  --order-id <uuid>       Cureka order UUID (required unless --offline)
  --awb <awb>             Tracking number (required for fulfillment)
  --phone <+91...>        Override recipient phone
  --send                  Actually POST to BOB (default: dry-run)
  --skip-orders-create    Only post /fulfillments-create
  --skip-fulfillment      Only post /orders-create
  --offline               Build payloads from CLI flags (no DB order required)
  --order-number ORD…     Required with --offline
  --email --first-name --last-name --product-name --sku --grand-total
  --product-id --variant-id

Examples:
  npm run bob:test-dispatch-notify -- --order-id=ffe0002e-… --awb=TESTAWB9974440132 --phone=+919974440132
  npm run bob:test-dispatch-notify -- --order-id=ffe0002e-… --awb=TESTAWB9974440132 --phone=+919974440132 --send
`);
};

const argValue = (argv: string[], i: number, arg: string): { value: string; next: number } => {
  if (arg.includes('=')) {
    return { value: arg.split('=').slice(1).join('='), next: i };
  }
  return { value: argv[i + 1] ?? '', next: i + 1 };
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = {
    orderId: '',
    orderNumber: '',
    awb: '',
    phone: '',
    email: '',
    firstName: 'Customer',
    lastName: '',
    productName: 'Test product',
    sku: 'TEST-SKU',
    productId: 'offline-product',
    variantId: 'offline-variant',
    grandTotal: 0,
    offline: false,
    skipOrdersCreate: false,
    skipFulfillment: false,
    send: false,
  };

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
    if (arg === '--offline') {
      opts.offline = true;
      continue;
    }
    if (arg === '--skip-orders-create') {
      opts.skipOrdersCreate = true;
      continue;
    }
    if (arg === '--skip-fulfillment') {
      opts.skipFulfillment = true;
      continue;
    }

    const flags: Array<[string, keyof CliOptions]> = [
      ['--order-id', 'orderId'],
      ['--order-number', 'orderNumber'],
      ['--awb', 'awb'],
      ['--phone', 'phone'],
      ['--email', 'email'],
      ['--first-name', 'firstName'],
      ['--last-name', 'lastName'],
      ['--product-name', 'productName'],
      ['--sku', 'sku'],
      ['--product-id', 'productId'],
      ['--variant-id', 'variantId'],
    ];

    let matched = false;
    for (const [flag, key] of flags) {
      if (arg === flag || arg.startsWith(`${flag}=`)) {
        const { value, next } = argValue(argv, i, arg);
        opts[key] = value as never;
        i = next;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (arg === '--grand-total' || arg.startsWith('--grand-total=')) {
      const { value, next } = argValue(argv, i, arg);
      opts.grandTotal = Number(value);
      i = next;
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

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
};

const buildOfflineOrderPayload = (opts: CliOptions): BobOrderPayload => {
  const phone = toBobE164Phone(opts.phone);
  const alias = toBobOrderAlias(opts.orderNumber);
  return {
    id: alias,
    name: alias,
    email: opts.email,
    createdAt: new Date().toISOString(),
    fullyPaid: false,
    cancelReason: null,
    cancelledAt: null,
    note: null,
    channel: 'Website',
    shippingAddress: {
      name: `${opts.firstName} ${opts.lastName}`.trim(),
      phone,
      address1: 'Test address',
      address2: '',
      city: 'Ahmedabad',
      province: 'GUJARAT',
      country: 'India',
      zip: '380058',
    },
    total_amount: String(opts.grandTotal || 0),
    currencyCode: 'INR',
    lineItems: [
      {
        image: { originalSrc: '' },
        product: { id: opts.productId, title: opts.productName },
        variant: {
          id: opts.variantId,
          title: 'Default Title',
          price: String(opts.grandTotal || 0),
          weight: '0 kg',
          sku: opts.sku,
        },
        variantTitle: '',
        quantity: 1,
      },
    ],
    shipment_details: {
      status: 'Confirmed',
      tracking_info: '',
    },
  };
};

const buildOfflineFulfillmentPayload = (opts: CliOptions): BobFulfillmentPayload => {
  const phone = toBobE164Phone(opts.phone);
  const alias = toBobOrderAlias(opts.orderNumber);
  return {
    fulfillment_id: alias,
    id: alias,
    id_alias: alias,
    lineItems: [
      {
        image: { originalSrc: '' },
        product: { id: opts.productId, title: opts.productName },
        variant: {
          id: opts.variantId,
          title: 'Default Title',
          price: String(opts.grandTotal || 0),
          weight: '0 kg',
          sku: opts.sku,
        },
        variantTitle: '',
        quantity: 1,
      },
    ],
    customer: {
      email: opts.email,
      first_name: opts.firstName,
      last_name: opts.lastName,
      phone,
      orders_count: null,
      total_spent: null,
      last_order_id: null,
    },
    order_details: {
      total_price: opts.grandTotal || 0,
      total_tax: 0,
      total_discount: 0,
      currency: 'INR',
    },
    tracking_info: {
      tracking_number: opts.awb,
      tracking_url: '',
      tracking_company_name: 'TestCourier',
      shipping_status: 'shipped',
    },
    phone,
    fulfilled_at: new Date().toISOString(),
  };
};

async function main(): Promise<void> {
  const logger = new Logger('bob:test-dispatch-notify');
  const opts = parseCli(process.argv.slice(2));

  if (!opts.offline && !opts.orderId.trim()) {
    printUsage();
    process.exit(1);
  }
  if (opts.offline && !opts.orderNumber.trim()) {
    logger.error('--offline requires --order-number');
    process.exit(1);
  }
  if (!opts.skipFulfillment && !opts.awb.trim()) {
    logger.error('--awb is required for /fulfillments-create (or pass --skip-fulfillment)');
    process.exit(1);
  }
  if (opts.offline && !opts.phone.trim()) {
    logger.error('--offline requires --phone');
    process.exit(1);
  }

  const bobNotifyUrl = (process.env['BOB_NOTIFY_URL'] ?? '').trim();
  const bobGuestId = (process.env['BOB_GUEST_ID'] ?? '').trim();

  logger.warn(
    {
      orderId: opts.orderId || null,
      orderNumber: opts.orderNumber || null,
      awb: opts.awb || null,
      offline: opts.offline,
      dryRun: !opts.send,
      skipOrdersCreate: opts.skipOrdersCreate,
      skipFulfillment: opts.skipFulfillment,
      bobNotifyHost: bobNotifyUrl ? hostOf(bobNotifyUrl) : '(unset)',
      bobGuestId: mask(bobGuestId),
      note: 'Posts /orders-create then /fulfillments-create; WhatsApp is BOB-side after accept',
    },
    'Starting BOB dispatch notify test',
  );

  if (!bobNotifyUrl || !bobGuestId) {
    logger.error('BOB_NOTIFY_URL and BOB_GUEST_ID must be set');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const bobNotify = app.get(BobNotifyService);
    let orderPayload: BobOrderPayload;
    let fulfillmentPayload: BobFulfillmentPayload;
    let orderMeta: Record<string, unknown>;

    if (opts.offline) {
      orderPayload = buildOfflineOrderPayload(opts);
      fulfillmentPayload = buildOfflineFulfillmentPayload(opts);
      orderMeta = {
        mode: 'offline',
        orderNumber: opts.orderNumber,
        phoneMasked: maskPhone(toBobE164Phone(opts.phone)),
      };
    } else {
      const ordersRepository = app.get(OrdersRepository);
      const shipmentsRepository = app.get(ShipmentsRepository);
      const order = await ordersRepository.findByIdOrRefId(opts.orderId.trim());
      if (!order) {
        throw new Error(
          `Order not found: ${opts.orderId}. Run on the server DB that has this order, or use --offline.`,
        );
      }

      let shipment = await shipmentsRepository.findByOrderId(order.id);
      if (!shipment && opts.awb.trim()) {
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
        logger.warn({ awb: opts.awb }, 'No local shipment — using synthetic shipment for payload');
      }
      if (!shipment && !opts.skipFulfillment) {
        throw new Error('No shipment and no --awb');
      }
      if (shipment && opts.awb.trim() && shipment.awbNumber !== opts.awb.trim()) {
        shipment = { ...shipment, awbNumber: opts.awb.trim() } as ShipmentEntity;
      }

      orderPayload = mapBobOrder(order, shipment);
      fulfillmentPayload = shipment
        ? mapBobFulfillment(order, shipment)
        : buildOfflineFulfillmentPayload({
            ...opts,
            orderNumber: order.orderNumber,
            phone: opts.phone || order.phoneNumber,
            email: order.user?.email ?? '',
            firstName: (order.recipientName ?? 'Customer').split(/\s+/)[0] ?? 'Customer',
            lastName: (order.recipientName ?? '').split(/\s+/).slice(1).join(' '),
            grandTotal: Number(order.grandTotal),
          });

      if (opts.phone.trim()) {
        const phone = toBobE164Phone(opts.phone);
        orderPayload.shippingAddress.phone = phone;
        fulfillmentPayload.phone = phone;
        fulfillmentPayload.customer.phone = phone;
      }

      orderMeta = {
        mode: 'db',
        id: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        orderStatus: order.orderStatus,
        phoneMasked: maskPhone(fulfillmentPayload.phone),
      };
    }

    const stamp = Date.now();
    const ordersKey = `orders-create:test:${opts.orderId || opts.orderNumber}:${stamp}`;
    const fulfillKey = `fulfillments-create:test:${opts.orderId || opts.orderNumber}:${stamp}`;

    console.log(
      JSON.stringify(
        {
          dryRun: !opts.send,
          order: orderMeta,
          steps: {
            ordersCreate: opts.skipOrdersCreate ? 'skip' : opts.send ? 'will_post' : 'preview',
            fulfillmentsCreate: opts.skipFulfillment ? 'skip' : opts.send ? 'will_post' : 'preview',
          },
          ordersCreate: {
            endpoint: `${bobNotifyUrl.replace(/\/$/, '')}/orders-create`,
            idempotencyKey: ordersKey,
            payload: orderPayload,
          },
          fulfillmentsCreate: {
            endpoint: `${bobNotifyUrl.replace(/\/$/, '')}/fulfillments-create`,
            idempotencyKey: fulfillKey,
            payload: fulfillmentPayload,
          },
        },
        null,
        2,
      ),
    );

    if (!opts.send) {
      logger.log('Dry-run complete — re-run with --send to POST both APIs');
      return;
    }

    const results: Record<string, unknown> = {};

    if (!opts.skipOrdersCreate) {
      logger.log('POST /orders-create (WhatsApp #1 order confirmation)');
      const ordersResult = await bobNotify.post('/orders-create', orderPayload, {
        idempotencyKey: ordersKey,
      });
      results['ordersCreate'] = ordersResult;
      console.log(JSON.stringify({ step: 'orders-create', result: ordersResult }, null, 2));
      if (!ordersResult.accepted) {
        process.exitCode = 2;
        logger.error(ordersResult, 'BOB rejected /orders-create — stopping before fulfillment');
        return;
      }
      logger.log(ordersResult, 'BOB accepted /orders-create');
    }

    if (!opts.skipFulfillment) {
      logger.log('POST /fulfillments-create (WhatsApp #2 dispatched/shipped)');
      const fulfillResult = await bobNotify.post('/fulfillments-create', fulfillmentPayload, {
        idempotencyKey: fulfillKey,
      });
      results['fulfillmentsCreate'] = fulfillResult;
      console.log(JSON.stringify({ step: 'fulfillments-create', result: fulfillResult }, null, 2));
      if (!fulfillResult.accepted) {
        process.exitCode = 2;
        logger.error(fulfillResult, 'BOB rejected /fulfillments-create');
        return;
      }
      logger.log(
        fulfillResult,
        'BOB accepted /fulfillments-create — check WhatsApp; delivery is BOB-side',
      );
    }

    console.log(
      JSON.stringify(
        {
          summary: results,
          next: [
            'Confirm WhatsApp on the phone within a few minutes',
            'If still empty: BOB dashboard → Notifications logs for this order alias',
            'Send hello to Cureka WhatsApp number to confirm opt-in',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
