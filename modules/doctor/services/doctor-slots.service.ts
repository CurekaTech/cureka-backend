import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DoctorAvailabilityEntity } from '../entities/doctor-availability.entity';
import { DoctorClinicAssociationEntity } from '../entities/doctor-clinic-association.entity';
import { DoctorConsultationConfigEntity } from '../entities/doctor-consultation-config.entity';
import { DoctorSlotEntity } from '../entities/doctor-slot.entity';
import { ConsultationEntity } from '@modules/consultation/entities/consultation.entity';
import { ConsultationStatus } from '@modules/consultation/enums/consultation-status.enum';
import { DoctorSlotStatus } from '../enums/doctor-slot-status.enum';
import {
  DoctorAvailabilityRuleDto,
  SetDoctorAvailabilityDto,
} from '../dto/doctor-availability.dto';

const DEFAULT_HOLD_MINUTES = 15;

@Injectable()
export class DoctorSlotsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DoctorSlotEntity)
    private readonly slotsRepo: Repository<DoctorSlotEntity>,
    @InjectRepository(DoctorAvailabilityEntity)
    private readonly availabilityRepo: Repository<DoctorAvailabilityEntity>,
    @InjectRepository(DoctorConsultationConfigEntity)
    private readonly configRepo: Repository<DoctorConsultationConfigEntity>,
    @InjectRepository(DoctorClinicAssociationEntity)
    private readonly clinicsRepo: Repository<DoctorClinicAssociationEntity>,
  ) {}

  async listOpenSlots(doctorId: string, clinicId: string, from: Date, to: Date) {
    await this.recoverExpiredHolds();
    return this.slotsRepo.find({
      where: {
        doctorId,
        clinicId,
        status: DoctorSlotStatus.OPEN,
      },
      order: { startAt: 'ASC' },
    }).then((rows) =>
      rows.filter((s) => s.startAt >= from && s.startAt <= to),
    );
  }

  async generateSlotsForRange(
    doctorId: string,
    clinicId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<DoctorSlotEntity[]> {
    const clinic = await this.clinicsRepo.findOne({ where: { id: clinicId, doctorId } });
    if (!clinic) throw new NotFoundException('Clinic not found for doctor');

    const config = await this.configRepo.findOne({ where: { doctorId } });
    const durationMinutes = config?.durationMinutes ?? 30;
    const bufferMinutes = config?.bufferMinutes ?? 0;
    const slotSpanMs = (durationMinutes + bufferMinutes) * 60 * 1000;

    const availabilities = await this.availabilityRepo.find({
      where: { doctorId, clinicId, isActive: true },
    });
    if (availabilities.length === 0) return [];

    const created: DoctorSlotEntity[] = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    while (cursor <= end) {
      const weekday = cursor.getDay();
      const dayRules = availabilities.filter((a) => a.weekday === weekday);
      for (const rule of dayRules) {
        let slotStart = this.combineDateAndTime(cursor, rule.startTime);
        const dayEnd = this.combineDateAndTime(cursor, rule.endTime);
        while (slotStart.getTime() + slotSpanMs <= dayEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
          const overlap = await this.hasDoctorOverlap(doctorId, slotStart, slotEnd);
          if (!overlap) {
            try {
              const saved = await this.slotsRepo.save(
                this.slotsRepo.create({
                  doctorId,
                  clinicId,
                  startAt: new Date(slotStart),
                  endAt: slotEnd,
                  status: DoctorSlotStatus.OPEN,
                }),
              );
              created.push(saved);
            } catch {
              // unique doctor+start — skip duplicate
            }
          }
          slotStart = new Date(slotStart.getTime() + slotSpanMs);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return created;
  }

  /** Releases HELD slots past holdExpiresAt and expires stale AWAITING_PAYMENT consultations. */
  async recoverExpiredHolds(): Promise<number> {
    const now = new Date();
    return this.dataSource.transaction(async (manager) => {
      const slotRepo = manager.getRepository(DoctorSlotEntity);
      const expired = await slotRepo
        .createQueryBuilder('s')
        .where('s.status = :held', { held: DoctorSlotStatus.HELD })
        .andWhere('s.hold_expires_at IS NOT NULL')
        .andWhere('s.hold_expires_at < :now', { now })
        .getMany();

      if (expired.length === 0) return 0;

      const consultationIds = expired
        .map((s) => s.heldByConsultationId)
        .filter((id): id is string => !!id);

      for (const slot of expired) {
        slot.status = DoctorSlotStatus.OPEN;
        slot.holdExpiresAt = null;
        slot.heldByConsultationId = null;
      }
      await slotRepo.save(expired);

      if (consultationIds.length > 0) {
        const consultationRepo = manager.getRepository(ConsultationEntity);
        await consultationRepo
          .createQueryBuilder()
          .update(ConsultationEntity)
          .set({
            status: ConsultationStatus.EXPIRED,
            updatedAt: now,
          })
          .where('id IN (:...ids)', { ids: consultationIds })
          .andWhere('status = :awaiting', { awaiting: ConsultationStatus.AWAITING_PAYMENT })
          .execute();
      }

      return expired.length;
    });
  }

  async setAvailability(
    doctorId: string,
    dto: SetDoctorAvailabilityDto,
    actor: string,
  ): Promise<DoctorAvailabilityEntity[]> {
    const clinic = await this.clinicsRepo.findOne({
      where: { id: dto.clinicId, doctorId },
    });
    if (!clinic) throw new NotFoundException('Clinic not found for doctor');

    await this.availabilityRepo.delete({ doctorId, clinicId: dto.clinicId });

    const rows: DoctorAvailabilityEntity[] = [];
    for (const rule of dto.rules) {
      rows.push(
        await this.availabilityRepo.save(
          this.availabilityRepo.create(this.mapAvailabilityRule(doctorId, dto.clinicId, rule, actor)),
        ),
      );
    }
    return rows;
  }

  async holdSlot(
    slotId: string,
    consultationId: string,
    holdMinutes = DEFAULT_HOLD_MINUTES,
  ): Promise<DoctorSlotEntity> {
    await this.recoverExpiredHolds();
    return this.dataSource.transaction(async (manager) => {
      const slot = await this.lockSlot(manager, slotId);
      if (slot.status !== DoctorSlotStatus.OPEN) {
        throw new ConflictException('Slot is not available');
      }
      const holdExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
      slot.status = DoctorSlotStatus.HELD;
      slot.holdExpiresAt = holdExpiresAt;
      slot.heldByConsultationId = consultationId;
      return manager.getRepository(DoctorSlotEntity).save(slot);
    });
  }

  async bookSlot(slotId: string, consultationId: string): Promise<DoctorSlotEntity> {
    return this.dataSource.transaction(async (manager) => {
      const slot = await this.lockSlot(manager, slotId);
      if (
        slot.status !== DoctorSlotStatus.HELD ||
        slot.heldByConsultationId !== consultationId
      ) {
        throw new ConflictException('Slot hold is invalid or expired');
      }
      slot.status = DoctorSlotStatus.BOOKED;
      slot.holdExpiresAt = null;
      return manager.getRepository(DoctorSlotEntity).save(slot);
    });
  }

  async releaseSlot(slotId: string, consultationId?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const slot = await this.lockSlot(manager, slotId);
      if (consultationId && slot.heldByConsultationId !== consultationId) {
        return;
      }
      if (slot.status === DoctorSlotStatus.BOOKED) {
        throw new BadRequestException('Cannot release a booked slot; use releaseBookedSlot');
      }
      slot.status = DoctorSlotStatus.OPEN;
      slot.holdExpiresAt = null;
      slot.heldByConsultationId = null;
      await manager.getRepository(DoctorSlotEntity).save(slot);
    });
  }

  /** Used by cancel/reschedule flows only. */
  async releaseBookedSlot(slotId: string, consultationId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const slot = await this.lockSlot(manager, slotId);
      if (slot.status !== DoctorSlotStatus.BOOKED) {
        if (slot.status === DoctorSlotStatus.HELD && slot.heldByConsultationId === consultationId) {
          slot.status = DoctorSlotStatus.OPEN;
          slot.holdExpiresAt = null;
          slot.heldByConsultationId = null;
          await manager.getRepository(DoctorSlotEntity).save(slot);
        }
        return;
      }
      slot.status = DoctorSlotStatus.OPEN;
      slot.holdExpiresAt = null;
      slot.heldByConsultationId = null;
      await manager.getRepository(DoctorSlotEntity).save(slot);
    });
  }

  private async lockSlot(manager: EntityManager, slotId: string): Promise<DoctorSlotEntity> {
    const slot = await manager.getRepository(DoctorSlotEntity).findOne({
      where: { id: slotId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    return slot;
  }

  private async hasDoctorOverlap(
    doctorId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<boolean> {
    const count = await this.slotsRepo
      .createQueryBuilder('s')
      .where('s.doctor_id = :doctorId', { doctorId })
      .andWhere('s.start_at < :endAt', { endAt })
      .andWhere('s.end_at > :startAt', { startAt })
      .andWhere('s.status != :blocked', { blocked: DoctorSlotStatus.BLOCKED })
      .getCount();
    return count > 0;
  }

  private mapAvailabilityRule(
    doctorId: string,
    clinicId: string,
    rule: DoctorAvailabilityRuleDto,
    actor: string,
  ): Partial<DoctorAvailabilityEntity> {
    return {
      doctorId,
      clinicId,
      weekday: rule.weekday,
      startTime: rule.startTime,
      endTime: rule.endTime,
      isActive: rule.isActive ?? true,
      createdBy: actor,
      updatedBy: actor,
    };
  }

  private combineDateAndTime(date: Date, time: string): Date {
    const [h, m, s] = time.split(':').map((part) => parseInt(part, 10));
    const result = new Date(date);
    result.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
    return result;
  }
}
