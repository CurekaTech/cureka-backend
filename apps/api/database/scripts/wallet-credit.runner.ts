/**
 * Add wallet balance for a staging test customer so GoKwik can redeem it.
 *
 * Credits the refund-wallet ledger and available_balance. Each --apply adds
 * the amount; it does not replace the current balance.
 *
 * Usage:
 *   npm run wallet:credit -- --phone=8888888888 --amount=2000
 *   npm run wallet:credit -- --phone=8888888888 --amount=2000 --apply
 *   npm run wallet:credit -- --phone=8888888888 --amount=500.50 --apply --idempotency-key=gokwik-staging-1
 */
import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { IsNull } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { AppDataSource } from '../data-source';
import { UserEntity } from '../../../../modules/users/entities/user.entity';
import { RefundWalletAccountEntity } from '../../../../modules/refund-requests/entities/refund-wallet-account.entity';
import { RefundWalletLedgerEntity } from '../../../../modules/refund-requests/entities/refund-wallet-ledger.entity';
import { RefundWalletAccountStatus } from '../../../../modules/refund-requests/enums/refund-wallet-account-status.enum';
import {
  RefundWalletEntryDirection,
  RefundWalletEntryType,
} from '../../../../modules/refund-requests/enums/refund-wallet-entry-type.enum';
import { paiseToRupees, rupeesToPaise } from '../../../../modules/refund-requests/utils/wallet-money.util';

const ACTOR = 'script:wallet-credit';
const MAX_CREDIT_RUPEES = 100_000;

export interface WalletCreditCli {
  phone: string;
  amount: string;
  apply: boolean;
  idempotencyKey?: string;
  help: boolean;
}

export const printWalletCreditUsage = (): void => {
  console.log(`
wallet:credit — Add available wallet balance for one customer

Required:
  --phone <10-digit mobile>     Example: 8888888888
  --amount <rupees>             Example: 2000 or 500.50

Optional:
  --idempotency-key <text>      Re-running the same key does not credit twice
  --apply                       Write the credit (default: show the plan only)

Examples:
  npm run wallet:credit -- --phone=8888888888 --amount=2000
  npm run wallet:credit -- --phone=8888888888 --amount=2000 --apply
`);
};

export const parseWalletCreditCli = (argv: string[]): WalletCreditCli => {
  const options: WalletCreditCli = { phone: '', amount: '', apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg.startsWith('--phone=')) {
      options.phone = arg.slice('--phone='.length);
    } else if (arg === '--phone' && next) {
      options.phone = next;
      index += 1;
    } else if (arg.startsWith('--amount=')) {
      options.amount = arg.slice('--amount='.length);
    } else if (arg === '--amount' && next) {
      options.amount = next;
      index += 1;
    } else if (arg.startsWith('--idempotency-key=')) {
      options.idempotencyKey = arg.slice('--idempotency-key='.length).trim();
    } else if (arg === '--idempotency-key' && next) {
      options.idempotencyKey = next.trim();
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
};

/** Last 10 digits of an Indian mobile. Rejects anything that is not a mobile. */
export const normalizeIndianMobile = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!/^[6-9]\d{9}$/.test(last10)) {
    throw new Error(`Phone must be a 10-digit Indian mobile. Received: ${phone}`);
  }
  return last10;
};

export const parseCreditAmount = (amount: string): { rupees: string; paise: number } => {
  const trimmed = amount.trim();
  const paise = rupeesToPaise(trimmed);
  if (paise <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  if (paise > MAX_CREDIT_RUPEES * 100) {
    throw new Error(`Amount cannot exceed ${MAX_CREDIT_RUPEES} rupees`);
  }
  return { rupees: paiseToRupees(paise), paise };
};

const buildIdempotencyKey = (phone: string, explicit?: string): string => {
  const key = explicit?.trim() || `staging-wallet:${phone}:${Date.now()}:${randomBytes(4).toString('hex')}`;
  if (key.length > 120) {
    throw new Error('Idempotency key must be 120 characters or fewer');
  }
  return key;
};

const findUsersByMobile = async (phone: string): Promise<UserEntity[]> => {
  return AppDataSource.getRepository(UserEntity)
    .createQueryBuilder('user')
    .where('user.deletedAt IS NULL')
    .andWhere(
      `right(regexp_replace(coalesce(user.mobile_number, ''), '\\D', '', 'g'), 10) = :phone`,
      { phone },
    )
    .getMany();
};

const usableRupees = (account: RefundWalletAccountEntity | null): string => {
  if (!account) return '0.00';
  const available = rupeesToPaise(account.availableBalance);
  const reserved = Number(account.reservedBalancePaise ?? 0);
  return paiseToRupees(available - reserved);
};

const creditWallet = async (
  user: UserEntity,
  amount: { rupees: string; paise: number },
  idempotencyKey: string,
): Promise<{ balance: string; usable: string; ledgerRefId: string; alreadyApplied: boolean }> => {
  return AppDataSource.transaction(async (manager) => {
    const accounts = manager.getRepository(RefundWalletAccountEntity);
    const ledger = manager.getRepository(RefundWalletLedgerEntity);

    const existing = await ledger.findOne({ where: { idempotencyKey, deletedAt: IsNull() } });
    if (existing) {
      const account = await accounts.findOne({ where: { customerId: user.id, deletedAt: IsNull() } });
      return {
        balance: account ? paiseToRupees(rupeesToPaise(account.availableBalance)) : '0.00',
        usable: usableRupees(account),
        ledgerRefId: existing.refId,
        alreadyApplied: true,
      };
    }

    let account = await accounts
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.customerId = :customerId', { customerId: user.id })
      .andWhere('account.deletedAt IS NULL')
      .getOne();

    if (!account) {
      const refId = await generateUniqueRefId('rfwallet', (candidate) =>
        accounts.exists({ where: { refId: candidate } }),
      );
      await manager.query(
        `INSERT INTO "refund_wallet_accounts" ("ref_id", "customer_id", "available_balance", "reserved_balance_paise", "status", "currency", "created_by", "updated_by")
         VALUES ($1, $2, 0, 0, 'ACTIVE', 'INR', $3, $3)
         ON CONFLICT ("customer_id") DO NOTHING`,
        [refId, user.id, ACTOR],
      );
      account = await accounts
        .createQueryBuilder('account')
        .setLock('pessimistic_write')
        .where('account.customerId = :customerId', { customerId: user.id })
        .andWhere('account.deletedAt IS NULL')
        .getOne();
    }

    if (!account) {
      throw new Error('Unable to create the wallet account');
    }
    if (account.status !== RefundWalletAccountStatus.ACTIVE) {
      throw new Error(
        `Wallet status is ${account.status}. GoKwik can spend an ACTIVE wallet only.`,
      );
    }

    const nextBalance = paiseToRupees(rupeesToPaise(account.availableBalance) + amount.paise);
    const ledgerRefId = await generateUniqueRefId('rfwled', (candidate) =>
      ledger.exists({ where: { refId: candidate } }),
    );
    await ledger.save(
      ledger.create({
        refId: ledgerRefId,
        accountId: account.id,
        customerId: user.id,
        direction: RefundWalletEntryDirection.CREDIT,
        type: RefundWalletEntryType.ORIGINAL_WALLET_REFUND,
        amount: amount.rupees,
        balanceAfter: nextBalance,
        currency: 'INR',
        payoutId: null,
        refundRequestId: null,
        returnRequestId: null,
        paymentRequestId: null,
        orderId: null,
        reservationId: null,
        idempotencyKey,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      }),
    );
    await accounts.update({ id: account.id }, { availableBalance: nextBalance, updatedBy: ACTOR });
    const updated = await accounts.findOne({ where: { id: account.id } });
    return {
      balance: nextBalance,
      usable: usableRupees(updated),
      ledgerRefId,
      alreadyApplied: false,
    };
  });
};

export const runWalletCredit = async (options: WalletCreditCli): Promise<void> => {
  if (options.help) {
    printWalletCreditUsage();
    return;
  }
  const phone = normalizeIndianMobile(options.phone);
  const amount = parseCreditAmount(options.amount);
  const idempotencyKey = buildIdempotencyKey(phone, options.idempotencyKey);

  await AppDataSource.initialize();
  try {
    const users = await findUsersByMobile(phone);
    if (users.length === 0) {
      throw new Error(`No active user with mobile ${phone}`);
    }
    if (users.length > 1) {
      const matches = users.map((user) => `${user.id} (${user.mobileNumber ?? ''})`).join(', ');
      throw new Error(`More than one user matches ${phone}: ${matches}`);
    }
    const user = users[0]!;
    const account = await AppDataSource.getRepository(RefundWalletAccountEntity).findOne({
      where: { customerId: user.id, deletedAt: IsNull() },
    });
    const beforeUsable = usableRupees(account);
    const beforeBalance = account ? paiseToRupees(rupeesToPaise(account.availableBalance)) : '0.00';

    console.log(
      JSON.stringify(
        {
          phone,
          userId: user.id,
          storedMobile: user.mobileNumber ?? null,
          creditRupees: amount.rupees,
          balanceBefore: beforeBalance,
          usableBefore: beforeUsable,
          walletStatus: account?.status ?? 'WILL_CREATE',
          idempotencyKey,
          apply: options.apply,
        },
        null,
        2,
      ),
    );

    if (!options.apply) {
      console.log('Dry run only. Re-run with --apply to credit the wallet.');
      return;
    }

    const result = await creditWallet(user, amount, idempotencyKey);
    console.log(
      JSON.stringify(
        {
          phone,
          userId: user.id,
          creditedRupees: result.alreadyApplied ? '0.00' : amount.rupees,
          alreadyApplied: result.alreadyApplied,
          balanceAfter: result.balance,
          usableAfter: result.usable,
          ledgerRefId: result.ledgerRefId,
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
};

if (require.main === module) {
  runWalletCredit(parseWalletCreditCli(process.argv.slice(2))).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
