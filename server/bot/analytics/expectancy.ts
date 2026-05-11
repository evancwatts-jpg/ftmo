export interface ExpectancyInput {
  winRate: number;
  avgWinR: number;
  avgLossR: number;
}

export function calculateExpectancy({ winRate, avgWinR, avgLossR }: ExpectancyInput): number {
  const lossRate = 1 - winRate;
  return Number(((winRate * avgWinR) - (lossRate * Math.abs(avgLossR))).toFixed(4));
}
