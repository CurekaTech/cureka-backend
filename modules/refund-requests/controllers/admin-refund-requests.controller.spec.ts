import { PERMISSIONS_KEY } from '@modules/roles/decorators/permissions.decorator';
import { AdminRefundRequestsController } from '../controllers/admin-refund-requests.controller';

describe('AdminRefundRequestsController RBAC', () => {
  it('requires refund_requests.approve on approve', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      AdminRefundRequestsController.prototype.approve,
    );
    expect(permissions).toEqual(['refund_requests.approve']);
  });

  it('requires refund_requests.status on initiate', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      AdminRefundRequestsController.prototype.initiate,
    );
    expect(permissions).toEqual(['refund_requests.status']);
  });

  it('requires refund_requests.read on list', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      AdminRefundRequestsController.prototype.list,
    );
    expect(permissions).toEqual(['refund_requests.read']);
  });

  it('requires refund_payouts.read on payout view and reveal', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminRefundRequestsController.prototype.getPayout),
    ).toEqual(['refund_payouts.read']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminRefundRequestsController.prototype.reveal),
    ).toEqual(['refund_payouts.read']);
  });

  it('requires refund_payouts.status to mark a bank transfer paid', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminRefundRequestsController.prototype.markPaid),
    ).toEqual(['refund_payouts.status']);
  });
});
