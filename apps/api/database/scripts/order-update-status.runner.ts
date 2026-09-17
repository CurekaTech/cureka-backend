/**
 * Update order + shipment status from CLI (live-safe: dry-run by default).
 *
 * Usage:
 *   npm run order:update-status -- --order-id=ORD20260911001
 *   npm run order:update-status -- --order-id=ORD20260911001 --order-status=DELIVERED --shipment-status=DELIVERED --apply
 *   npm run order:update-status -- --order-id=<uuid> --order-status=SHIPPED --shipment-status=IN_TRANSIT --apply
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { OrderEntity } from '../../../../modules/orders/entities/order.entity';
import { OrderStatus } from '../../../../modules/orders/enums/order-status.enum';
import { OrderPaymentStatus } from '../../../../modules/orders/enums/order-payment-status.enum';
import { OrderPaymentMethod } from '../../../../modules/orders/enums/order-payment-method.enum';
import { ShipmentEntity } from '../../../../modules/shipping/entities/shipment.entity';
import { ShipmentStatus } from '../../../../modules/shipping/enums/shipment-status.enum';
import { applyOrderStatusTimestamps } from '../../../../modules/orders/utils/order-status-timestamps.util';

interface CliOptions {
  orderId: string;
  orderStatus: OrderStatus;
  shipmentStatus: ShipmentStatus;
  apply: boolean;
  reason?: string;
  updatedBy: string;
  markCodPaid: boolean;
}

const printUsage = (): void => {
  console.log(`
order:update-status — Update order and shipment statuses

Required:
  --order-id <value>            Order UUID or ref_id/order_number (ORD...)

Optional:
  --order-status <status>       Default: DELIVERED
  --shipment-status <status>    Default: DELIVERED
  --reason <text>               Appends to order notes
  --updated-by <text>           Default: script:order:update-status
  --mark-cod-paid               If DELIVERED + COD, set payment_status=PAID
  --apply                       Persist changes (default: dry-run)

Examples:
  npm run order:update-status -- --order-id=ORD20260911001
  npm run order:update-status -- --order-id=ORD20260911001 --apply
  npm run order:update-status -- --order-id=<uuid> --order-status=SHIPPED --shipment-status=IN_TRANSIT --apply
`);
};

const parseEnum = <T extends string>(value: string, values: readonly T[], label: string): T => {
  const normalized = value.trim().toUpperCase() as T;
  if (!values.includes(normalized)) {
    throw new Error(`Invalid ${label}: ${value}. Allowed: ${values.join(', ')}`);
  }
  return normalized;
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = {
    orderId: '',
    orderStatus: OrderStatus.DELIVERED,
    shipmentStatus: ShipmentStatus.DELIVERED,
    apply: false,
    updatedBy: 'script:order:update-status',
    markCodPaid: false,
  };

  const orderStatuses = Object.values(OrderStatus) as OrderStatus[];
  const shipmentStatuses = Object.values(ShipmentStatus) as ShipmentStatus[];

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
    if (arg === '--mark-cod-paid') {
      opts.markCodPaid = true;
      continue;
    }
    if (arg === '--order-id' || arg.startsWith('--order-id=')) {
      opts.orderId = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? '';
      continue;
    }
    if (arg === '--order-status' || arg.startsWith('--order-status=')) {
      const raw = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? '';
      opts.orderStatus = parseEnum(raw, orderStatuses, 'order status');
      continue;
    }
    if (arg === '--shipment-status' || arg.startsWith('--shipment-status=')) {
      const raw = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? '';
      opts.shipmentStatus = parseEnum(raw, shipmentStatuses, 'shipment status');
      continue;
    }
    if (arg === '--reason' || arg.startsWith('--reason=')) {
      opts.reason = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? '';
      continue;
    }
    if (arg === '--updated-by' || arg.startsWith('--updated-by=')) {
      opts.updatedBy = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i] ?? '';
      continue;
    }
  }

  if (!opts.orderId.trim()) {
    throw new Error('--order-id is required');
  }
  if (opts.orderStatus === OrderStatus.DELIVERED && !opts.markCodPaid) {
    opts.markCodPaid = true;
  }
  return opts;
};

async function run(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  console.log(
    JSON.stringify(
      {
        orderId: opts.orderId,
        orderStatus: opts.orderStatus,
        shipmentStatus: opts.shipmentStatus,
        apply: opts.apply,
        markCodPaid: opts.markCodPaid,
        updatedBy: opts.updatedBy,
      },
      null,
      2,
    ),
  );

  await AppDataSource.initialize();
  try {
    const orderRepo = AppDataSource.getRepository(OrderEntity);
    const shipmentRepo = AppDataSource.getRepository(ShipmentEntity);

    const order = await orderRepo
      .createQueryBuilder('o')
      .withDeleted()
      .where('CAST(o.id AS text) = :id OR o.ref_id = :id OR o.order_number = :id', {
        id: opts.orderId.trim(),
      })
      .getOne();

    if (!order) {
      throw new Error(`Order not found for: ${opts.orderId}`);
    }

    const shipments = await shipmentRepo
      .createQueryBuilder('s')
      .withDeleted()
      .where('s.order_id = :orderId', { orderId: order.id })
      .getMany();

    const now = new Date();
    const orderPatch: Partial<OrderEntity> = {
      orderStatus: opts.orderStatus,
      ...applyOrderStatusTimestamps(order, opts.orderStatus, now),
      updatedBy: opts.updatedBy,
    };

    if (
      opts.markCodPaid &&
      opts.orderStatus === OrderStatus.DELIVERED &&
      order.paymentMethod === OrderPaymentMethod.COD &&
      order.paymentStatus !== OrderPaymentStatus.PAID
    ) {
      orderPatch.paymentStatus = OrderPaymentStatus.PAID;
    }

    if (opts.reason?.trim()) {
      orderPatch.notes = order.notes ? `${order.notes}\n${opts.reason.trim()}` : opts.reason.trim();
    }

    const shipmentPatch: Partial<ShipmentEntity> = {
      shipmentStatus: opts.shipmentStatus,
      lastSyncedAt: now,
      updatedBy: opts.updatedBy,
    };
    if (opts.shipmentStatus === ShipmentStatus.DELIVERED) {
      shipmentPatch.shipwayRawStatus = 'DEL';
    }

    console.log(
      JSON.stringify(
        {
          foundOrder: {
            id: order.id,
            refId: order.refId,
            orderNumber: order.orderNumber,
            currentOrderStatus: order.orderStatus,
            currentPaymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
          },
          shipmentsFound: shipments.length,
          patch: {
            order: orderPatch,
            shipment: shipmentPatch,
          },
        },
        null,
        2,
      ),
    );

    if (!opts.apply) {
      console.log('Dry-run only. Re-run with --apply to persist.');
      return;
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(OrderEntity).update({ id: order.id }, orderPatch);
      if (shipments.length) {
        await manager
          .getRepository(ShipmentEntity)
          .createQueryBuilder()
          .update(ShipmentEntity)
          .set(shipmentPatch)
          .where('order_id = :orderId', { orderId: order.id })
          .execute();
      }
    });

    const updatedOrder = await orderRepo.findOne({ where: { id: order.id } });
    const updatedShipments = await shipmentRepo.find({ where: { orderId: order.id } });
    console.log(
      JSON.stringify(
        {
          updated: true,
          order: {
            id: updatedOrder?.id,
            orderNumber: updatedOrder?.orderNumber,
            orderStatus: updatedOrder?.orderStatus,
            paymentStatus: updatedOrder?.paymentStatus,
            deliveredAt: updatedOrder?.deliveredAt,
          },
          shipmentStatuses: updatedShipments.map((s) => ({
            id: s.id,
            status: s.shipmentStatus,
            awb: s.awbNumber,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run().catch((error) => {
  console.error('[order:update-status] failed:', error);
  process.exit(1);
});
