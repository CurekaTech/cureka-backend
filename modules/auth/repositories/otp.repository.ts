import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpEntity } from '../entities/otp.entity';
import { OtpPurpose } from '../enums/otp-purpose.enum';

@Injectable()
export class OtpRepository {
  constructor(
    @InjectRepository(OtpEntity)
    private readonly repo: Repository<OtpEntity>,
  ) {}

  async create(data: Partial<OtpEntity>): Promise<OtpEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findActiveByMobileAndPurpose(
    mobileNumber: string,
    purpose: OtpPurpose,
  ): Promise<OtpEntity | null> {
    return this.repo.findOne({
      where: { mobileNumber, purpose, isVerified: false },
      order: { createdAt: 'DESC' },
    });
  }

  async updateById(id: string, data: Partial<OtpEntity>): Promise<void> {
    await this.repo.update(id, data);
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.repo.increment({ id }, 'attempts', 1);
  }
}
