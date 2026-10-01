import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductPincodeEntity } from '@modules/product/entities/product-pincode.entity';
import { PincodeEntity } from '../entities/pincode.entity';
import { PincodesService } from './pincodes.service';

describe('PincodesService public lookup', () => {
  const pincodes = {
    findOne: jest.fn(),
  };
  const mappings = {};
  const service = new PincodesService(
    pincodes as unknown as Repository<PincodeEntity>,
    mappings as unknown as Repository<ProductPincodeEntity>,
  );

  beforeEach(() => {
    pincodes.findOne.mockReset();
  });

  it('F: rejects a badly formatted pincode with 400', async () => {
    await expect(service.findPublicByCode('3800')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolveForStorefront('abc')).rejects.toBeInstanceOf(BadRequestException);
    expect(pincodes.findOne).not.toHaveBeenCalled();
  });

  it('F: returns 404 when a 6-digit pincode is missing from the master', async () => {
    pincodes.findOne.mockResolvedValue(null);
    await expect(service.findPublicByCode('999999')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolveForStorefront('999999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('treats an omitted pincode as no selection', async () => {
    await expect(service.resolveForStorefront()).resolves.toEqual({
      pincodeId: null,
      pincode: null,
    });
    await expect(service.resolveForStorefront('   ')).resolves.toEqual({
      pincodeId: null,
      pincode: null,
    });
    expect(pincodes.findOne).not.toHaveBeenCalled();
  });
});
