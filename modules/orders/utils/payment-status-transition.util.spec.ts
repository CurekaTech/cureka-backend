import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import {
  canTransitionOrderStatus,
  canTransitionPaymentStatus,
  resolveOrderStatusUpdate,
  resolvePaymentStatusUpdate,
} from './payment-status-transition.util';

describe('payment-status-transition.util', () => {
  describe('canTransitionPaymentStatus', () => {
    it('allows same status (idempotent)', () => {
      expect(canTransitionPaymentStatus(OrderPaymentStatus.PAID, OrderPaymentStatus.PAID)).toBe(
        true,
      );
    });

    it('allows PENDING → PAID', () => {
      expect(canTransitionPaymentStatus(OrderPaymentStatus.PENDING, OrderPaymentStatus.PAID)).toBe(
        true,
      );
    });

    it('blocks PAID → PENDING / FAILED (out-of-order)', () => {
      expect(canTransitionPaymentStatus(OrderPaymentStatus.PAID, OrderPaymentStatus.PENDING)).toBe(
        false,
      );
      expect(canTransitionPaymentStatus(OrderPaymentStatus.PAID, OrderPaymentStatus.FAILED)).toBe(
        false,
      );
    });

    it('blocks REFUNDED → PAID', () => {
      expect(canTransitionPaymentStatus(OrderPaymentStatus.REFUNDED, OrderPaymentStatus.PAID)).toBe(
        false,
      );
    });
  });

  describe('resolvePaymentStatusUpdate', () => {
    it('skips regressive updates', () => {
      expect(
        resolvePaymentStatusUpdate(OrderPaymentStatus.PAID, OrderPaymentStatus.FAILED),
      ).toEqual({
        apply: false,
        status: OrderPaymentStatus.PAID,
        skipped: true,
      });
    });

    it('applies forward updates', () => {
      expect(
        resolvePaymentStatusUpdate(OrderPaymentStatus.PENDING, OrderPaymentStatus.PAID),
      ).toEqual({
        apply: true,
        status: OrderPaymentStatus.PAID,
        skipped: false,
      });
    });
  });

  describe('order status', () => {
    it('blocks CONFIRMED → PENDING', () => {
      expect(canTransitionOrderStatus(OrderStatus.CONFIRMED, OrderStatus.PENDING)).toBe(false);
    });

    it('allows PENDING → CONFIRMED', () => {
      expect(
        resolveOrderStatusUpdate(OrderStatus.PENDING, OrderStatus.CONFIRMED),
      ).toEqual({
        apply: true,
        status: OrderStatus.CONFIRMED,
        skipped: false,
      });
    });

    it('blocks updates after CANCELLED', () => {
      expect(canTransitionOrderStatus(OrderStatus.CANCELLED, OrderStatus.CONFIRMED)).toBe(false);
    });
  });
});
