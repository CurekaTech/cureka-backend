import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { CreateUserAddressDto, UpdateUserAddressDto } from '../dto/user-address.dto';
import { UserAddressEntity } from '../entities/user-address.entity';
import { IUserAddress } from '../interfaces/user-address.interface';
import { mapUserAddressEntityToResponse } from '../mappers/user-address.mapper';
import { UserAddressesRepository } from '../repositories/user-addresses.repository';

@Injectable()
export class UserAddressesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly addressesRepository: UserAddressesRepository,
  ) {}

  async create(userId: string, dto: CreateUserAddressDto): Promise<IUserAddress> {
    return this.dataSource.transaction(async (manager) => {
      const existingCount = await this.addressesRepository.countByUserId(userId, manager);
      const shouldBeDefault = dto.isDefault === true || existingCount === 0;

      if (shouldBeDefault) {
        await this.addressesRepository.clearDefaultForUser(userId, undefined, manager);
      }

      const refId = await generateUniqueRefId(dto.recipientName, (candidate) =>
        this.addressesRepository.existsByRefId(candidate),
      );

      const created = await this.addressesRepository.create(
        {
          refId,
          userId,
          recipientName: dto.recipientName,
          phoneNumber: dto.phoneNumber,
          pincode: dto.pincode,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2 ?? null,
          landmark: dto.landmark ?? null,
          city: dto.city,
          state: dto.state,
          addressType: dto.addressType,
          isDefault: shouldBeDefault,
          createdBy: userId,
          updatedBy: userId,
        },
        manager,
      );

      return mapUserAddressEntityToResponse(created);
    });
  }

  async findAll(userId: string): Promise<IUserAddress[]> {
    const addresses = await this.addressesRepository.findAllByUserId(userId);
    return addresses.map(mapUserAddressEntityToResponse);
  }

  async findOne(userId: string, id: string): Promise<IUserAddress> {
    const address = await this.getOwnedAddressOrThrow(userId, id);
    return mapUserAddressEntityToResponse(address);
  }

  async update(userId: string, id: string, dto: UpdateUserAddressDto): Promise<IUserAddress> {
    return this.dataSource.transaction(async (manager) => {
      await this.getOwnedAddressOrThrow(userId, id, manager);

      if (dto.isDefault === true) {
        await this.addressesRepository.clearDefaultForUser(userId, id, manager);
      }

      const updated = await this.addressesRepository.updateById(
        id,
        {
          ...(dto.recipientName !== undefined && { recipientName: dto.recipientName }),
          ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
          ...(dto.pincode !== undefined && { pincode: dto.pincode }),
          ...(dto.addressLine1 !== undefined && { addressLine1: dto.addressLine1 }),
          ...(dto.addressLine2 !== undefined && { addressLine2: dto.addressLine2 ?? null }),
          ...(dto.landmark !== undefined && { landmark: dto.landmark ?? null }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.state !== undefined && { state: dto.state }),
          ...(dto.addressType !== undefined && { addressType: dto.addressType }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
          updatedBy: userId,
        },
        manager,
      );

      if (!updated) {
        throw new NotFoundException(`Address with id "${id}" not found`);
      }

      const reloaded = await manager.getRepository(UserAddressEntity).findOne({ where: { id } });
      if (!reloaded) {
        throw new NotFoundException(`Address with id "${id}" not found`);
      }

      return mapUserAddressEntityToResponse(reloaded);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await this.getOwnedAddressOrThrow(userId, id, manager);
      await this.addressesRepository.softDeleteById(id, manager);

      if (!existing.isDefault) {
        return;
      }

      const fallback = await this.addressesRepository.findLatestByUserId(userId, manager);
      if (fallback) {
        await this.addressesRepository.updateById(fallback.id, { isDefault: true }, manager);
      }
    });
  }

  async setDefault(userId: string, id: string): Promise<IUserAddress> {
    return this.dataSource.transaction(async (manager) => {
      await this.getOwnedAddressOrThrow(userId, id, manager);
      await this.addressesRepository.clearDefaultForUser(userId, id, manager);
      const updated = await this.addressesRepository.updateById(
        id,
        { isDefault: true, updatedBy: userId },
        manager,
      );
      if (!updated) {
        throw new NotFoundException(`Address with id "${id}" not found`);
      }
      return mapUserAddressEntityToResponse(updated);
    });
  }

  private async getOwnedAddressOrThrow(
    userId: string,
    id: string,
    manager?: EntityManager,
  ): Promise<UserAddressEntity> {
    const address = await this.addressesRepository.findByIdAndUserId(id, userId, manager);

    if (!address) {
      throw new NotFoundException(`Address with id "${id}" not found`);
    }

    return address;
  }
}
