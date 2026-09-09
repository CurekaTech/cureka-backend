import { PERMISSIONS_KEY } from '@modules/roles/decorators/permissions.decorator';
import { AdminCodBlocklistController } from './admin-cod-blocklist.controller';

describe('AdminCodBlocklistController RBAC', () => {
  it('requires cod_blocklist.read on list', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminCodBlocklistController.prototype.list),
    ).toEqual(['cod_blocklist.read']);
  });

  it('requires cod_blocklist.read on customer search', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        AdminCodBlocklistController.prototype.searchCustomers,
      ),
    ).toEqual(['cod_blocklist.read']);
  });

  it('requires cod_blocklist.read on findOne', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminCodBlocklistController.prototype.findOne),
    ).toEqual(['cod_blocklist.read']);
  });

  it('requires cod_blocklist.create on create', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminCodBlocklistController.prototype.create),
    ).toEqual(['cod_blocklist.create']);
  });

  it('requires cod_blocklist.update on update', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminCodBlocklistController.prototype.update),
    ).toEqual(['cod_blocklist.update']);
  });

  it('requires cod_blocklist.delete on remove', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminCodBlocklistController.prototype.remove),
    ).toEqual(['cod_blocklist.delete']);
  });
});
