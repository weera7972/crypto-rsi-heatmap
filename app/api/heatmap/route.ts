import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const BASE = "https://fapi.binance.com";
const FRAMES = ["15m","1h","4h","12h","1d"] as const;
type Frame = typeof FRAMES[number];
async function getJson(url:string) { const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`Binance returned ${r.status}`); return r.json(); }
function rsi(c:number[],p=14):number|null {
 if(c.length<p+1)return null; let g=0,l=0;
 for(let i=1;i<=p;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d;}
 let ag=g/p,al=l/p;
 for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p;}
 return al===0?(ag===0?50:100):100-100/(1+ag/al);
}
async function getRsi(symbol:string,frame:Frame):Promise<number|null>{
 try{const k=await getJson(`${BASE}/fapi/v1/klines?symbol=${symbol}&interval=${frame}&limit=100`) as unknown[][];
 return rsi(k.map(x=>Number(x[4])).filter(Number.isFinite));}catch{return null;}
}
async function pool<T,R>(items:T[],limit:number,fn:(x:T)=>Promise<R>):Promise<R[]>{
 const out:R[]=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i]);}}));return out;
}
export async function GET(){
 try{
  const [info,tickers]=await Promise.all([getJson(`${BASE}/fapi/v1/exchangeInfo`),getJson(`${BASE}/fapi/v1/ticker/24hr`)]);
  const valid=new Set((info.symbols as {symbol:string;quoteAsset:string;contractType:string;status:string}[]).filter(s=>s.quoteAsset==="USDT"&&s.contractType==="PERPETUAL"&&s.status==="TRADING").map(s=>s.symbol));
  const market=(tickers as {symbol:string;lastPrice:string;priceChangePercent:string;quoteVolume:string}[]).filter(t=>valid.has(t.symbol)).sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume));
  const selected=market.slice(0,100);
  const rows=await pool(selected,8,async t=>{
   const vals=await Promise.all(FRAMES.map(f=>getRsi(t.symbol,f)));
   return {symbol:t.symbol,price:Number(t.lastPrice),change24h:Number(t.priceChangePercent),quoteVolume:Number(t.quoteVolume),rsi:Object.fromEntries(FRAMES.map((f,i)=>[f,vals[i]])) as Record<Frame,number|null>};
  });
  return NextResponse.json({updatedAt:new Date().toISOString(),totalEligibleContracts:market.length,displayedContracts:rows.length,rows},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Failed to load Binance Futures data"},{status:502});}
}
