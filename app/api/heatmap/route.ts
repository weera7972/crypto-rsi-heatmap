
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASES = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
];

const FRAMES = ["15m", "1h", "4h", "12h", "1d"] as const;
type Frame = (typeof FRAMES)[number];

async function getJson(path: string): Promise<any> {
  const errors: string[] = [];

  for (const base of BASES) {
    try {
      const response = await fetch(`${base}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
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
    `All Binance Futures endpoints failed. ${errors.join(" | ")}`
  );
}

function rsi(closes: number[], period = 14): number | null {
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

async function getRsi(
  symbol: string,
  frame: Frame
): Promise<number | null> {
  try {
    const candles = await getJson(
      `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${frame}&limit=100`
    ) as unknown[][];

    return rsi(
      candles
        .map((candle) => Number(candle[4]))
        .filter(Number.isFinite)
    );
  } catch {
    return null;
  }
}

async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (true) {
          const index = next++;
          if (index >= items.length) return;
          results[index] = await fn(items[index]);
        }
      }
    )
  );

  return results;
}

export async function GET() {
  try {
    const [info, tickers] = await Promise.all([
      getJson("/fapi/v1/exchangeInfo"),
      getJson("/fapi/v1/ticker/24hr"),
    ]);

    const validSymbols = new Set(
      (info.symbols as {
        symbol: string;
        quoteAsset: string;
        contractType: string;
        status: string;
      }[])
        .filter(
          (s) =>
            s.quoteAsset === "USDT" &&
            s.contractType === "PERPETUAL" &&
            s.status === "TRADING"
        )
        .map((s) => s.symbol)
    );

    const market = (
      tickers as {
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        quoteVolume: string;
      }[]
    )
      .filter((t) => validSymbols.has(t.symbol))
      .sort(
        (a, b) =>
          Number(b.quoteVolume) - Number(a.quoteVolume)
      );

    const selected = market.slice(0, 100);

    const rows = await pool(selected, 5, async (ticker) => {
      const values = await Promise.all(
        FRAMES.map((frame) => getRsi(ticker.symbol, frame))
      );

      return {
        symbol: ticker.symbol,
        price: Number(ticker.lastPrice),
        change24h: Number(ticker.priceChangePercent),
        quoteVolume: Number(ticker.quoteVolume),
        rsi: Object.fromEntries(
          FRAMES.map((frame, i) => [frame, values[i]])
        ) as Record<Frame, number | null>,
      };
    });

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        totalEligibleContracts: market.length,
        displayedContracts: rows.length,
        rows,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Binance Futures data",
      },
      { status: 502 }
    );
  }
}
