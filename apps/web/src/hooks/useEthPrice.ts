import { useEffect, useState } from "react";

const CACHE_KEY = "ethPriceUsd";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useEthPrice(): number | null {
  const [price, setPrice] = useState<number | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { price, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return price;
      }
    } catch {}
    return null;
  });

  useEffect(() => {
    let cancelled = false;

    const fetchPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await res.json();
        const usd = data?.ethereum?.usd;
        if (typeof usd === "number" && !cancelled) {
          setPrice(usd);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ price: usd, ts: Date.now() }));
        }
      } catch {}
    };

    // Only fetch if cache is stale or missing
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) return;
      }
    } catch {}

    fetchPrice();
    return () => { cancelled = true; };
  }, []);

  return price;
}
