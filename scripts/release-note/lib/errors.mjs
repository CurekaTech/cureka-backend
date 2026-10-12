export class ReleaseNoteError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ReleaseNoteError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
