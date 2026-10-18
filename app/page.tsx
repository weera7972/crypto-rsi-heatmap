"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Activity,RefreshCw,Search,Waves} from "lucide-react";
type Frame="15m"|"1h"|"4h"|"12h"|"1d";
type Coin={symbol:string;price:number;change24h:number;quoteVolume:number;rsi:Record<Frame,number|null>};
type Data={updatedAt:string;totalEligibleContracts:number;displayedContracts:number;rows:Coin[];error?:string};
const FRAMES:Frame[]=["15m","1h","4h","12h","1d"];
function color(v:number|null){if(v===null)return"na";if(v>=70)return"hot";if(v>=60)return"up";if(v>=50)return"midup";if(v>=40)return"middown";if(v>=30)return"down";return"cold";}
function price(v:number){return v>=1000?v.toLocaleString("en-US",{maximumFractionDigits:2}):v>=1?v.toLocaleString("en-US",{maximumFractionDigits:4}):v.toLocaleString("en-US",{maximumFractionDigits:7});}
function volume(v:number){return v>=1e9?`$${(v/1e9).toFixed(2)}B`:v>=1e6?`$${(v/1e6).toFixed(1)}M`:`$${(v/1e3).toFixed(1)}K`;}
function name(s:string){return s.endsWith("USDT")?s.slice(0,-4):s;}
export default function Home(){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[frame,setFrame]=useState<Frame>("1h"),[query,setQuery]=useState(""),[view,setView]=useState<"table"|"bubbles">("table"),[sort,setSort]=useState("volume");
 const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch("/api/heatmap",{cache:"no-store"});const j=await r.json();if(!r.ok||j.error)throw new Error(j.error||"Unable to load data");setData(j);}catch(e){setError(e instanceof Error?e.message:"Unable to load data");}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const rows=useMemo(()=>{const a=(data?.rows||[]).filter(c=>c.symbol.toLowerCase().includes(query.toLowerCase().trim()));return a.sort((x,y)=>sort==="rsi"?(y.rsi[frame]??-1)-(x.rsi[frame]??-1):y.quoteVolume-x.quoteVolume);},[data,query,sort,frame]);
 const avg=rows.map(c=>c.rsi[frame]).filter((v):v is number=>v!==null).reduce((a,b,_,arr)=>a+b/arr.length,0);
 return <main className="shell">
 <header><a className="brand"><span className="logo"><Activity size={19}/></span> RSI<span className="accent">HEATMAP</span></a><span className="tag"><i/> BINANCE USDT-M FUTURES</span><button className="refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
 <section className="intro"><div><small className="eyebrow"><Waves size={13}/> MARKET MOMENTUM SCANNER</small><h1>RSI <em>Heatmap</em></h1><p>Momentum overview for Binance USDT-M perpetual futures.</p></div><div className="live">● PUBLIC MARKET DATA<small>{data?`Updated ${new Date(data.updatedAt).toLocaleTimeString()}`:"Waiting for data"}</small></div></section>
 <section className="stats"><article><small>CONTRACTS DISPLAYED</small><strong>{data?.displayedContracts??"—"}</strong><span>Highest 24h quote volume</span></article><article><small>AVERAGE RSI · {frame}</small><strong>{Number.isFinite(avg)?avg.toFixed(1):"—"}</strong><span>Filtered market average</span></article><article><small>SELECTED TIMEFRAME</small><strong>{frame}</strong><span>RSI length: 14</span></article></section>
 <section className="panel"><div className="panelhead"><div><h2>Market RSI</h2><p>RSI calculated from Binance Futures candles</p></div><nav><button className={view==="table"?"chosen":""} onClick={()=>setView("table")}>RSI Table</button><button className={view==="bubbles"?"chosen":""} onClick={()=>setView("bubbles")}>Bubble Heatmap</button></nav></div>
 <div className="toolbar"><label><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search futures symbol…"/></label><div className="frames">{FRAMES.map(f=><button key={f} className={frame===f?"active":""} onClick={()=>setFrame(f)}>{f}</button>)}</div><select value={sort} onChange={e=>setSort(e.target.value)}><option value="volume">Sort: 24h Volume</option><option value="rsi">Sort: RSI high to low</option></select></div>
 {error&&<div className="error"><b>Market data could not load</b><span>{error}</span><button onClick={()=>void load()}>Try again</button></div>}
 {loading&&!data&&<div className="loading">Loading Futures market and RSI values…<small>The first load can take a little time.</small></div>}
 {!error&&view==="table"&&<div className="tablewrap"><table><thead><tr><th>CONTRACT</th><th>LAST PRICE</th><th>24H CHANGE</th><th>24H VOLUME</th>{FRAMES.map(f=><th key={f}>{f} RSI</th>)}</tr></thead><tbody>{rows.map((c,i)=><tr key={c.symbol}><td><span className="rank">{i+1}</span><b>{name(c.symbol)}</b><span className="pair">/USDT</span></td><td>${price(c.price)}</td><td className={c.change24h>=0?"positive":"negative"}>{c.change24h>=0?"+":""}{c.change24h.toFixed(2)}%</td><td className="muted">{volume(c.quoteVolume)}</td>{FRAMES.map(f=><td key={f}><span className={`rsi ${color(c.rsi[f])}`}>{c.rsi[f]===null?"—":c.rsi[f]!.toFixed(1)}</span></td>)}</tr>)}{!rows.length&&!loading&&<tr><td colSpan={9} className="empty">No matching symbols</td></tr>}</tbody></table></div>}
 {!error&&view==="bubbles"&&<div className="bubblearea"><div className="bubbleinfo">All bubbles are equal size · Color represents {frame} RSI</div><div className="bubbles">{rows.map(c=><button key={c.symbol} className={`bubble ${color(c.rsi[frame])}`} title={`${c.symbol} · RSI ${c.rsi[frame]??"N/A"}`} onClick={()=>setQuery(c.symbol)}><b>{name(c.symbol)}</b><span>{c.rsi[frame]===null?"—":c.rsi[frame]!.toFixed(1)}</span></button>)}</div></div>}
 <div className="foot"><span>RSI(14) · Wilder smoothing</span><span>Showing {rows.length} of {data?.displayedContracts??0} contracts</span></div></section>
 <section className="legend"><b>RSI COLOR SCALE</b>{[["cold","0–29","Oversold"],["down","30–39",""],["middown","40–49",""],["midup","50–59",""],["up","60–69",""],["hot","70–100","Overbought"]].map(([c,v,l])=><span key={c}><i className={c}/>{v} {l&&<small>{l}</small>}</span>)}</section>
 <footer>Public Binance USDT-M Futures data · No API key required · Data refreshes when you press Refresh</footer>
 </main>;
}
