
 const load = useCallback(async () => {
   setLoading(true);
   setError("");

   try {
     const BASE = "https://fapi.binance.com";

     async function getJson(url: string): Promise<any> {
       const response = await fetch(url, { cache: "no-store" });
       if (!response.ok) {
         throw new Error(`Binance API error: ${response.status}`);
       }
       return response.json();
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
         avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
         avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
       }

       if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
       return 100 - 100 / (1 + avgGain / avgLoss);
     }

     const [info, tickers] = await Promise.all([
       getJson(`${BASE}/fapi/v1/exchangeInfo`),
       getJson(`${BASE}/fapi/v1/ticker/24hr`)
     ]);

     const valid = new Set(
       info.symbols
         .filter((s: any) =>
           s.quoteAsset === "USDT" &&
           s.contractType === "PERPETUAL" &&
           s.status === "TRADING"
         )
         .map((s: any) => s.symbol)
     );

     const market = tickers
       .filter((t: any) => valid.has(t.symbol))
       .sort((a: any, b: any) => Number(b.quoteVolume) - Number(a.quoteVolume))
       .slice(0, 100);

     const rows: Coin[] = new Array(market.length);
     let next = 0;

     async function worker() {
       while (next < market.length) {
         const index = next++;
         const t = market[index];

         const values = await Promise.all(
           FRAMES.map(async (f) => {
             try {
               const candles = await getJson(
                 `${BASE}/fapi/v1/klines?symbol=${t.symbol}&interval=${f}&limit=100`
               );
               return calculateRSI(
                 candles.map((c: any[]) => Number(c[4])).filter(Number.isFinite)
               );
             } catch {
               return null;
             }
           })
         );

         rows[index] = {
           symbol: t.symbol,
           price: Number(t.lastPrice),
           change24h: Number(t.priceChangePercent),
           quoteVolume: Number(t.quoteVolume),
           rsi: Object.fromEntries(
             FRAMES.map((f, i) => [f, values[i]])
           ) as Record<Frame, number | null>
         };
       }
     }

     await Promise.all(
       Array.from({ length: 5 }, () => worker())
     );

     setData({
       updatedAt: new Date().toISOString(),
       totalEligibleContracts: valid.size,
       displayedContracts: rows.length,
       rows
     });
   } catch (e) {
     setError(
       e instanceof Error
         ? e.message
         : "Unable to load Binance Futures data. Check browser API access."
     );
   } finally {
     setLoading(false);
   }
 }, []);
