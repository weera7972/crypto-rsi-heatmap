
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Frame = "15m" | "1h" | "4h" | "1d";

type Coin = {
  symbol: string;
  price: number;
  change24h: number;
  quoteVolume: number;
  rsi: Record<Frame, number | null>;
};

type HeatmapData = {
  updatedAt: string;
  totalEligibleContracts: number;
  displayedContracts: number;
  rows: Coin[];
};

const FRAMES: Frame[] = ["15m", "1h", "4h", "1d"];

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1000
    ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : value >= 1
      ? value.toLocaleString("en-US", { maximumFractionDigits: 4 })
      : value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function formatVolume(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function rsiClass(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "rsi na";
  if (value >= 80) return "rsi hot";
  if (value >= 70) return "rsi up";
  if (value >= 60) return "rsi midup";
  if (value >= 50) return "rsi middown";
  if (value >= 40) return "rsi down";
  return "rsi cold";
}

function bubbleColor(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "#293244";
  if (value >= 70) return "#ff6878";
  if (value >= 60) return "#ff9b72";
  if (value >= 50) return "#c9d77c";
  if (value >= 40) return "#75c9a7";
  if (value >= 30) return "#4ab9c5";
  return "#6b91ff";
}

export default function Home() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [frame, setFrame] = useState<Frame>("1h");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("volume");
  const [ascending, setAscending] = useState(false);
  const [view, setView] = useState<"table" | "bubbles">("bubbles");
  const [lastUpdated, setLastUpdated] = useState("");

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/heatmap", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || `Data request failed (${response.status})`
        );
      }

      if (!Array.isArray(result.rows)) {
        throw new Error("The API response did not contain a valid rows list.");
      }

      setData(result as HeatmapData);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load market data. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);

    const timer = window.setInterval(() => {
      void load(false);
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [load]);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const query = search.trim().toUpperCase();

    const filtered = all.filter((coin) =>
      coin.symbol.toUpperCase().includes(query)
    );

    filtered.sort((a, b) => {
      let result = 0;

      if (sortBy === "symbol") {
        result = a.symbol.localeCompare(b.symbol);
      } else if (sortBy === "price") {
        result = a.price - b.price;
      } else if (sortBy === "change") {
        result = a.change24h - b.change24h;
      } else if (sortBy === "rsi") {
        result = (a.rsi[frame] ?? -1) - (b.rsi[frame] ?? -1);
      } else {
        result = a.quoteVolume - b.quoteVolume;
      }

      return ascending ? result : -result;
    });

    return filtered;
  }, [data, search, sortBy, ascending, frame]);

  const averageRsi = useMemo(() => {
    const values = (data?.rows ?? [])
      .map((coin) => coin.rsi[frame])
      .filter((value): value is number => value !== null && Number.isFinite(value));

    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [data, frame]);

  const overbought = rows.filter(
    (coin) => coin.rsi[frame] !== null && coin.rsi[frame]! >= 70
  ).length;

  const oversold = rows.filter(
    (coin) => coin.rsi[frame] !== null && coin.rsi[frame]! <= 30
  ).length;

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <span className="logo">◉</span>
          <span>CRYPTO <em>HEATMAP</em></span>
        </div>
        <span className="tag"><i /> BINANCE FUTURES</span>
        <button
          className="refresh"
          onClick={() => void load(true)}
          disabled={loading}
        >
          {loading ? "Loading..." : "↻ Refresh"}
        </button>
      </header>

      <section className="intro">
        <div>
          <div className="eyebrow">● LIVE MARKET SCANNER</div>
          <h1>Crypto RSI <em>Heatmap</em></h1>
          <p>
            Track relative strength across the top USDT perpetual contracts.
          </p>
        </div>
        <div className="live">
          ● {loading && !data ? "CONNECTING" : error ? "CONNECTION ISSUE" : "LIVE DATA"}
          <small>Last update: {lastUpdated || "Waiting for data"}</small>
        </div>
      </section>

      <section className="stats">
        <article>
          <small>CONTRACTS LOADED</small>
          <strong>{data?.displayedContracts ?? 0}</strong>
          <span>Top USDT perpetual markets</span>
        </article>
        <article>
          <small>AVERAGE RSI · {frame.toUpperCase()}</small>
          <strong>{averageRsi === null ? "—" : averageRsi.toFixed(1)}</strong>
          <span>RSI period: 14</span>
        </article>
        <article>
          <small>OVERBOUGHT / OVERSOLD</small>
          <strong>
            <span className="positive">{overbought}</span>
            {" / "}
            <span className="negative">{oversold}</span>
          </strong>
          <span>RSI above 70 / below 30</span>
        </article>
      </section>

      <section className="panel">
        <div className="panelhead">
          <div>
            <h2>Market Strength</h2>
            <p>Equal-size bubbles · Color represents RSI strength</p>
          </div>
          <nav>
            <button
              className={view === "bubbles" ? "chosen" : ""}
              onClick={() => setView("bubbles")}
            >
              Bubbles
            </button>
            <button
              className={view === "table" ? "chosen" : ""}
              onClick={() => setView("table")}
            >
              Table
            </button>
          </nav>
        </div>

        <div className="toolbar">
          <label>
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search coin, e.g. BTCUSDT"
            />
          </label>

          <div className="frames">
            {FRAMES.map((item) => (
              <button
                key={item}
                className={frame === item ? "active" : ""}
                onClick={() => setFrame(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label="Sort markets"
          >
            <option value="volume">Sort: Volume</option>
            <option value="rsi">Sort: RSI</option>
            <option value="change">Sort: 24h Change</option>
            <option value="price">Sort: Price</option>
            <option value="symbol">Sort: Symbol</option>
          </select>

          <button
            className="refresh"
            onClick={() => setAscending((value) => !value)}
          >
            {ascending ? "↑ Ascending" : "↓ Descending"}
          </button>
        </div>

        {error && (
          <div className="error">
            <strong>Could not load market data</strong>
            <span>{error}</span>
            <button onClick={() => void load(true)}>Try again</button>
          </div>
        )}

        {loading && !data && !error && (
          <div className="loading">
            Connecting to Binance Futures...
            <small>Loading market prices and RSI values. This may take a moment.</small>
          </div>
        )}

        {!loading && !error && data && data.rows.length === 0 && (
          <div className="empty">
            No contracts returned by the API. Try refreshing the page.
          </div>
        )}

        {view === "bubbles" ? (
          <div className="bubblearea">
            <div className="bubbleinfo">
              <span>Showing {rows.length} of {data?.displayedContracts ?? 0} contracts</span>
              <span>RSI ({frame})</span>
            </div>
            <div className="bubbles">
              {rows.map((coin) => {
                const value = coin.rsi[frame];
                return (
                  <button
                    key={coin.symbol}
                    className="bubble"
                    style={{ background: bubbleColor(value) }}
                    title={`${coin.symbol} · Price ${formatPrice(coin.price)} · RSI ${
                      value === null ? "N/A" : value.toFixed(2)
                    } · 24h ${coin.change24h.toFixed(2)}%`}
                    onClick={() => setSearch(coin.symbol)}
                  >
                    <b>{coin.symbol.replace("USDT", "")}</b>
                    <span>{value === null ? "—" : value.toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>CONTRACT</th>
                  <th>PRICE</th>
                  <th>24H CHANGE</th>
                  <th>VOLUME</th>
                  {FRAMES.map((item) => <th key={item}>RSI {item}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((coin, index) => (
                  <tr key={coin.symbol}>
                    <td><span className="rank">{index + 1}</span></td>
                    <td>
                      <strong>{coin.symbol.replace("USDT", "")}</strong>
                      <span className="pair">/USDT</span>
                    </td>
                    <td>{formatPrice(coin.price)}</td>
                    <td className={coin.change24h >= 0 ? "positive" : "negative"}>
                      {coin.change24h >= 0 ? "+" : ""}
                      {coin.change24h.toFixed(2)}%
                    </td>
                    <td>{formatVolume(coin.quoteVolume)}</td>
                    {FRAMES.map((item) => (
                      <td key={item}>
                        <span className={rsiClass(coin.rsi[item])}>
                          {coin.rsi[item] === null
                            ? "—"
                            : coin.rsi[item]!.toFixed(1)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="foot">
          <span>RSI 70+ = Overbought · RSI 30− = Oversold</span>
          <span>{rows.length} markets · Auto-refresh 60s</span>
        </div>
      </section>

      <div className="legend">
        <b>RSI SCALE</b>
        <span><i style={{ background: "#ff6878" }} /> 70–100 Strong</span>
        <span><i style={{ background: "#ff9b72" }} /> 60–69</span>
        <span><i style={{ background: "#c9d77c" }} /> 50–59</span>
        <span><i style={{ background: "#75c9a7" }} /> 40–49</span>
        <span><i style={{ background: "#4ab9c5" }} /> 30–39</span>
        <span><i style={{ background: "#6b91ff" }} /> 0–29 Weak</span>
        <small>Market data is for information only.</small>
      </div>

      <footer>
        Crypto RSI Heatmap · Binance Futures public market data
      </footer>
    </main>
  );
}
