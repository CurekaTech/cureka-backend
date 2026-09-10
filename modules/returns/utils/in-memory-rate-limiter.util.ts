export class InMemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const previous = this.hits.get(key) ?? [];
    const recent = previous.filter((stamp) => stamp > windowStart);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
