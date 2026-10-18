
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FRAMES = ["15m", "1h", "4h", "1d"] as const;
type Frame = (typeof FRAMES)[number];

const BASES = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
];

type Ticker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

async function getJson(path: string): Promise<any> {
  const errors: string[] = [];

  for (const base of BASES) {
    try {
      const response = await fetch(`${base}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }

      return await response.json();
    } catch (error) {
      errors.push(
        `${base}: ${
          error instanceof Error ? error.message : "Request failed"
        }`
      );
    }
  }

  throw new Error(
    `Binance API could not be reached. ${errors.join(" | ")}`
  );
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];

    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];

    avgGain =
      (avgGain * (period - 1) + Math.max(change, 0)) / period;

    avgLoss =
      (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;

  return 100 - 100 / (1 + avgGain / avgLoss);
}

async function getRSI(
  symbol: string,
  frame: Frame
): Promise<number | null> {
  const path =
    `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${frame}&limit=100`;

  const candles = await getJson(path) as unknown[][];

  const closes = candles
    .map((candle) => Number(candle[4]))
    .filter((value) => Number.isFinite(value));

  return calculateRSI(closes);
}

async function pool<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;

      results[index] = await task(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => worker()
    )
  );

  return results;
}

export async function GET() {
  try {
    const [info, tickerData] = await Promise.all([
      getJson("/fapi/v1/exchangeInfo"),
      getJson("/fapi/v1/ticker/24hr"),
    ]);

    if (!Array.isArray(info.symbols) || !Array.isArray(tickerData)) {
      throw new Error("Binance returned an unexpected response.");
    }

    const validSymbols = new Set<string>(
      info.symbols
        .filter(
          (symbol: {
            symbol: string;
            quoteAsset: string;
            contractType: string;
            status: string;
          }) =>
            symbol.quoteAsset === "USDT" &&
            symbol.contractType === "PERPETUAL" &&
            symbol.status === "TRADING"
        )
        .map((symbol: { symbol: string }) => symbol.symbol)
    );

    const tickers = (tickerData as Ticker[])
      .filter(
        (ticker) =>
          validSymbols.has(ticker.symbol) &&
          Number.isFinite(Number(ticker.lastPrice)) &&
          Number.isFinite(Number(ticker.quoteVolume))
      )
      .sort(
        (a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)
      )
      .slice(0, 150);

    const rows = await pool(tickers, 10, async (ticker) => {
      const values = await Promise.all(
        FRAMES.map(async (frame) => {
          try {
            return await getRSI(ticker.symbol, frame);
          } catch {
            return null;
          }
        })
      );

      return {
        symbol: ticker.symbol,
        price: Number(ticker.lastPrice),
        change24h: Number(ticker.priceChangePercent),
        quoteVolume: Number(ticker.quoteVolume),
        rsi: Object.fromEntries(
          FRAMES.map((frame, index) => [frame, values[index]])
        ) as Record<Frame, number | null>,
      };
    });

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        totalEligibleContracts: validSymbols.size,
        displayedContracts: rows.length,
        rows,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load Binance Futures data.";

    return NextResponse.json(
      { error: message },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
