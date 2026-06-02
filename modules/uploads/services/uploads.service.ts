import { BadRequestException, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '../enums/upload-folder.enum';
import { IUploadedFileResponse } from '../interfaces/upload.interface';

@Injectable()
export class UploadsService {
  constructor(private readonly storageService: StorageService) {}

  async uploadFromRequest(
    folder: UploadFolder,
    req: FastifyRequest,
  ): Promise<IUploadedFileResponse> {
    const file = await req.file();

    if (!file) {
      throw new BadRequestException('No file uploaded. Send multipart/form-data with a "file" field.');
    }

    const result = await this.storageService.uploadImage({
      stream: file.file,
      mimetype: file.mimetype,
      originalFilename: file.filename,
      folder,
    });

    return {
      ...result,
      folder,
    };
  }
}
