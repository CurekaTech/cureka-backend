import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CheckoutResolverService } from '@modules/checkout/services/checkout-resolver.service';
import {
  canonicalizeIndianMobileNumber,
  parseCanonicalIndianMobileNumber,
} from '@modules/auth/utils/mobile-number.util';
import { CodEligibility } from '@modules/orders/services/cart-checkout-admin-settings.service';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { UserRole } from '@modules/users/enums/user-role.enum';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { maskMobile } from '@packages/logger';
import {
  COD_BLOCKLIST_CUSTOMER_SEARCH_MIN_LENGTH,
  COD_BLOCKLIST_INVALID_CUSTOMER,
  COD_BLOCKLIST_INVALID_MOBILE,
  COD_BLOCKLIST_INVALID_PINCODE,
  COD_BLOCKLIST_NOT_FOUND,
  COD_BLOCKLIST_SEARCH_TOO_SHORT,
  COD_BLOCKLIST_TYPE_IMMUTABLE,
} from '../constants/cod-blocklist.constants';
import {
  CreateCodBlocklistEntryDto,
  CodBlocklistListQueryDto,
  SearchCodBlocklistCustomersDto,
  UpdateCodBlocklistEntryDto,
} from '../dto/cod-blocklist.dto';
import { CodBlocklistEntryEntity } from '../entities/cod-blocklist-entry.entity';
import {
  COD_BLOCKED_FOR_CUSTOMER_MESSAGE,
  COD_BLOCKED_FOR_PINCODE_MESSAGE,
  COD_BLOCKLIST_DUPLICATE_CUSTOMER,
  COD_BLOCKLIST_DUPLICATE_PINCODE,
  CodBlockMatchedBy,
  CodBlockReasonCode,
} from '../enums/cod-block-reason-code.enum';
import { CodBlocklistType } from '../enums/cod-blocklist-type.enum';
import {
  CodBlockEvaluation,
  EvaluateCodBlockParams,
  ICodBlocklistCustomerSearchItem,
  ICodBlocklistListItem,
} from '../interfaces/cod-blocklist.interface';
import { mapCodBlocklistToListItem, mapCustomerSearchItem } from '../mappers/cod-blocklist.mapper';
import { CodBlocklistRepository } from '../repositories/cod-blocklist.repository';
import { isValidIndianPincode, normalizePincode } from '../utils/pincode.util';

@Injectable()
export class CodBlocklistService {
  private readonly logger = new Logger(CodBlocklistService.name);

  constructor(
    private readonly repository: CodBlocklistRepository,
    private readonly usersRepository: UsersRepository,
    private readonly checkoutResolver: CheckoutResolverService,
  ) {}

  async evaluateCodBlock(params: EvaluateCodBlockParams): Promise<CodBlockEvaluation> {
    if (await this.checkoutResolver.isGokwikCheckoutEnabled()) {
      return {
        blocked: false,
        reasonCode: null,
        message: null,
        matchedBy: null,
      };
    }

    const customerId = params.customerId?.trim() || null;
    const pincode = params.pincode ? normalizePincode(params.pincode) : null;
    let mobile = params.mobileNumber ? canonicalizeIndianMobileNumber(params.mobileNumber) : null;

    if (customerId && !mobile) {
      const user = await this.usersRepository.findById(customerId);
      if (user?.mobileNumber) {
        mobile = canonicalizeIndianMobileNumber(user.mobileNumber);
      }
    }

    const customerMatch = await this.repository.findActiveCustomer({
      customerId,
      mobileNumber: mobile,
    });
    if (customerMatch) {
      return {
        blocked: true,
        reasonCode: CodBlockReasonCode.COD_BLOCKED_FOR_CUSTOMER,
        message: COD_BLOCKED_FOR_CUSTOMER_MESSAGE,
        matchedBy: CodBlockMatchedBy.CUSTOMER,
        matchedEntryId: customerMatch.id,
      };
    }

    if (pincode && isValidIndianPincode(pincode)) {
      const pincodeMatch = await this.repository.findActivePincode(pincode);
      if (pincodeMatch) {
        return {
          blocked: true,
          reasonCode: CodBlockReasonCode.COD_BLOCKED_FOR_PINCODE,
          message: COD_BLOCKED_FOR_PINCODE_MESSAGE,
          matchedBy: CodBlockMatchedBy.PINCODE,
          matchedEntryId: pincodeMatch.id,
        };
      }
    }

    return {
      blocked: false,
      reasonCode: null,
      message: null,
      matchedBy: null,
    };
  }

  async overlayNativeCodEligibility(
    eligibility: CodEligibility,
    params: EvaluateCodBlockParams,
  ): Promise<CodEligibility> {
    if (!eligibility.available) {
      return { ...eligibility, reasonCode: eligibility.reasonCode ?? null };
    }
    const evaluation = await this.evaluateCodBlock(params);
    if (!evaluation.blocked) {
      return { ...eligibility, reasonCode: null };
    }
    return {
      ...eligibility,
      available: false,
      message: evaluation.message ?? eligibility.message,
      reasonCode: evaluation.reasonCode,
    };
  }

  async assertNativeCodAllowed(params: EvaluateCodBlockParams): Promise<void> {
    const evaluation = await this.evaluateCodBlock(params);
    if (evaluation.blocked) {
      this.logger.log(
        {
          matchedBy: evaluation.matchedBy,
          reasonCode: evaluation.reasonCode,
          customerId: params.customerId ?? null,
          pincode: params.pincode ?? null,
          mobile: maskMobile(params.mobileNumber),
        },
        'Native COD blocked by COD blocklist',
      );
      throw new BadRequestException({
        code: evaluation.reasonCode,
        message: evaluation.message,
      });
    }
  }

  async create(
    dto: CreateCodBlocklistEntryDto,
    actorEmail: string,
  ): Promise<ICodBlocklistListItem> {
    const payload = await this.normalizeWritePayload(dto);
    await this.assertNoActiveDuplicate(payload);
    const refId = await generateUniqueRefId('cod-blocklist', (candidate) =>
      this.repository.existsByRefId(candidate),
    );
    const created = await this.repository.create({
      ...payload,
      refId,
      createdBy: actorEmail,
      updatedBy: actorEmail,
    });
    const entity = (await this.repository.findById(created.id)) ?? created;
    this.logger.log(
      { refId: entity.refId, type: entity.type, isActive: entity.isActive },
      'COD blocklist entry created',
    );
    return mapCodBlocklistToListItem(entity);
  }

  async list(query: CodBlocklistListQueryDto): Promise<PaginatedResult<ICodBlocklistListItem>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.repository.findAllPaginated({
      ...pagination,
      type: query.type,
      isActive: query.isActive,
    });
    return buildPaginatedResult(data.map(mapCodBlocklistToListItem), total, pagination);
  }

  async findOne(idOrRefId: string): Promise<ICodBlocklistListItem> {
    return mapCodBlocklistToListItem(await this.requireEntry(idOrRefId));
  }

  async update(
    idOrRefId: string,
    dto: UpdateCodBlocklistEntryDto,
    actorEmail: string,
  ): Promise<ICodBlocklistListItem> {
    const existing = await this.requireEntry(idOrRefId);
    if (dto.type && dto.type !== existing.type) {
      throw new BadRequestException({
        code: COD_BLOCKLIST_TYPE_IMMUTABLE,
        message: 'Blocklist entry type cannot be changed after creation',
      });
    }
    const merged: CreateCodBlocklistEntryDto = {
      type: existing.type,
      pincode: dto.pincode ?? existing.pincode ?? undefined,
      customerId: dto.customerId ?? existing.customerId ?? undefined,
      mobileNumber: dto.mobileNumber ?? existing.mobileNumber ?? undefined,
      reason: dto.reason !== undefined ? dto.reason : existing.reason ?? undefined,
      isActive: dto.isActive ?? existing.isActive,
    };
    const payload = await this.normalizeWritePayload(merged);
    await this.assertNoActiveDuplicate(payload, existing.id);
    await this.repository.updateById(existing.id, {
      ...payload,
      updatedBy: actorEmail,
    });
    return this.findOne(existing.id);
  }

  async remove(idOrRefId: string): Promise<void> {
    const existing = await this.requireEntry(idOrRefId);
    await this.repository.softDeleteById(existing.id);
    this.logger.log({ refId: existing.refId }, 'COD blocklist entry deleted');
  }

  async searchCustomers(
    query: SearchCodBlocklistCustomersDto,
  ): Promise<PaginatedResult<ICodBlocklistCustomerSearchItem>> {
    const search = query.search?.trim() ?? '';
    if (search.length < COD_BLOCKLIST_CUSTOMER_SEARCH_MIN_LENGTH) {
      throw new BadRequestException({
        code: COD_BLOCKLIST_SEARCH_TOO_SHORT,
        message: `search must be at least ${COD_BLOCKLIST_CUSTOMER_SEARCH_MIN_LENGTH} characters`,
      });
    }
    const pagination = buildPaginationOptions(query);
    const { data, total, blockedByUserId } = await this.repository.searchCustomers({
      search,
      page: pagination.page,
      limit: pagination.limit,
    });
    return buildPaginatedResult(
      data.map((user) =>
        mapCustomerSearchItem(
          user,
          blockedByUserId.get(user.id) ? { id: blockedByUserId.get(user.id)! } : null,
        ),
      ),
      total,
      pagination,
    );
  }

  private async requireEntry(idOrRefId: string): Promise<CodBlocklistEntryEntity> {
    const entity = await this.repository.findByIdOrRefId(idOrRefId);
    if (!entity) {
      throw new NotFoundException({
        code: COD_BLOCKLIST_NOT_FOUND,
        message: 'COD blocklist entry not found',
      });
    }
    return entity;
  }

  private async normalizeWritePayload(
    dto: CreateCodBlocklistEntryDto,
  ): Promise<Partial<CodBlocklistEntryEntity>> {
    const isActive = dto.isActive ?? true;
    const reason = dto.reason?.trim() || null;

    if (dto.type === CodBlocklistType.PINCODE) {
      const pincode = dto.pincode ? normalizePincode(dto.pincode) : '';
      if (!isValidIndianPincode(pincode)) {
        throw new BadRequestException({
          code: COD_BLOCKLIST_INVALID_PINCODE,
          message: 'pincode must be a valid 6-digit Indian pincode',
        });
      }
      return {
        type: CodBlocklistType.PINCODE,
        pincode,
        customerId: null,
        mobileNumber: null,
        customerNameSnapshot: null,
        reason,
        isActive,
      };
    }

    let customerId: string | null = dto.customerId?.trim() || null;
    let mobileNumber: string | null = null;
    let customerNameSnapshot: string | null = null;

    if (customerId) {
      const customer = await this.usersRepository.findById(customerId);
      if (!customer || customer.role !== UserRole.CUSTOMER) {
        throw new BadRequestException({
          code: COD_BLOCKLIST_INVALID_CUSTOMER,
          message: 'Customer not found',
        });
      }
      customerId = customer.id;
      if (customer.mobileNumber) {
        mobileNumber = parseCanonicalIndianMobileNumber(customer.mobileNumber);
      }
      customerNameSnapshot =
        `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || null;
    } else if (dto.mobileNumber) {
      try {
        mobileNumber = parseCanonicalIndianMobileNumber(dto.mobileNumber);
      } catch {
        throw new BadRequestException({
          code: COD_BLOCKLIST_INVALID_MOBILE,
          message: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
        });
      }
      const existingUser = await this.usersRepository.findByMobileNumber(mobileNumber);
      if (existingUser) {
        customerId = existingUser.id;
        customerNameSnapshot =
          `${existingUser.firstName ?? ''} ${existingUser.lastName ?? ''}`.trim() || null;
      }
    } else {
      throw new BadRequestException({
        code: COD_BLOCKLIST_INVALID_CUSTOMER,
        message: 'customerId or mobileNumber is required for CUSTOMER entries',
      });
    }

    if (!customerId && !mobileNumber) {
      throw new BadRequestException({
        code: COD_BLOCKLIST_INVALID_CUSTOMER,
        message: 'customerId or mobileNumber is required for CUSTOMER entries',
      });
    }

    return {
      type: CodBlocklistType.CUSTOMER,
      pincode: null,
      customerId,
      mobileNumber,
      customerNameSnapshot,
      reason,
      isActive,
    };
  }

  private async assertNoActiveDuplicate(
    payload: Partial<CodBlocklistEntryEntity>,
    excludingId?: string,
  ): Promise<void> {
    if (!payload.isActive) {
      return;
    }
    if (payload.type === CodBlocklistType.PINCODE && payload.pincode) {
      const existing = await this.repository.findActivePincode(payload.pincode, excludingId);
      if (existing) {
        throw new ConflictException({
          code: COD_BLOCKLIST_DUPLICATE_PINCODE,
          message: 'An active COD block already exists for this pincode',
        });
      }
    }
    if (payload.type === CodBlocklistType.CUSTOMER) {
      const existing = await this.repository.findActiveCustomer(
        { customerId: payload.customerId, mobileNumber: payload.mobileNumber },
        excludingId,
      );
      if (existing) {
        throw new ConflictException({
          code: COD_BLOCKLIST_DUPLICATE_CUSTOMER,
          message: 'An active COD block already exists for this customer or mobile number',
        });
      }
    }
  }
}
