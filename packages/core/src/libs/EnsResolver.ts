import { JsonRpcProvider } from "ethers";

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  name: string | null;
  expiresAt: number;
}

export class EnsResolver {
  private provider: JsonRpcProvider;
  private cache: Map<string, CacheEntry> = new Map();
  private inflight: Map<string, Promise<string | null>> = new Map();
  private ttlMs: number;

  constructor(rpcUrl: string, ttlMs: number = DEFAULT_CACHE_TTL_MS) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.ttlMs = ttlMs;
  }

  async resolve(address: string): Promise<string | null> {
    const key = address.toLowerCase();

    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.name;
    }

    // Dedup inflight requests
    if (this.inflight.has(key)) {
      return this.inflight.get(key)!;
    }

    const promise = this.fetchFromRpc(address, key);
    this.inflight.set(key, promise);
    promise.finally(() => this.inflight.delete(key));
    return promise;
  }

  async resolveMany(addresses: string[]): Promise<Record<string, string | null>> {
    const unique = [...new Set(addresses.filter(Boolean))];
    const results = await Promise.allSettled(
      unique.map(async (addr) => ({ addr, name: await this.resolve(addr) }))
    );

    const out: Record<string, string | null> = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        out[r.value.addr] = r.value.name;
      }
    }
    return out;
  }

  private async fetchFromRpc(address: string, key: string): Promise<string | null> {
    try {
      const name = await this.provider.lookupAddress(address);
      this.cache.set(key, { name, expiresAt: Date.now() + this.ttlMs });
      return name;
    } catch {
      // Cache the failure so we don't hammer the RPC
      this.cache.set(key, { name: null, expiresAt: Date.now() + this.ttlMs });
      return null;
    }
  }
}
