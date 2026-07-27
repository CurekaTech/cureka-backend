/**
 * Mint Cureka session tokens + cart_id pairs for GoKwik sandbox testing.
 *
 * Each token must be used ONLY with that same user's cart_id.
 * Mixing token(A) + cart_id(B) returns: "Cart does not belong to the authenticated user".
 *
 * Usage:
 *   npm run gokwik:test-credentials
 *   npm run gokwik:test-credentials -- --phones=7845784596,7845127845
 *   npm run gokwik:test-credentials -- --out=docs/gokwik-test-credentials.json
 */
import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { UserEntity } from '../../../../modules/users/entities/user.entity';
import { CartEntity } from '../../../../modules/orders/entities/cart.entity';
import { CartItemEntity } from '../../../../modules/orders/entities/cart-item.entity';
import { UserSessionEntity } from '../../../../modules/auth/entities/user-session.entity';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../../../modules/auth/utils/refresh-token.util';

const DEFAULT_PHONES = ['7845784596', '7845127845', '7841455556', '8200994455'];

interface CliOptions {
  phones: string[];
  out?: string;
  help: boolean;
}

interface CredentialRow {
  mobile: string;
  userId: string | null;
  cartId: string | null;
  cartItemCount: number;
  token: string | null;
  tokenExpiresAt: string | null;
  status: 'ok' | 'user_not_found' | 'no_active_cart' | 'empty_cart';
  note: string;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { phones: [...DEFAULT_PHONES], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--phones=')) {
      options.phones = splitPhones(arg.slice('--phones='.length));
    } else if (arg === '--phones' && next) {
      options.phones = splitPhones(next);
      index += 1;
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length);
    } else if (arg === '--out' && next) {
      options.out = next;
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

const sessionExpiresAt = (): Date => {
  const days = parseInt(process.env['JWT_REFRESH_EXPIRES_IN_DAYS'] ?? '90', 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (Number.isFinite(days) ? days : 90));
  return expiresAt;
};

const findUserByPhone = async (phone: string): Promise<UserEntity | null> => {
  const repo = AppDataSource.getRepository(UserEntity);
  const variants = normalizePhoneVariants(phone);
  for (const candidate of variants) {
    const user = await repo.findOne({
      where: { mobileNumber: candidate, deletedAt: IsNull() },
    });
    if (user) return user;
  }
  return null;
};

const findActiveCartWithItems = async (
  userId: string,
): Promise<{ cart: CartEntity; itemCount: number } | null> => {
  const cartRepo = AppDataSource.getRepository(CartEntity);
  const itemRepo = AppDataSource.getRepository(CartItemEntity);

  const carts = await cartRepo.find({
    where: { userId, isActive: true, deletedAt: IsNull() },
    order: { updatedAt: 'DESC' },
  });

  for (const cart of carts) {
    const itemCount = await itemRepo.count({
      where: { cartId: cart.id, deletedAt: IsNull() },
    });
    if (itemCount > 0) {
      return { cart, itemCount };
    }
  }

  if (carts[0]) {
    return { cart: carts[0], itemCount: 0 };
  }
  return null;
};

const createSessionToken = async (userId: string): Promise<{ token: string; expiresAt: Date }> => {
  const token = generateRefreshToken();
  const expiresAt = sessionExpiresAt();
  const now = new Date();

  await AppDataSource.getRepository(UserSessionEntity).save({
    userId,
    refreshTokenHash: hashRefreshToken(token),
    deviceId: 'gokwik-test-script',
    deviceName: 'GoKwik test credentials runner',
    browser: 'script',
    os: 'node',
    ipAddress: '127.0.0.1',
    lastActivity: now,
    expiresAt,
    isRevoked: false,
  });

  return { token, expiresAt };
};

const printHelp = (): void => {
  console.log(`
GoKwik test credentials (token + cart_id pairs)

Options:
  --phones <list>   Comma-separated mobiles (default: ${DEFAULT_PHONES.join(',')})
  --out <path>      Write JSON file with the pairs
  --help            Show this help

Important:
  Always send Authorization: Bearer <token> with THAT SAME user's cart_id.
`);
};

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await AppDataSource.initialize();

  const rows: CredentialRow[] = [];

  try {
    for (const mobile of options.phones) {
      const user = await findUserByPhone(mobile);
      if (!user) {
        rows.push({
          mobile,
          userId: null,
          cartId: null,
          cartItemCount: 0,
          token: null,
          tokenExpiresAt: null,
          status: 'user_not_found',
          note: 'No user with this mobile_number',
        });
        continue;
      }

      const cartResult = await findActiveCartWithItems(user.id);
      if (!cartResult) {
        rows.push({
          mobile,
          userId: user.id,
          cartId: null,
          cartItemCount: 0,
          token: null,
          tokenExpiresAt: null,
          status: 'no_active_cart',
          note: 'User exists but has no active cart — add items in storefront first',
        });
        continue;
      }

      if (cartResult.itemCount === 0) {
        rows.push({
          mobile,
          userId: user.id,
          cartId: cartResult.cart.id,
          cartItemCount: 0,
          token: null,
          tokenExpiresAt: null,
          status: 'empty_cart',
          note: 'Active cart exists but has 0 items — add products before sharing with GoKwik',
        });
        continue;
      }

      const { token, expiresAt } = await createSessionToken(user.id);
      rows.push({
        mobile,
        userId: user.id,
        cartId: cartResult.cart.id,
        cartItemCount: cartResult.itemCount,
        token,
        tokenExpiresAt: expiresAt.toISOString(),
        status: 'ok',
        note: 'Use this token only with this cart_id',
      });
    }
  } finally {
    await AppDataSource.destroy();
  }

  const shareable = rows
    .filter((r) => r.status === 'ok')
    .map((r) => ({
      mobile: r.mobile,
      cart_id: r.cartId,
      token: r.token,
      expires_at: r.tokenExpiresAt,
      cart_item_count: r.cartItemCount,
    }));

  console.log('\n=== GoKwik test credentials ===\n');
  console.log(
    'Rule: each Bearer token must be paired with its own cart_id (same user). Mixing users fails ownership check.\n',
  );

  for (const row of rows) {
    console.log(`Mobile: ${row.mobile}`);
    console.log(`  status:     ${row.status}`);
    console.log(`  user_id:    ${row.userId ?? '-'}`);
    console.log(`  cart_id:    ${row.cartId ?? '-'}`);
    console.log(`  items:      ${row.cartItemCount}`);
    console.log(`  token:      ${row.token ?? '-'}`);
    console.log(`  expires_at: ${row.tokenExpiresAt ?? '-'}`);
    console.log(`  note:       ${row.note}`);
    console.log('');
  }

  console.log(`Ready pairs for GoKwik: ${shareable.length}/${rows.length}\n`);

  if (options.out) {
    const outPath = isAbsolute(options.out) ? options.out : resolve(process.cwd(), options.out);
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          warning:
            'Do not mix token from one row with cart_id from another. Keep each pair together.',
          pairs: shareable,
          all: rows,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`Wrote ${outPath}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
