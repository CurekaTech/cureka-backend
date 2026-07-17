import {
  DEFAULT_MAX_BULK_FILE_SIZE,
  DEFAULT_MAX_IMAGE_FILE_SIZE,
  DEFAULT_MAX_VIDEO_FILE_SIZE,
  resolveMaxFileSizeForMime,
} from './upload-size.util';

describe('resolveMaxFileSizeForMime', () => {
  it('uses the dedicated bulk sheet limit for XLSX and CSV', () => {
    const limits = {
      maxImageFileSize: 5,
      maxVideoFileSize: 20,
      maxBulkFileSize: 40,
    };

    expect(
      resolveMaxFileSizeForMime(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        limits,
      ),
    ).toBe(40);
    expect(resolveMaxFileSizeForMime('text/csv', limits)).toBe(40);
  });

  it('keeps image and video defaults independent from bulk sheets', () => {
    expect(resolveMaxFileSizeForMime('image/jpeg')).toBe(
      DEFAULT_MAX_IMAGE_FILE_SIZE,
    );
    expect(resolveMaxFileSizeForMime('video/mp4')).toBe(
      DEFAULT_MAX_VIDEO_FILE_SIZE,
    );
    expect(resolveMaxFileSizeForMime('text/csv')).toBe(
      DEFAULT_MAX_BULK_FILE_SIZE,
    );
  });
});
