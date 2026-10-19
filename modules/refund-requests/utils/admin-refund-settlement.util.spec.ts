import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import {
  buildAdminSettlementAllocation,
  resolveApproveRefundDestination,
} from './admin-refund-settlement.util';

describe('admin-refund-settlement.util', () => {
  it('defaults destination to WALLET', () => {
    expect(resolveApproveRefundDestination(undefined)).toBe(CodRefundMethod.WALLET);
    expect(resolveApproveRefundDestination(null)).toBe(CodRefundMethod.WALLET);
    expect(resolveApproveRefundDestination(CodRefundMethod.WALLET)).toBe(CodRefundMethod.WALLET);
  });

  it('accepts BANK_ACCOUNT when requested', () => {
    expect(resolveApproveRefundDestination(CodRefundMethod.BANK_ACCOUNT)).toBe(
      CodRefundMethod.BANK_ACCOUNT,
    );
  });

  it('routes full approved amount to wallet credit (no gateway leg)', () => {
    const allocation = buildAdminSettlementAllocation({
      approvedAmount: '125.50',
      destination: CodRefundMethod.WALLET,
    });

    expect(allocation).toMatchObject({
      totalAmount: '125.50',
      onlineAmount: '0.00',
      originalWalletAmount: '0.00',
      codAmount: '125.50',
      onlineProvider: null,
      codRefundMethod: CodRefundMethod.WALLET,
      onlineStatus: 'COMPLETED',
      originalWalletStatus: 'COMPLETED',
      codStatus: 'PENDING',
      adminSettlementDestination: CodRefundMethod.WALLET,
    });
  });

  it('routes full approved amount to bank payout', () => {
    const allocation = buildAdminSettlementAllocation({
      approvedAmount: '80.00',
      destination: CodRefundMethod.BANK_ACCOUNT,
    });

    expect(allocation).toMatchObject({
      totalAmount: '80.00',
      onlineAmount: '0.00',
      codAmount: '80.00',
      codRefundMethod: CodRefundMethod.BANK_ACCOUNT,
      adminSettlementDestination: CodRefundMethod.BANK_ACCOUNT,
    });
  });
});
