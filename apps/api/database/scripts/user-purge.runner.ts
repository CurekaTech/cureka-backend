/**
 * Hard-delete storefront users and all related data by mobile number.
 *
 * 1. Edit TARGET_MOBILE_NUMBERS below (10-digit Indian mobiles).
 * 2. Dry-run (default): shows what would be deleted.
 * 3. Apply: npm run user:purge -- --apply
 *
 * Usage:
 *   npm run user:purge
 *   npm run user:purge -- --apply
 *   npm run user:purge -- --phones=9866440427,9876543210 --apply
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { UserEntity } from '../../../../modules/users/entities/user.entity';

// ─────────────────────────────────────────────────────────────────────────────
// Configure mobiles here (or pass --phones=... on CLI)
// ─────────────────────────────────────────────────────────────────────────────
const TARGET_MOBILE_NUMBERS: string[] = [
  // '9866440427',
  // '9876543210',
  '8238061585', '7862046667', '9974440132', '9428463455', '7862895336', '8200774836'
];

interface CliOptions {
  phones: string[];
  apply: boolean;
  help: boolean;
}

interface DeleteCounts {
  [table: string]: number;
}

interface PurgeResult {
  mobile: string;
  userId: string | null;
  status: 'ok' | 'not_found' | 'skipped_vendor' | 'error';
  note: string;
  counts: DeleteCounts;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    phones: [...TARGET_MOBILE_NUMBERS],
    apply: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg.startsWith('--phones=')) {
      options.phones = splitPhones(arg.slice('--phones='.length));
    } else if (arg === '--phones' && next) {
      options.phones = splitPhones(next);
      index += 1;
    }
  }

  return options;
};

const splitPhones = (raw: string): string[] =>
  raw
    .split(/[,\s]+/)
    .map((p) => p.replace(/\D/g, ''))
    .filter(Boolean);

const normalizePhoneVariants = (phone: string): string[] => {
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return Array.from(
    new Set([digits, last10, `91${last10}`, `+91${last10}`].filter((v) => v.length >= 10)),
  );
};

const printHelp = (): void => {
  console.log(`
Purge storefront users by mobile number (hard delete + related data).

1. Edit TARGET_MOBILE_NUMBERS in this script, OR pass --phones
2. Dry-run first (default), then --apply

Options:
  --phones <list>   Comma-separated mobiles (overrides script array)
  --apply           Actually delete (default is dry-run)
  --help            Show this help

Examples:
  npm run user:purge
  npm run user:purge -- --phones=9866440427 --apply
`);
};

const bump = (counts: DeleteCounts, key: string, n: number): void => {
  if (n <= 0) return;
  counts[key] = (counts[key] ?? 0) + n;
};

const findUsersByPhone = async (phone: string): Promise<UserEntity[]> => {
  const repo = AppDataSource.getRepository(UserEntity);
  const variants = normalizePhoneVariants(phone);
  // Include soft-deleted rows so purge is complete.
  return repo
    .createQueryBuilder('user')
    .withDeleted()
    .where('user.mobileNumber IN (:...variants)', { variants })
    .getMany();
};

const tableExists = async (table: string): Promise<boolean> => {
  const rows: Array<{ exists: boolean }> = await AppDataSource.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table],
  );
  return Boolean(rows[0]?.exists);
};

async function purgeUser(userId: string, mobile: string, apply: boolean): Promise<DeleteCounts> {
  const counts: DeleteCounts = {};
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const del = async (sql: string, params: unknown[] = []): Promise<number> => {
      if (!apply) return 0;
      const rows = await qr.query(sql, params);
      return Array.isArray(rows) ? rows.length : 0;
    };

    const orderRows: Array<{ id: string }> = await qr.query(
      `SELECT id FROM orders WHERE user_id = $1`,
      [userId],
    );
    const orderIds = orderRows.map((r) => r.id);

    const cartRows: Array<{ id: string }> = await qr.query(
      `SELECT id FROM carts WHERE user_id = $1`,
      [userId],
    );
    const cartIds = cartRows.map((r) => r.id);

    if (orderIds.length) {
      const shipmentRows: Array<{ id: string }> = await qr.query(
        `SELECT id FROM shipments WHERE order_id = ANY($1::uuid[])`,
        [orderIds],
      );
      const shipmentIds = shipmentRows.map((r) => r.id);

      if (shipmentIds.length) {
        if (await tableExists('shipment_items')) {
          bump(
            counts,
            'shipment_items',
            await del(
              `DELETE FROM shipment_items WHERE shipment_id = ANY($1::uuid[]) RETURNING id`,
              [shipmentIds],
            ),
          );
        }
        bump(
          counts,
          'shipment_events',
          await del(
            `DELETE FROM shipment_events WHERE shipment_id = ANY($1::uuid[]) RETURNING id`,
            [shipmentIds],
          ),
        );
        bump(
          counts,
          'shipments',
          await del(`DELETE FROM shipments WHERE id = ANY($1::uuid[]) RETURNING id`, [
            shipmentIds,
          ]),
        );
      }

      if (await tableExists('gokwik_refunds')) {
        bump(
          counts,
          'gokwik_refunds',
          await del(`DELETE FROM gokwik_refunds WHERE order_id = ANY($1::uuid[]) RETURNING id`, [
            orderIds,
          ]),
        );
      }
      if (await tableExists('gokwik_orders')) {
        bump(
          counts,
          'gokwik_orders',
          await del(`DELETE FROM gokwik_orders WHERE order_id = ANY($1::uuid[]) RETURNING id`, [
            orderIds,
          ]),
        );
      }

      bump(
        counts,
        'coupon_usages',
        await del(
          `DELETE FROM coupon_usages WHERE user_id = $1 OR order_id = ANY($2::uuid[]) RETURNING id`,
          [userId, orderIds],
        ),
      );

      bump(
        counts,
        'order_items',
        await del(`DELETE FROM order_items WHERE order_id = ANY($1::uuid[]) RETURNING id`, [
          orderIds,
        ]),
      );
      bump(
        counts,
        'orders',
        await del(`DELETE FROM orders WHERE id = ANY($1::uuid[]) RETURNING id`, [orderIds]),
      );
    } else {
      bump(
        counts,
        'coupon_usages',
        await del(`DELETE FROM coupon_usages WHERE user_id = $1 RETURNING id`, [userId]),
      );
    }

    // GoKwik rows tied to cart but not yet linked / leftover
    if (cartIds.length && (await tableExists('gokwik_orders'))) {
      bump(
        counts,
        'gokwik_orders',
        await del(`DELETE FROM gokwik_orders WHERE cart_id = ANY($1::uuid[]) RETURNING id`, [
          cartIds,
        ]),
      );
    }

    bump(
      counts,
      'payment_request_items',
      await del(
        `DELETE FROM payment_request_items
         WHERE payment_request_id IN (SELECT id FROM payment_requests WHERE customer_id = $1)
         RETURNING id`,
        [userId],
      ),
    );
    bump(
      counts,
      'payment_requests',
      await del(`DELETE FROM payment_requests WHERE customer_id = $1 RETURNING id`, [userId]),
    );

    if (cartIds.length) {
      bump(
        counts,
        'cart_items',
        await del(`DELETE FROM cart_items WHERE cart_id = ANY($1::uuid[]) RETURNING id`, [
          cartIds,
        ]),
      );
      bump(
        counts,
        'carts',
        await del(`DELETE FROM carts WHERE id = ANY($1::uuid[]) RETURNING id`, [cartIds]),
      );
    }

    if (await tableExists('wishlist_items')) {
      bump(
        counts,
        'wishlist_items',
        await del(`DELETE FROM wishlist_items WHERE user_id = $1 RETURNING id`, [userId]),
      );
    }

    bump(
      counts,
      'user_sessions',
      await del(`DELETE FROM user_sessions WHERE user_id = $1 RETURNING id`, [userId]),
    );
    bump(
      counts,
      'user_addresses',
      await del(`DELETE FROM user_addresses WHERE user_id = $1 RETURNING id`, [userId]),
    );

    if (await tableExists('product_reviews')) {
      bump(
        counts,
        'product_reviews',
        await del(`DELETE FROM product_reviews WHERE user_id = $1 RETURNING id`, [userId]),
      );
    }

    if (await tableExists('support_notifications')) {
      bump(
        counts,
        'support_notifications',
        await del(`DELETE FROM support_notifications WHERE user_id = $1 RETURNING id`, [userId]),
      );
    }

    // ticket_messages + support_ticket_audit_logs cascade from support_tickets
    if (await tableExists('support_tickets')) {
      bump(
        counts,
        'support_tickets',
        await del(`DELETE FROM support_tickets WHERE user_id = $1 RETURNING id`, [userId]),
      );
    }

    if (await tableExists('blog_comments')) {
      bump(
        counts,
        'blog_comments',
        await del(`DELETE FROM blog_comments WHERE user_id = $1 RETURNING id`, [userId]),
      );
    }

    const phoneVariants = normalizePhoneVariants(mobile);
    if (await tableExists('otp_logs')) {
      bump(
        counts,
        'otp_logs',
        await del(`DELETE FROM otp_logs WHERE mobile_number = ANY($1::text[]) RETURNING id`, [
          phoneVariants,
        ]),
      );
    }

    // Hard-delete user (including soft-deleted row)
    bump(
      counts,
      'users',
      await del(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId]),
    );

    if (apply) {
      await qr.commitTransaction();
    } else {
      await qr.rollbackTransaction();
    }
  } catch (error) {
    await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
  }

  return counts;
}

const previewCounts = async (userId: string, mobile: string): Promise<DeleteCounts> => {
  const counts: DeleteCounts = {};
  const q = async (sql: string, params: unknown[] = []): Promise<number> => {
    const rows: Array<{ c: string }> = await AppDataSource.query(sql, params);
    return Number(rows[0]?.c ?? 0);
  };

  const orderRows: Array<{ id: string }> = await AppDataSource.query(
    `SELECT id FROM orders WHERE user_id = $1`,
    [userId],
  );
  const orderIds = orderRows.map((r) => r.id);
  const cartRows: Array<{ id: string }> = await AppDataSource.query(
    `SELECT id FROM carts WHERE user_id = $1`,
    [userId],
  );
  const cartIds = cartRows.map((r) => r.id);
  const phoneVariants = normalizePhoneVariants(mobile);

  counts.orders = orderIds.length;
  counts.carts = cartIds.length;
  if (orderIds.length) {
    counts.order_items = await q(
      `SELECT COUNT(*)::text AS c FROM order_items WHERE order_id = ANY($1::uuid[])`,
      [orderIds],
    );
    counts.shipments = await q(
      `SELECT COUNT(*)::text AS c FROM shipments WHERE order_id = ANY($1::uuid[])`,
      [orderIds],
    );
    if (await tableExists('gokwik_orders')) {
      counts.gokwik_orders = await q(
        `SELECT COUNT(*)::text AS c FROM gokwik_orders WHERE order_id = ANY($1::uuid[])`,
        [orderIds],
      );
    }
  }
  if (cartIds.length) {
    counts.cart_items = await q(
      `SELECT COUNT(*)::text AS c FROM cart_items WHERE cart_id = ANY($1::uuid[])`,
      [cartIds],
    );
  }
  counts.payment_requests = await q(
    `SELECT COUNT(*)::text AS c FROM payment_requests WHERE customer_id = $1`,
    [userId],
  );
  counts.user_sessions = await q(
    `SELECT COUNT(*)::text AS c FROM user_sessions WHERE user_id = $1`,
    [userId],
  );
  counts.user_addresses = await q(
    `SELECT COUNT(*)::text AS c FROM user_addresses WHERE user_id = $1`,
    [userId],
  );
  if (await tableExists('wishlist_items')) {
    counts.wishlist_items = await q(
      `SELECT COUNT(*)::text AS c FROM wishlist_items WHERE user_id = $1`,
      [userId],
    );
  }
  if (await tableExists('coupon_usages')) {
    counts.coupon_usages = await q(
      `SELECT COUNT(*)::text AS c FROM coupon_usages WHERE user_id = $1`,
      [userId],
    );
  }
  if (await tableExists('otp_logs')) {
    counts.otp_logs = await q(
      `SELECT COUNT(*)::text AS c FROM otp_logs WHERE mobile_number = ANY($1::text[])`,
      [phoneVariants],
    );
  }
  counts.users = 1;
  return counts;
};

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const phones = [...new Set(options.phones.map((p) => p.replace(/\D/g, '')).filter(Boolean))];
  if (!phones.length) {
    console.error(
      'No mobile numbers configured. Edit TARGET_MOBILE_NUMBERS in the script or pass --phones=...',
    );
    process.exit(1);
  }

  console.log(`\nUser purge (${options.apply ? 'APPLY' : 'DRY-RUN'})`);
  console.log(`Mobiles: ${phones.join(', ')}\n`);

  await AppDataSource.initialize();
  const results: PurgeResult[] = [];

  try {
    for (const mobile of phones) {
      const users = await findUsersByPhone(mobile);
      if (!users.length) {
        results.push({
          mobile,
          userId: null,
          status: 'not_found',
          note: 'No user row for this mobile (active or soft-deleted)',
          counts: {},
        });
        continue;
      }

      for (const user of users) {
        // Block vendor-linked accounts unless we also delete vendor (restrict FK).
        if (await tableExists('vendors')) {
          const vendorRows: Array<{ id: string }> = await AppDataSource.query(
            `SELECT id FROM vendors WHERE user_id = $1 LIMIT 1`,
            [user.id],
          );
          if (vendorRows.length) {
            results.push({
              mobile,
              userId: user.id,
              status: 'skipped_vendor',
              note: `Linked vendor ${vendorRows[0].id} — remove vendor first`,
              counts: {},
            });
            continue;
          }
        }

        try {
          if (!options.apply) {
            const counts = await previewCounts(user.id, mobile);
            results.push({
              mobile,
              userId: user.id,
              status: 'ok',
              note: 'Dry-run only — re-run with --apply to delete',
              counts,
            });
          } else {
            const counts = await purgeUser(user.id, mobile, true);
            results.push({
              mobile,
              userId: user.id,
              status: 'ok',
              note: 'Deleted',
              counts,
            });
          }
        } catch (error) {
          results.push({
            mobile,
            userId: user.id,
            status: 'error',
            note: error instanceof Error ? error.message : String(error),
            counts: {},
          });
        }
      }
    }
  } finally {
    await AppDataSource.destroy();
  }

  for (const row of results) {
    console.log(`Mobile: ${row.mobile}`);
    console.log(`  status:  ${row.status}`);
    console.log(`  userId:  ${row.userId ?? '-'}`);
    console.log(`  note:    ${row.note}`);
    if (Object.keys(row.counts).length) {
      console.log(`  counts:  ${JSON.stringify(row.counts)}`);
    }
    console.log('');
  }

  const errors = results.filter((r) => r.status === 'error' || r.status === 'skipped_vendor');
  if (errors.length) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
