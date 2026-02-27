export function formatWei(wei: string): string {
  try {
    const eth = (Number(wei) / 1e18).toFixed(6);
    return eth.replace(/\.?0+$/, "");
  } catch {
    return wei + " wei";
  }
}

export function formatStake(wei: string, ethPriceUsd: number | null): string {
  const eth = formatWei(wei);
  if (ethPriceUsd) {
    const usd = (Number(wei) / 1e18) * ethPriceUsd;
    const usdStr = usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
    return `${eth} ETH (${usdStr})`;
  }
  return `${eth} ETH`;
}
