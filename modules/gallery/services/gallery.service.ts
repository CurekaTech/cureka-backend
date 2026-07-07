import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { StorageService } from '@packages/storage';
import { GalleryRepository } from '../repositories/gallery.repository';
import { generateUniqueRefId } from '@packages/common';

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);

  constructor(
    private readonly repository: GalleryRepository,
    private readonly storageService: StorageService,
  ) {}

  async uploadImages(req: FastifyRequest, createdBy: string) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request must be multipart/form-data.');
    }

    const parts = req.files();
    const uploadedFiles: any[] = [];

    try {
      for await (const part of parts) {
        if (part.file) {
          const filename = part.filename;
          const mime = part.mimetype;

          // Stream upload to storage
          const result = await this.storageService.uploadImage({
            stream: part.file,
            mimetype: mime,
            originalFilename: filename,
            folder: 'gallery',
          });

          // Generate unique Ref ID starting with 'GAL'
          const refId = await generateUniqueRefId('GAL', (candidate) =>
            this.repository.existsByRefId(candidate),
          );

          // Create DB record
          const record = await this.repository.create({
            refId,
            filename,
            url: result.path,
            mimetype: mime,
            size: 0,
            createdBy,
          });

          uploadedFiles.push({
            refId: record.refId,
            filename: record.filename,
            url: record.url,
            createdAt: record.createdAt,
          });
        }
      }

      return {
        message: `Successfully uploaded ${uploadedFiles.length} images to gallery.`,
        files: uploadedFiles,
      };
    } catch (error) {
      this.logger.error('Failed to process multipart upload in Gallery:', error);
      throw error;
    }
  }

  async getHistory(page = 1, limit = 20, search?: string) {
    const [records, total] = await this.repository.findHistory(page, limit, search);
    const data = await Promise.all(
      records.map(async (record) => ({
        refId: record.refId,
        filename: record.filename,
        url: (await this.storageService.resolveAccessibleUrl(record.url)) ?? record.url,
        mimetype: record.mimetype,
        createdAt: record.createdAt,
      })),
    );

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deleteImage(refId: string) {
    const record = await this.repository.findByRefId(refId);
    if (!record) {
      throw new NotFoundException(`Gallery image with ref ID '${refId}' not found.`);
    }

    await this.repository.deleteByRefId(refId);

    return {
      message: `Gallery image '${refId}' deleted successfully.`,
    };
  }

  async getAllGalleryMap(): Promise<Map<string, string>> {
    const records = await this.repository.findAllActive();
    const map = new Map<string, string>();
    for (const record of records) {
      map.set(record.filename.toLowerCase().trim(), record.url);
    }
    return map;
  }
}
