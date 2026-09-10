import { MultipartUploadedUrls } from '@modules/uploads/services/multipart-form.service';
import { Injectable } from '@nestjs/common';
import { ReturnEvidenceMediaType } from '../enums/return-evidence.enum';
import { IEvidenceUpload } from './return-requests.service';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];

/**
 * Translates multipart upload results into evidence records.
 *
 * The upload pipeline returns storage paths rather than the original part, so the
 * media type is derived from the stored extension.
 */
@Injectable()
export class ReturnEvidenceService {
  fromUploadedUrls(uploadedUrls: MultipartUploadedUrls): IEvidenceUpload[] {
    return Object.entries(uploadedUrls)
      .filter(([field, path]) => field.startsWith('evidenceFile') && Boolean(path))
      .map(([, path]) => ({
        path: path as string,
        mediaType: this.resolveMediaType(path as string),
        originalFilename: this.resolveFilename(path as string),
      }));
  }

  private resolveMediaType(path: string): ReturnEvidenceMediaType {
    const lower = path.toLowerCase();
    return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension))
      ? ReturnEvidenceMediaType.VIDEO
      : ReturnEvidenceMediaType.IMAGE;
  }

  private resolveFilename(path: string): string | null {
    const segments = path.split('/');
    return segments[segments.length - 1] ?? null;
  }
}
