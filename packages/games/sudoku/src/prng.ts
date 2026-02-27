/**
 * Deterministic seeded PRNG using xorshift32.
 * Seed is derived by hashing the rngSeed string into a 32-bit integer.
 */
export class SeededRng {
  private state: number;

  constructor(seed: string) {
    this.state = SeededRng.hashString(seed);
    if (this.state === 0) this.state = 1; // xorshift cannot have state 0
  }

  private static hashString(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    return hash === 0 ? 1 : Math.abs(hash);
  }

  /** Return next pseudo-random 32-bit unsigned integer */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  /** Return a float in [0, 1) */
  nextFloat(): number {
    return this.next() / 4294967296;
  }

  /** Return an integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.nextFloat() * max);
  }

  /** Shuffle an array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
