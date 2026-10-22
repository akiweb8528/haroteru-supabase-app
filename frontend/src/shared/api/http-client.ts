// This file has been replaced by direct Supabase client calls.
// Kept as a stub for import compatibility during migration.
// TODO: Remove this file after verifying all imports are updated.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly upgradeUrl?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
