import { Readable } from 'stream';
import { IsOptional } from 'class-validator';
import { FastifyRequest } from 'fastify';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '../enums/upload-folder.enum';
import { MultipartFormService } from './multipart-form.service';

class TestDto {
  @IsOptional()
  value?: string;
}

describe('MultipartFormService', () => {
  it('applies a route file-size override to multipart parsing and storage', async () => {
    const filePart = {
      type: 'file' as const,
      fieldname: 'evidenceFile0',
      filename: 'photo.jpg',
      mimetype: 'image/jpeg',
      file: Readable.from(Buffer.from('image data')),
    };
    const request = {
      headers: { 'content-type': 'multipart/form-data' },
      parts: jest.fn(async function* () {
        yield filePart;
      }),
    } as unknown as FastifyRequest;
    const storageService = {
      uploadImage: jest.fn().mockResolvedValue({ path: 'return-evidence/photo.jpg' }),
    } as unknown as StorageService;
    const service = new MultipartFormService(storageService);
    const maxFileSizeOverride = Number.MAX_SAFE_INTEGER;

    await service.parseAndValidate(request, TestDto, {}, {
      indexedFileFields: [{ prefix: 'evidenceFile', folder: UploadFolder.RETURN_EVIDENCE }],
      maxFileSizeOverride,
    });

    expect(request.parts).toHaveBeenCalledWith({ limits: { fileSize: maxFileSizeOverride } });
    expect(storageService.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: UploadFolder.RETURN_EVIDENCE,
        maxSizeOverride: maxFileSizeOverride,
      }),
    );
  });
});