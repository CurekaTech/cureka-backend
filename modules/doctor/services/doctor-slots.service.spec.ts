import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DoctorSlotsService } from './doctor-slots.service';
import { DoctorSlotStatus } from '../enums/doctor-slot-status.enum';
import { DoctorSlotEntity } from '../entities/doctor-slot.entity';

describe('DoctorSlotsService', () => {
  let service: DoctorSlotsService;
  let dataSource: jest.Mocked<DataSource>;
  let slotsRepo: jest.Mocked<Repository<DoctorSlotEntity>>;

  beforeEach(() => {
    slotsRepo = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((v) => v),
      exists: jest.fn().mockResolvedValue(false),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<DoctorSlotEntity>>;

    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({
          getRepository: () => slotsRepo,
        }),
      ),
    } as unknown as jest.Mocked<DataSource>;

    service = new DoctorSlotsService(
      dataSource,
      slotsRepo,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe('holdSlot', () => {
    it('rejects when slot is not OPEN', async () => {
      jest.spyOn(service, 'recoverExpiredHolds').mockResolvedValue(0);
      const lockedSlot = {
        id: 'slot-1',
        status: DoctorSlotStatus.BOOKED,
        heldByConsultationId: null,
        holdExpiresAt: null,
      } as DoctorSlotEntity;

      jest.spyOn(service as any, 'lockSlot').mockResolvedValue(lockedSlot);

      await expect(service.holdSlot('slot-1', 'con-1')).rejects.toThrow(ConflictException);
    });

    it('rejects when another consultation holds the slot', async () => {
      jest.spyOn(service, 'recoverExpiredHolds').mockResolvedValue(0);
      const lockedSlot = {
        id: 'slot-1',
        status: DoctorSlotStatus.HELD,
        heldByConsultationId: 'other-con',
        holdExpiresAt: new Date(Date.now() + 60_000),
      } as DoctorSlotEntity;

      jest.spyOn(service as any, 'lockSlot').mockResolvedValue(lockedSlot);

      await expect(service.holdSlot('slot-1', 'con-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('hasDoctorOverlap', () => {
    it('returns true when overlapping slots exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      };
      slotsRepo.createQueryBuilder.mockReturnValue(qb as never);

      const overlap = await (service as any).hasDoctorOverlap(
        'doc-1',
        new Date('2026-01-01T10:00:00Z'),
        new Date('2026-01-01T10:30:00Z'),
      );

      expect(overlap).toBe(true);
      expect(qb.getCount).toHaveBeenCalled();
    });
  });
});
