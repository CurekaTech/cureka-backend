import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FastifyRequest } from 'fastify';
import { DataSource, EntityManager } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  formatValidationErrorMessage,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { IStorageFileReference } from '@packages/storage';
import { parseIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { RolesRepository } from '@modules/roles/repositories/roles.repository';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { BulkUploadService } from '@modules/product/services/bulk-upload.service';
import { UserEntity } from '@modules/users/entities/user.entity';import { UserRole } from '@modules/users/enums/user-role.enum';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import {
  RegisterVendorDto,
  UpdateVendorDto,
  VendorCategoryHierarchyDto,
  VendorListQueryDto,
  VendorWarehouseDto,
} from '../dto/register-vendor.dto';
import { VendorEntity } from '../entities/vendor.entity';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorStatus } from '../enums/vendor-status.enum';
import {
  IResolvedVendorCategoryHierarchy,
  IVendor,
} from '../interfaces/vendor.interface';
import { mapVendorEntitiesToResponse, mapVendorEntityToResponse } from '../mappers/vendor.mapper';
import { VendorRelationsRepository } from '../repositories/vendor-relations.repository';
import { VendorsRepository } from '../repositories/vendors.repository';

const VENDOR_MEDIA_FIELDS = [
  'panDocument',
  'gstCertificateDocument',
  'productExcelSheet',
] as const;

const VENDOR_UPLOAD_FIELDS = {
  panDocument: UploadFolder.VENDOR_DOCUMENTS,
  gstCertificateDocument: UploadFolder.VENDOR_DOCUMENTS,
  productExcelSheet: UploadFolder.VENDOR_DOCUMENTS,
} as const;

const splitContactPerson = (contactPerson: string): { firstName: string; lastName?: string } => {
  const parts = contactPerson.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: contactPerson.trim() || 'Vendor' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0]! };
  }
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(' '),
  };
};

type VendorUploadPaths = {
  panDocumentPath?: string;
  gstCertificateDocumentPath?: string;
  productExcelSheetPath?: string;
};

@Injectable()
export class VendorsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly vendorsRepository: VendorsRepository,
    private readonly vendorRelationsRepository: VendorRelationsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly multipartFormService: MultipartFormService,
    private readonly bulkUploadService: BulkUploadService,
  ) {}

  /** Same XLSX template as product bulk upload — for vendor onboarding sample download. */
  async getProductSampleSheet(): Promise<{ fileName: string; fileBuffer: Buffer }> {
    const { fileBuffer } = await this.bulkUploadService.getTemplateFile();
    return {
      fileName: 'cureka-vendor-product-sample.xlsx',
      fileBuffer,
    };
  }

  async registerFromRequest(
    req: FastifyRequest,
    source: VendorSource,
    createdBy?: string,
  ): Promise<IVendor> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      RegisterVendorDto,
      VENDOR_UPLOAD_FIELDS,
    );

    return this.register(dto, source, createdBy, {
      panDocumentPath: uploadedUrls['panDocument'],
      gstCertificateDocumentPath: uploadedUrls['gstCertificateDocument'],
      productExcelSheetPath: uploadedUrls['productExcelSheet'],
    });
  }

  async registerFromJson(
    body: unknown,
    source: VendorSource,
    createdBy?: string,
  ): Promise<IVendor> {
    const dto = await this.validateJsonDto(RegisterVendorDto, body);
    return this.register(dto, source, createdBy);
  }

  async register(
    dto: RegisterVendorDto,
    source: VendorSource,
    createdBy?: string,
    uploads?: VendorUploadPaths,
  ): Promise<IVendor> {
    const mobileNumber = parseIndianMobileNumber(dto.mobileNumber);
    const email = dto.email.trim().toLowerCase();
    const panNumber = dto.panNumber.trim().toUpperCase();
    const gstNumber = dto.gstNumber.trim().toUpperCase();

    if (await this.usersRepository.existsByMobileNumber(mobileNumber)) {
      throw new ConflictException('A user with this mobile number already exists');
    }
    if (await this.usersRepository.existsByEmail(email)) {
      throw new ConflictException('A user with this email already exists');
    }

    const panDocument = this.requireDocument(
      uploads?.panDocumentPath,
      dto.panDocument,
      'PAN document',
    );
    const gstCertificateDocument = this.requireDocument(
      uploads?.gstCertificateDocumentPath,
      dto.gstCertificateDocument,
      'GST certificate document',
    );
    const productExcelSheet = this.requireDocument(
      uploads?.productExcelSheetPath,
      dto.productExcelSheet,
      'Product excel sheet',
    );

    const hierarchies = await this.resolveCategoryHierarchies(dto.categories);
    const brands = await this.resolveBrandRefIds(dto.brandRefIds);
    const warehouses = dto.warehouses;

    const roleRecord = await this.rolesRepository.findBySlug(UserRole.VENDOR);
    const { firstName, lastName } = splitContactPerson(dto.contactPerson);
    const actor = createdBy ?? email;

    const vendorId = await this.dataSource.transaction(async (manager) => {
      const userRefId = await generateUniqueRefId('vendor', (id) =>
        this.existsUserRefId(id, manager),
      );
      const vendorRefId = await generateUniqueRefId('vnd', (id) =>
        this.vendorsRepository.existsByRefId(id, manager),
      );

      const userRepo = manager.getRepository(UserEntity);
      const user = await userRepo.save(
        userRepo.create({
          refId: userRefId,
          firstName,
          lastName,
          mobileNumber,
          email,
          role: UserRole.VENDOR,
          roleId: roleRecord?.id,
          isGuest: false,
          isRegistered: true,
          status: UserStatus.ACTIVE,
          createdBy: actor,
          updatedBy: actor,
        }),
      );

      const vendor = await this.vendorsRepository.create(
        {
          refId: vendorRefId,
          userId: user.id,
          companyName: dto.companyName.trim(),
          contactPerson: dto.contactPerson.trim(),
          email,
          mobileNumber,
          businessAddress: dto.businessAddress.trim(),
          panNumber,
          panDocument,
          gstNumber,
          gstCertificateDocument,
          productExcelSheet,
          companyProfile: dto.companyProfile?.trim() || null,
          status: VendorStatus.PENDING,
          source,
          createdBy: actor,
          updatedBy: actor,
        },
        manager,
      );

      await this.vendorRelationsRepository.syncCategoryHierarchies(
        manager,
        vendor.id,
        hierarchies,
      );
      await this.vendorRelationsRepository.syncBrands(manager, vendor.id, brands);
      await this.vendorRelationsRepository.syncWarehouses(
        manager,
        vendor.id,
        warehouses,
        actor,
        dto.contactPerson.trim(),
        mobileNumber,
      );

      return vendor.id;
    });

    const loaded = await this.vendorsRepository.findDetailedById(vendorId);
    if (!loaded) {
      throw new NotFoundException('Vendor not found after create');
    }
    return this.enrichVendor(mapVendorEntityToResponse(loaded));
  }

  async findAll(query: VendorListQueryDto): Promise<PaginatedResult<IVendor>> {
    const paginationOptions = buildPaginationOptions({
      page: query.page,
      limit: query.limit,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const { data, total } = await this.vendorsRepository.findAllPaginated({
      ...paginationOptions,
      status: query.status,
    });

    const result = buildPaginatedResult(mapVendorEntitiesToResponse(data), total, paginationOptions);
    return this.storageUrlEnricher.enrichPaginated(result, [...VENDOR_MEDIA_FIELDS]);
  }

  async findOne(refId: string): Promise<IVendor> {
    const entity = await this.vendorsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Vendor with refId ${refId} not found`);
    }
    return this.enrichVendor(mapVendorEntityToResponse(entity));
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IVendor> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateVendorDto,
      VENDOR_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, {
      panDocumentPath: uploadedUrls['panDocument'],
      gstCertificateDocumentPath: uploadedUrls['gstCertificateDocument'],
      productExcelSheetPath: uploadedUrls['productExcelSheet'],
    });
  }

  async updateFromJson(
    refId: string,
    body: unknown,
    updatedBy: string,
  ): Promise<IVendor> {
    const dto = await this.validateJsonDto(UpdateVendorDto, body);
    return this.update(refId, dto, updatedBy);
  }

  async update(
    refId: string,
    dto: UpdateVendorDto,
    updatedBy: string,
    uploads?: VendorUploadPaths,
  ): Promise<IVendor> {
    const existing = await this.vendorsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Vendor with refId ${refId} not found`);
    }

    const nextEmail =
      dto.email !== undefined ? dto.email.trim().toLowerCase() : existing.email;
    const nextMobile =
      dto.mobileNumber !== undefined
        ? parseIndianMobileNumber(dto.mobileNumber)
        : existing.mobileNumber;
    const nextContactPerson =
      dto.contactPerson !== undefined ? dto.contactPerson.trim() : existing.contactPerson;

    if (nextEmail !== existing.email) {
      const emailTaken = await this.usersRepository.isEmailTakenByOther(nextEmail, existing.userId);
      if (emailTaken) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    if (nextMobile !== existing.mobileNumber) {
      const mobileTaken = await this.usersRepository.isMobileTakenByOther(
        nextMobile,
        existing.userId,
      );
      if (mobileTaken) {
        throw new ConflictException('A user with this mobile number already exists');
      }
    }

    const hierarchies =
      dto.categories !== undefined
        ? await this.resolveCategoryHierarchies(dto.categories)
        : null;
    const brands =
      dto.brandRefIds !== undefined ? await this.resolveBrandRefIds(dto.brandRefIds) : null;
    const warehouses = dto.warehouses !== undefined ? dto.warehouses : null;

    const panDocument = this.resolveOptionalDocument(
      uploads?.panDocumentPath,
      dto.panDocument,
      existing.panDocument,
    );
    const gstCertificateDocument = this.resolveOptionalDocument(
      uploads?.gstCertificateDocumentPath,
      dto.gstCertificateDocument,
      existing.gstCertificateDocument,
    );
    const productExcelSheet = this.resolveOptionalDocument(
      uploads?.productExcelSheetPath,
      dto.productExcelSheet,
      existing.productExcelSheet,
    );

    const { firstName, lastName } = splitContactPerson(nextContactPerson);

    await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      await userRepo.update(existing.userId, {
        firstName,
        lastName,
        email: nextEmail,
        mobileNumber: nextMobile,
        updatedBy,
      });

      const payload: Partial<VendorEntity> = {
        updatedBy,
        companyName:
          dto.companyName !== undefined ? dto.companyName.trim() : existing.companyName,
        contactPerson: nextContactPerson,
        email: nextEmail,
        mobileNumber: nextMobile,
        businessAddress:
          dto.businessAddress !== undefined
            ? dto.businessAddress.trim()
            : existing.businessAddress,
        panNumber:
          dto.panNumber !== undefined
            ? dto.panNumber.trim().toUpperCase()
            : existing.panNumber,
        gstNumber:
          dto.gstNumber !== undefined
            ? dto.gstNumber.trim().toUpperCase()
            : existing.gstNumber,
        panDocument,
        gstCertificateDocument,
        productExcelSheet,
        companyProfile:
          dto.companyProfile !== undefined
            ? dto.companyProfile.trim() || null
            : existing.companyProfile,
      };

      if (dto.status !== undefined) {
        payload.status = dto.status;
      }

      const updated = await this.vendorsRepository.updateByRefId(refId, payload, manager);
      if (!updated) {
        throw new NotFoundException(`Vendor with refId ${refId} not found after update`);
      }

      if (hierarchies) {
        await this.vendorRelationsRepository.syncCategoryHierarchies(
          manager,
          existing.id,
          hierarchies,
        );
      }
      if (brands) {
        await this.vendorRelationsRepository.syncBrands(manager, existing.id, brands);
      }
      if (warehouses) {
        await this.vendorRelationsRepository.syncWarehouses(
          manager,
          existing.id,
          warehouses,
          updatedBy,
          nextContactPerson,
          nextMobile,
        );
      }
    });

    const loaded = await this.vendorsRepository.findByRefId(refId);
    if (!loaded) {
      throw new NotFoundException(`Vendor with refId ${refId} not found`);
    }
    return this.enrichVendor(mapVendorEntityToResponse(loaded));
  }

  private async resolveCategoryHierarchies(
    inputs: VendorCategoryHierarchyDto[],
  ): Promise<IResolvedVendorCategoryHierarchy[]> {
    if (!inputs?.length) {
      throw new BadRequestException('At least one category hierarchy is required');
    }

    const allRefIds = [
      ...new Set(
        inputs.flatMap((item) =>
          [
            item.categoryRefId,
            item.subCategoryRefId,
            item.subSubCategoryRefId,
            item.subSubSubCategoryRefId,
          ].filter((refId): refId is string => Boolean(refId?.trim())),
        ),
      ),
    ];

    const categories = await this.categoriesRepository.findByRefIds(allRefIds);
    const byRefId = new Map(categories.map((category) => [category.refId, category]));

    return inputs.map((item, index) => {
      const category = byRefId.get(item.categoryRefId);
      if (!category) {
        throw new NotFoundException(`Category with refId "${item.categoryRefId}" not found`);
      }

      const resolveOptional = (refId: string | null | undefined, label: string) => {
        if (!refId?.trim()) return null;
        const entity = byRefId.get(refId);
        if (!entity) {
          throw new NotFoundException(`${label} with refId "${refId}" not found`);
        }
        return entity;
      };

      const subCategory = resolveOptional(item.subCategoryRefId, 'Sub category');
      const subSubCategory = resolveOptional(item.subSubCategoryRefId, 'Sub sub category');
      const subSubSubCategory = resolveOptional(
        item.subSubSubCategoryRefId,
        'Sub sub sub category',
      );

      return {
        categoryId: category.id,
        subCategoryId: subCategory?.id ?? null,
        subSubCategoryId: subSubCategory?.id ?? null,
        subSubSubCategoryId: subSubSubCategory?.id ?? null,
        sortOrder: index,
      };
    });
  }

  private async resolveBrandRefIds(refIds: string[]): Promise<BrandEntity[]> {
    if (!refIds?.length) {
      throw new BadRequestException('At least one brand is required');
    }

    const unique = [...new Set(refIds.map((id) => id.trim()).filter(Boolean))];
    const brands = await this.brandsRepository.findByRefIds(unique);
    const byRefId = new Map(brands.map((brand) => [brand.refId, brand]));

    const resolved: BrandEntity[] = [];
    for (const refId of unique) {
      const brand = byRefId.get(refId);
      if (!brand) {
        throw new NotFoundException(`Brand with refId "${refId}" not found`);
      }
      if (brand.status !== MasterStatus.ACTIVE) {
        throw new BadRequestException(`Brand "${refId}" is not active`);
      }
      resolved.push(brand);
    }
    return resolved;
  }

  private requireDocument(
    uploadedPath: string | undefined,
    jsonRef: { key: string; name: string } | undefined,
    label: string,
  ): IStorageFileReference {
    const persisted = this.storageUrlEnricher.persist(uploadedPath ?? jsonRef ?? null);
    if (!persisted) {
      throw new BadRequestException(`${label} is required (upload file field or storage reference)`);
    }
    return persisted;
  }

  private resolveOptionalDocument(
    uploadedPath: string | undefined,
    jsonRef: { key: string; name: string } | undefined,
    existing: IStorageFileReference,
  ): IStorageFileReference {
    if (uploadedPath || jsonRef) {
      const persisted = this.storageUrlEnricher.persist(uploadedPath ?? jsonRef ?? null);
      if (!persisted) {
        throw new BadRequestException('Invalid document storage reference');
      }
      return persisted;
    }
    return existing;
  }

  private async validateJsonDto<T extends object>(
    dtoClass: new () => T,
    body: unknown,
  ): Promise<T> {
    const dto = plainToInstance(dtoClass, body ?? {}, {
      enableImplicitConversion: false,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      throw new BadRequestException(formatValidationErrorMessage(errors));
    }
    return dto;
  }

  private async existsUserRefId(refId: string, manager: EntityManager): Promise<boolean> {
    return manager.getRepository(UserEntity).exists({ where: { refId } });
  }

  private enrichVendor(vendor: IVendor): Promise<IVendor> {
    return this.storageUrlEnricher.enrichFields(vendor, [...VENDOR_MEDIA_FIELDS]);
  }
}
