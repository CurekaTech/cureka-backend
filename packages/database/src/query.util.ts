export interface SkipTake {
  skip: number;
  take: number;
}

export const buildSkipTake = (page: number, limit: number): SkipTake => ({
  skip: (page - 1) * limit,
  take: limit,
});
