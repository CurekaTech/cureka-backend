import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminSettingsRepository } from '../repositories/admin-settings.repository';
import { UpdateSettingValueDto, ToggleSettingStatusDto } from '../dto/admin-setting.dto';
import { mapAdminSettingEntitiesToResponse, mapAdminSettingEntityToResponse } from '../mappers/admin-setting.mapper';
import { IAdminSetting } from '../interfaces/admin-setting.interface';

@Injectable()
export class AdminSettingsService {
  constructor(private readonly adminSettingsRepository: AdminSettingsRepository) {}

  async findAll(): Promise<IAdminSetting[]> {
    const entities = await this.adminSettingsRepository.findAll();
    return mapAdminSettingEntitiesToResponse(entities);
  }

  async updateValue(key: string, dto: UpdateSettingValueDto, updatedBy: string): Promise<IAdminSetting> {
    const existing = await this.adminSettingsRepository.findByKey(key);
    if (!existing) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }

    await this.adminSettingsRepository.updateByKey(key, {
      value: dto.value,
      updatedBy,
    });

    const updated = await this.adminSettingsRepository.findByKey(key);
    return mapAdminSettingEntityToResponse(updated!);
  }

  async toggleStatus(key: string, dto: ToggleSettingStatusDto, updatedBy: string): Promise<IAdminSetting> {
    const existing = await this.adminSettingsRepository.findByKey(key);
    if (!existing) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }

    await this.adminSettingsRepository.updateByKey(key, {
      status: dto.status,
      updatedBy,
    });

    const updated = await this.adminSettingsRepository.findByKey(key);
    return mapAdminSettingEntityToResponse(updated!);
  }
}
