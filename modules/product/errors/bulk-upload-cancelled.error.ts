export class BulkUploadCancelledError extends Error {
  constructor(public readonly uploadRefId: string) {
    super(`Bulk upload ${uploadRefId} was cancelled`);
    this.name = 'BulkUploadCancelledError';
  }
}
