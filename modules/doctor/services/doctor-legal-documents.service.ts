import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import {
  AcceptLegalDocumentsDto,
} from '../dto/doctor-auth.dto';
import {
  CreateLegalDocumentDraftDto,
  CreateLegalDocumentVersionDto,
} from '../dto/doctor-legal-admin.dto';
import { DoctorLegalDocumentAcceptanceEntity } from '../entities/doctor-legal-document-acceptance.entity';
import { DoctorLegalDocumentVersionEntity } from '../entities/doctor-legal-document-version.entity';
import { DoctorLegalDocumentEntity } from '../entities/doctor-legal-document.entity';
import { DoctorLegalDocumentVersionStatus } from '../enums/doctor-legal-document-version-status.enum';
import { DoctorLegalDocumentType } from '../enums/doctor-legal-document-type.enum';

export type PendingLegalDocument = {
  documentId: string;
  type: DoctorLegalDocumentType;
  title: string;
  versionId: string;
  versionNumber: number;
  contentHtml: string;
};

@Injectable()
export class DoctorLegalDocumentsService {
  constructor(
    @InjectRepository(DoctorLegalDocumentEntity)
    private readonly documentsRepo: Repository<DoctorLegalDocumentEntity>,
    @InjectRepository(DoctorLegalDocumentVersionEntity)
    private readonly versionsRepo: Repository<DoctorLegalDocumentVersionEntity>,
    @InjectRepository(DoctorLegalDocumentAcceptanceEntity)
    private readonly acceptancesRepo: Repository<DoctorLegalDocumentAcceptanceEntity>,
  ) {}

  async listDocuments(): Promise<DoctorLegalDocumentEntity[]> {
    return this.documentsRepo.find({
      relations: { currentPublishedVersion: true, versions: true },
      order: { type: 'ASC' },
    });
  }

  async createDocumentDraft(
    dto: CreateLegalDocumentDraftDto,
    admin: { id: string; email: string },
  ): Promise<DoctorLegalDocumentEntity> {
    const existing = await this.documentsRepo.findOne({ where: { type: dto.type } });
    if (existing) {
      throw new ConflictException('Legal document type already exists — add a new version instead');
    }

    const refId = await generateUniqueRefId('dld', (candidate) =>
      this.documentsRepo.exists({ where: { refId: candidate } }),
    );

    const document = await this.documentsRepo.save(
      this.documentsRepo.create({
        refId,
        type: dto.type,
        title: dto.title.trim(),
        createdBy: admin.email,
        updatedBy: admin.email,
      }),
    );

    await this.versionsRepo.save(
      this.versionsRepo.create({
        refId: await generateUniqueRefId('dlv', (candidate) =>
          this.versionsRepo.exists({ where: { refId: candidate } }),
        ),
        documentId: document.id,
        versionNumber: 1,
        contentHtml: dto.contentHtml,
        status: DoctorLegalDocumentVersionStatus.DRAFT,
        createdBy: admin.email,
        updatedBy: admin.email,
      }),
    );

    return this.documentsRepo.findOneOrFail({
      where: { id: document.id },
      relations: { versions: true },
    });
  }

  async createDraftVersion(
    documentRefId: string,
    dto: CreateLegalDocumentVersionDto,
    admin: { id: string; email: string },
  ): Promise<DoctorLegalDocumentVersionEntity> {
    const document = await this.documentsRepo.findOne({ where: { refId: documentRefId } });
    if (!document) throw new NotFoundException('Legal document not found');

    const latest = await this.versionsRepo.findOne({
      where: { documentId: document.id },
      order: { versionNumber: 'DESC' },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    return this.versionsRepo.save(
      this.versionsRepo.create({
        refId: await generateUniqueRefId('dlv', (candidate) =>
          this.versionsRepo.exists({ where: { refId: candidate } }),
        ),
        documentId: document.id,
        versionNumber,
        contentHtml: dto.contentHtml,
        status: DoctorLegalDocumentVersionStatus.DRAFT,
        createdBy: admin.email,
        updatedBy: admin.email,
      }),
    );
  }

  async publishVersion(
    versionId: string,
    admin: { id: string; email: string },
  ): Promise<DoctorLegalDocumentVersionEntity> {
    const version = await this.versionsRepo.findOne({
      where: { id: versionId },
      relations: { document: true },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== DoctorLegalDocumentVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft versions can be published');
    }

    await this.versionsRepo.update(
      {
        documentId: version.documentId,
        status: DoctorLegalDocumentVersionStatus.PUBLISHED,
      },
      { status: DoctorLegalDocumentVersionStatus.SUPERSEDED },
    );

    version.status = DoctorLegalDocumentVersionStatus.PUBLISHED;
    version.publishedAt = new Date();
    version.publishedByAdminId = admin.id;
    version.publishedByEmail = admin.email;
    version.updatedBy = admin.email;
    await this.versionsRepo.save(version);

    await this.documentsRepo.update(
      { id: version.documentId },
      {
        currentPublishedVersionId: version.id,
        updatedBy: admin.email,
      },
    );

    return version;
  }

  async getActiveDocumentsForDoctor(): Promise<PendingLegalDocument[]> {
    const docs = await this.documentsRepo.find({
      where: {},
      relations: { currentPublishedVersion: true },
    });

    return docs
      .filter((d) => d.currentPublishedVersion)
      .map((d) => ({
        documentId: d.id,
        type: d.type,
        title: d.title,
        versionId: d.currentPublishedVersionId!,
        versionNumber: d.currentPublishedVersion!.versionNumber,
        contentHtml: d.currentPublishedVersion!.contentHtml,
      }));
  }

  async pendingLegalAcceptances(doctorId: string): Promise<PendingLegalDocument[]> {
    const active = await this.getActiveDocumentsForDoctor();
    if (active.length === 0) return [];

    const acceptedVersionIds = new Set(
      (
        await this.acceptancesRepo.find({
          where: { doctorId },
          select: { versionId: true },
        })
      ).map((row) => row.versionId),
    );

    return active.filter((doc) => !acceptedVersionIds.has(doc.versionId));
  }

  async acceptDocuments(
    doctorId: string,
    dto: AcceptLegalDocumentsDto,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    for (const item of dto.acceptances) {
      const version = await this.versionsRepo.findOne({
        where: { id: item.versionId },
        relations: { document: true },
      });
      if (!version || version.status !== DoctorLegalDocumentVersionStatus.PUBLISHED) {
        throw new BadRequestException(`Invalid or unpublished version: ${item.versionId}`);
      }
      if (version.document.currentPublishedVersionId !== version.id) {
        throw new BadRequestException('Version is not the current published version');
      }

      const exists = await this.acceptancesRepo.exists({
        where: { doctorId, versionId: version.id },
      });
      if (exists) continue;

      await this.acceptancesRepo.save(
        this.acceptancesRepo.create({
          refId: await generateUniqueRefId('dla', (candidate) =>
            this.acceptancesRepo.exists({ where: { refId: candidate } }),
          ),
          doctorId,
          documentId: version.documentId,
          versionId: version.id,
          documentType: version.document.type,
          acceptedAt: new Date(),
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        }),
      );
    }
  }
}
