export interface MonteCarloTrade {
  rMultiple: number;
}

export interface MonteCarloResult {
  expectedEquityCurve: number[];
  worstDrawdown: number;
  averageDrawdown: number;
  riskOfRuin: number;
  probabilityOfPassingProfitTarget: number;
  probabilityOfHittingDrawdownLimit: number;
  confidenceIntervals: { p5: number; p50: number; p95: number };
  bestPath: number[];
  worstPath: number[];
  medianPath: number[];
}

export function runMonteCarlo({
  trades,
  simulations = 500,
  accountSize,
  riskPercent,
  profitTargetPercent = 10,
  drawdownLimitPercent = 10
}: {
  trades: MonteCarloTrade[];
  simulations?: number;
  accountSize: number;
  riskPercent: number;
  profitTargetPercent?: number;
  drawdownLimitPercent?: number;
}): MonteCarloResult {
  const distribution = trades.length ? trades.map((trade) => trade.rMultiple) : [0];
  const paths: number[][] = [];
  const drawdowns: number[] = [];
  let ruinCount = 0;
  let passCount = 0;
  let drawdownLimitCount = 0;

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let equity = accountSize;
    let peak = accountSize;
    let worstDrawdown = 0;
    const path = [equity];

    for (let step = 0; step < Math.max(distribution.length, 30); step += 1) {
      const rMultiple = distribution[(simulation + step * 17) % distribution.length];
      equity += equity * (riskPercent / 100) * rMultiple;
      peak = Math.max(peak, equity);
      worstDrawdown = Math.max(worstDrawdown, (peak - equity) / peak);
      path.push(Number(equity.toFixed(2)));
    }

    paths.push(path);
    drawdowns.push(worstDrawdown);
    if (equity <= accountSize * (1 - drawdownLimitPercent / 100)) {
      ruinCount += 1;
    }
    if (equity >= accountSize * (1 + profitTargetPercent / 100)) {
      passCount += 1;
    }
    if (worstDrawdown >= drawdownLimitPercent / 100) {
      drawdownLimitCount += 1;
    }
  }

  const sortedFinals = paths.map((path) => path[path.length - 1]).sort((a, b) => a - b);
  const sortedPaths = paths.slice().sort((a, b) => a[a.length - 1] - b[b.length - 1]);
  const medianIndex = Math.floor(sortedPaths.length / 2);

  return {
    expectedEquityCurve: averagePath(paths),
    worstDrawdown: Number(Math.max(...drawdowns).toFixed(4)),
    averageDrawdown: Number((drawdowns.reduce((sum, value) => sum + value, 0) / drawdowns.length).toFixed(4)),
    riskOfRuin: Number((ruinCount / simulations).toFixed(4)),
    probabilityOfPassingProfitTarget: Number((passCount / simulations).toFixed(4)),
    probabilityOfHittingDrawdownLimit: Number((drawdownLimitCount / simulations).toFixed(4)),
    confidenceIntervals: {
      p5: percentile(sortedFinals, 5),
      p50: percentile(sortedFinals, 50),
      p95: percentile(sortedFinals, 95)
    },
    bestPath: sortedPaths[sortedPaths.length - 1],
    worstPath: sortedPaths[0],
    medianPath: sortedPaths[medianIndex]
  };
}

function averagePath(paths: number[][]): number[] {
  return paths[0].map((_value, index) => {
    const average = paths.reduce((sum, path) => sum + path[index], 0) / paths.length;
    return Number(average.toFixed(2));
  });
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.min(sortedValues.length - 1, Math.floor((percentileValue / 100) * sortedValues.length));
  return Number(sortedValues[index].toFixed(2));
}
