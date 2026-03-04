import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
// For deployment: put keys in .env as VITE_TWELVE_KEY and VITE_GNEWS_KEY
const ENV_TWELVE = typeof import.meta !== "undefined" && import.meta.env?.VITE_TWELVE_KEY;
const ENV_GNEWS  = typeof import.meta !== "undefined" && import.meta.env?.VITE_GNEWS_KEY;

const TICK_CRYPTO = 60;    // crypto refresh every 60s
const TICK_COMMOD = 300;   // commodities every 5min (Twelve Data limit)
const TICK_NEWS   = 600;   // news every 10min (GNews limit)

// ─── FORMATTERS ─────────────────────────────────────────────────────────────
const f  = (n, d = 0) => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pf = (n, key) => {
  if (n == null) return "—";
  if (key === "dxy") return f(n, 2);
  if (n >= 1000)     return `$${f(n, 0)}`;
  if (n >= 1)        return `$${f(n, 2)}`;
  if (n < 0.0001)    return `$${n.toExponential(2)}`;
  return `$${f(n, 5)}`;
};

// ─── COLORS ─────────────────────────────────────────────────────────────────
const C = {
  btc:"#F7931A", eth:"#627EEA", sol:"#9945FF", xrp:"#00AAE4",
  doge:"#C3A634", pepe:"#3CB043", shib:"#E74C3C",
  gold:"#D4901A", silver:"#8BA3B5", oil:"#C05020", dxy:"#2E86C1",
  up:"#00D68F", dn:"#FF3D6B", warn:"#F5A623",
};

// ─── API LAYER ───────────────────────────────────────────────────────────────

// 1. CoinGecko — no key, free
async function fetchCrypto() {
  const ids = "bitcoin,ethereum,solana,ripple,dogecoin,pepe,shiba-inu";
  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
    { headers: { Accept: "application/json" } }
  );
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}

// 2. Twelve Data — needs free key (800 req/day)
async function fetchCommodities(key) {
  const symbols = ["XAU/USD", "XAG/USD", "WTIUSD", "DX"];
  const results = await Promise.all(
    symbols.map(sym =>
      fetch(`https://api.twelvedata.com/price?symbol=${sym}&apikey=${key}`)
        .then(r => r.json())
        .catch(() => null)
    )
  );
  // get 24h change via quote endpoint (one call)
  const quotes = await Promise.all(
    symbols.map(sym =>
      fetch(`https://api.twelvedata.com/quote?symbol=${sym}&apikey=${key}`)
        .then(r => r.json())
        .catch(() => null)
    )
  );
  return { results, quotes, symbols };
}

// 3. Alternative.me Fear & Greed — no key, free
async function fetchFGI() {
  const r = await fetch("https://api.alternative.me/fng/?limit=1");
  if (!r.ok) throw new Error(`FGI ${r.status}`);
  const d = await r.json();
  return d.data?.[0];
}

// 4. GNews — via serverless proxy (avoids CORS), falls back to direct call
async function fetchNews(key) {
  // Try serverless proxy first (works on Vercel deployment)
  try {
    const r = await fetch("/api/news");
    if (r.ok) return r.json();
  } catch {}
  // Fallback: direct call (works locally with key)
  const q = encodeURIComponent("gold price OR oil price OR bitcoin OR Iran war OR stock market");
  const r = await fetch(
    `https://gnews.io/api/v4/search?q=${q}&lang=en&max=5&apikey=${key}`
  );
  if (!r.ok) throw new Error(`GNews ${r.status}`);
  return r.json();
}

// ─── LOGO SVG ────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <defs>
        <linearGradient id="LG" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A2438"/><stop offset="1" stopColor="#0C1420"/>
        </linearGradient>
        <linearGradient id="WG" x1="0" y1="20" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4901A"/><stop offset="1" stopColor="#F5D060"/>
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill="url(#LG)"/>
      <polyline points="2,19 5,19 8,9 11,22 15,5 19,19 22,14 26,14"
        fill="none" stroke="url(#WG)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="15" cy="5" r="1.8" fill="#F5D060"/>
      <circle cx="15" cy="5" r="4" fill="#F5D060" opacity="0.14"/>
    </svg>
  );
}

// ─── ARC GAUGE ───────────────────────────────────────────────────────────────
function ArcGauge({ val=0, max=100, r=40, stroke=7, size=100, color="#D4901A", label, sublabel, glow=false }) {
  const cx=size/2, cy=size/2, circ=2*Math.PI*r;
  const filled=circ*0.75*Math.min(val/max,1), gap=circ-filled;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {glow && <defs><filter id={`gf${label}`}><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke}
        strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeDashoffset={circ/4} strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${gap}`} strokeDashoffset={circ/4} strokeLinecap="round"
        filter={glow?`url(#gf${label})`:undefined}
        style={{transition:"stroke-dasharray 1.4s cubic-bezier(.34,1.2,.64,1),stroke .6s"}}/>
      {label && <text x={cx} y={cy+5} textAnchor="middle" fontSize={label.length>4?12:16}
        fontFamily="'Bebas Neue',cursive" fill={color} letterSpacing="0.5">{label}</text>}
      {sublabel && <text x={cx} y={cy+18} textAnchor="middle" fontSize="7"
        fontFamily="'Space Mono',monospace" fill="rgba(255,255,255,0.22)" letterSpacing="1.5">{sublabel}</text>}
    </svg>
  );
}

// ─── SPARKLINE ───────────────────────────────────────────────────────────────
function Spark({ up=true, w=52, h=18 }) {
  const pts = up
    ? [[0,h],[w*.15,h*.8],[w*.3,h*.55],[w*.45,h*.65],[w*.6,h*.3],[w*.78,h*.4],[w,h*.05]]
    : [[0,0],[w*.15,h*.2],[w*.3,h*.4],[w*.45,h*.3],[w*.6,h*.6],[w*.78,h*.55],[w,h*.92]];
  const line = pts.map((p,i)=>`${i===0?"M":"L"}${p[0]},${p[1]}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const col = up ? C.up : C.dn;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{overflow:"hidden"}}>
      <path d={area} fill={col} opacity=".1"/>
      <path d={line} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── CHANGE PILL ─────────────────────────────────────────────────────────────
function Pill({ v, sm }) {
  if (v == null) return <span style={{fontSize:sm?9:10,color:"rgba(255,255,255,.2)",fontFamily:"'Space Mono',monospace"}}>—</span>;
  const up = v >= 0;
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:2,
      padding:sm?"1px 5px":"2px 6px",borderRadius:5,
      background:up?"rgba(0,214,143,.1)":"rgba(255,61,107,.1)",
      border:`1px solid ${up?"rgba(0,214,143,.2)":"rgba(255,61,107,.2)"}`,
      color:up?C.up:C.dn,
      fontSize:sm?9:10,fontFamily:"'Space Mono',monospace",fontWeight:400,
    }}>
      {up?"▲":"▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}

// ─── KEY SETUP SCREEN ────────────────────────────────────────────────────────
function SetupScreen({ onSave }) {
  const [t, setT] = useState("");
  const [g, setG] = useState("");
  return (
    <div style={{
      minHeight:"100vh",background:"#060B14",display:"flex",alignItems:"center",
      justifyContent:"center",padding:"24px",fontFamily:"'DM Sans',sans-serif",
    }}>
      <div style={{
        width:"100%",maxWidth:380,
        background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",
        borderRadius:20,padding:"28px 24px",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
          <Logo/>
          <div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,letterSpacing:2,
              background:"linear-gradient(90deg,#ECF3FF 60%,#D4901A 100%)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              MarketPulse
            </div>
            <div style={{fontSize:9,fontFamily:"'Space Mono',monospace",letterSpacing:2,color:"rgba(255,255,255,.25)",marginTop:1}}>
              API SETUP
            </div>
          </div>
        </div>

        <p style={{fontSize:12,color:"rgba(255,255,255,.45)",lineHeight:1.6,marginBottom:20}}>
          Enter your free API keys to power the dashboard. Both are free — sign up takes 1 minute each.
        </p>

        {/* Twelve Data */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:11,fontFamily:"'Space Mono',monospace",color:C.gold,letterSpacing:1}}>TWELVE DATA</span>
            <a href="https://twelvedata.com" target="_blank" rel="noreferrer"
              style={{fontSize:9,fontFamily:"'Space Mono',monospace",color:"rgba(255,255,255,.3)",
              textDecoration:"none",borderBottom:"1px solid rgba(255,255,255,.15)"}}>
              Get free key →
            </a>
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.25)",fontFamily:"'Space Mono',monospace",marginBottom:6,letterSpacing:.5}}>
            Gold · Silver · Oil · USD Index  |  800 req/day free
          </div>
          <input
            value={t} onChange={e=>setT(e.target.value)}
            placeholder="Paste your Twelve Data API key…"
            style={{
              width:"100%",background:"rgba(255,255,255,.05)",
              border:"1px solid rgba(255,255,255,.1)",borderRadius:10,
              padding:"10px 12px",color:"#ECF3FF",fontFamily:"'Space Mono',monospace",
              fontSize:11,outline:"none",
            }}
          />
        </div>

        {/* GNews */}
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:11,fontFamily:"'Space Mono',monospace",color:"#5AB3E0",letterSpacing:1}}>GNEWS</span>
            <a href="https://gnews.io" target="_blank" rel="noreferrer"
              style={{fontSize:9,fontFamily:"'Space Mono',monospace",color:"rgba(255,255,255,.3)",
              textDecoration:"none",borderBottom:"1px solid rgba(255,255,255,.15)"}}>
              Get free key →
            </a>
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.25)",fontFamily:"'Space Mono',monospace",marginBottom:6,letterSpacing:.5}}>
            Live headlines  |  100 req/day free
          </div>
          <input
            value={g} onChange={e=>setG(e.target.value)}
            placeholder="Paste your GNews API key…"
            style={{
              width:"100%",background:"rgba(255,255,255,.05)",
              border:"1px solid rgba(255,255,255,.1)",borderRadius:10,
              padding:"10px 12px",color:"#ECF3FF",fontFamily:"'Space Mono',monospace",
              fontSize:11,outline:"none",
            }}
          />
        </div>

        <button
          onClick={()=>{ if(t.trim() && g.trim()) onSave(t.trim(), g.trim()); }}
          disabled={!t.trim() || !g.trim()}
          style={{
            width:"100%",padding:"13px",
            background: t.trim()&&g.trim() ? "linear-gradient(135deg,rgba(212,144,26,.25),rgba(212,144,26,.12))" : "rgba(255,255,255,.04)",
            border:`1px solid ${t.trim()&&g.trim()?"rgba(212,144,26,.35)":"rgba(255,255,255,.07)"}`,
            borderRadius:12,color:t.trim()&&g.trim()?"#F5D060":"rgba(255,255,255,.2)",
            fontFamily:"'Bebas Neue',cursive",fontSize:16,letterSpacing:2,
            cursor:t.trim()&&g.trim()?"pointer":"not-allowed",
            transition:"all .2s",
          }}
        >
          LAUNCH DASHBOARD
        </button>

        <div style={{marginTop:14,padding:"10px 12px",background:"rgba(255,255,255,.025)",borderRadius:10,
          border:"1px solid rgba(255,255,255,.05)"}}>
          <div style={{fontSize:9,fontFamily:"'Space Mono',monospace",color:"rgba(255,255,255,.25)",letterSpacing:1,marginBottom:4}}>
            DEPLOYING TO VERCEL?
          </div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.3)",lineHeight:1.6}}>
            Skip this screen — add <code style={{color:C.gold,fontSize:9}}>VITE_TWELVE_KEY</code> and <code style={{color:"#5AB3E0",fontSize:9}}>VITE_GNEWS_KEY</code> as environment variables in Vercel dashboard.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
::-webkit-scrollbar{display:none}
*{scrollbar-width:none}
body{background:#060B14;color:#ECF3FF;font-family:'DM Sans',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased;}
.wrap{max-width:430px;margin:0 auto;padding-bottom:calc(72px + env(safe-area-inset-bottom));position:relative;overflow-x:hidden;}
.glow{position:fixed;border-radius:50%;pointer-events:none;z-index:0;filter:blur(100px)}
.g1{width:350px;height:350px;top:-150px;right:-130px;background:radial-gradient(circle,rgba(212,144,26,.07),transparent 70%)}
.g2{width:280px;height:280px;bottom:25%;left:-120px;background:radial-gradient(circle,rgba(99,126,234,.06),transparent 70%)}
.g3{width:200px;height:200px;top:55%;right:-80px;background:radial-gradient(circle,rgba(0,214,143,.04),transparent 70%)}
.grid-bg{position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);
  background-size:32px 32px;
  mask-image:radial-gradient(ellipse 80% 100% at 50% 0%,black 40%,transparent 100%);}
.z1{position:relative;z-index:1}
.hdr{display:flex;justify-content:space-between;align-items:center;padding:16px 16px 12px;
  position:sticky;top:0;z-index:50;
  background:linear-gradient(180deg,rgba(6,11,20,.97) 70%,transparent);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);}
.hdr-l{display:flex;align-items:center;gap:9px}
.brand{font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:2px;
  background:linear-gradient(90deg,#ECF3FF 60%,#D4901A 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1;}
.brand-sub{font-size:8px;font-family:'Space Mono',monospace;letter-spacing:2.5px;color:rgba(255,255,255,.22);text-transform:uppercase;margin-top:1px}
.live-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;
  background:rgba(0,214,143,.07);border:1px solid rgba(0,214,143,.18);
  font-size:9.5px;font-family:'Space Mono',monospace;letter-spacing:1.5px;color:#00D68F;}
.live-badge.loading{background:rgba(245,166,35,.07);border-color:rgba(245,166,35,.18);color:#F5A623}
.live-badge.error{background:rgba(255,61,107,.07);border-color:rgba(255,61,107,.18);color:#FF3D6B}
.blink{width:5px;height:5px;border-radius:50%;background:currentColor;animation:bk 1.4s infinite}
@keyframes bk{0%,100%{opacity:1}50%{opacity:.15}}
.hdr-time{font-size:8.5px;font-family:'Space Mono',monospace;color:rgba(255,255,255,.2);margin-top:3px;text-align:right}
.war-strip{margin:4px 14px 12px;background:linear-gradient(135deg,rgba(255,61,107,.09),rgba(255,61,107,.03));
  border:1px solid rgba(255,61,107,.18);border-left:3px solid #FF3D6B;border-radius:12px;
  padding:10px 14px;display:flex;align-items:center;gap:10px;}
.war-tag{font-size:8.5px;font-family:'Space Mono',monospace;letter-spacing:2px;color:#FF3D6B;
  text-transform:uppercase;white-space:nowrap;background:rgba(255,61,107,.12);padding:3px 7px;border-radius:5px;}
.war-items{display:flex;gap:8px;overflow-x:auto;flex:1}
.war-chip{flex-shrink:0;display:inline-flex;align-items:center;gap:4px;font-size:9.5px;
  font-family:'Space Mono',monospace;color:rgba(255,255,255,.45);white-space:nowrap;}
.wc-dot{width:4px;height:4px;border-radius:50%}
.instrument-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:0 14px;margin-bottom:12px;}
.inst{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.055);border-radius:14px;
  padding:12px 10px;display:flex;flex-direction:column;align-items:center;
  animation:rise .4s both cubic-bezier(.16,1,.3,1);}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.inst-label{font-size:8px;font-family:'Space Mono',monospace;letter-spacing:2px;color:rgba(255,255,255,.25);text-transform:uppercase;margin-bottom:4px}
.inst-change{margin-top:4px}
.heat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:0 14px;margin-bottom:12px;}
.hc{border-radius:10px;padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:3px;
  transition:background .8s,border-color .8s;border:1px solid transparent;}
.hc-sym{font-size:8.5px;font-family:'Space Mono',monospace;letter-spacing:1.5px;color:rgba(255,255,255,.3);text-transform:uppercase}
.hc-val{font-family:'Bebas Neue',cursive;font-size:18px;letter-spacing:.5px;line-height:1}
.hc-loading{width:36px;height:18px;background:rgba(255,255,255,.06);border-radius:3px;animation:bk 1.2s infinite}
.cx-row{display:flex;gap:8px;padding:0 14px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;margin-bottom:12px;}
.cx{flex-shrink:0;width:100px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);
  border-radius:12px;padding:11px 10px;animation:rise .4s both cubic-bezier(.16,1,.3,1);
  -webkit-tap-highlight-color:transparent;transition:background .15s,transform .1s;cursor:pointer;}
.cx:active{background:rgba(255,255,255,.05);transform:scale(.96)}
.cx-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.cx-ico{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;
  font-size:12px;font-family:'Space Mono',monospace;font-weight:700;}
.cx-ch{font-size:9px;font-family:'Space Mono',monospace;font-weight:700}
.cx-ch.up{color:#00D68F}.cx-ch.dn{color:#FF3D6B}.cx-ch.na{color:rgba(255,255,255,.25)}
.cx-sym{font-size:10px;font-family:'Space Mono',monospace;font-weight:700;color:rgba(255,255,255,.6);letter-spacing:.5px}
.cx-price{font-family:'Bebas Neue',cursive;font-size:16px;letter-spacing:.5px;color:#ECF3FF;margin-top:5px;line-height:1}
.cx-loading{width:55px;height:14px;background:rgba(255,255,255,.06);border-radius:3px;margin-top:5px;animation:bk 1.2s infinite}
.cx-spark{margin-top:6px}
.gauge-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px;margin-bottom:12px;}
.gc{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.055);border-radius:14px;
  padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:2px;animation:rise .4s both;}
.gc-head{font-size:8px;font-family:'Space Mono',monospace;letter-spacing:2px;color:rgba(255,255,255,.25);text-transform:uppercase;margin-bottom:6px}
.gc-foot{font-size:8.5px;font-family:'Space Mono',monospace;color:rgba(255,255,255,.2);letter-spacing:.5px;margin-top:5px;text-align:center}
.news-wrap{margin:0 14px 12px}
.news-head{font-size:8px;font-family:'Space Mono',monospace;letter-spacing:2.5px;color:rgba(255,255,255,.2);text-transform:uppercase;margin-bottom:8px}
.news-stack{background:rgba(255,255,255,.022);border:1px solid rgba(255,255,255,.055);border-radius:14px;overflow:hidden;}
.ni{display:flex;align-items:flex-start;gap:9px;padding:10px 13px;
  border-bottom:1px solid rgba(255,255,255,.04);animation:rise .4s both cubic-bezier(.16,1,.3,1);
  transition:background .15s;cursor:pointer;}
.ni:last-child{border-bottom:none}
.ni:active{background:rgba(255,255,255,.04)}
.ni-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:5px}
.ni-text{font-size:12px;line-height:1.5;color:rgba(237,243,255,.7);flex:1}
.ni-t{font-size:8.5px;font-family:'Space Mono',monospace;color:rgba(255,255,255,.18);margin-top:2px}
.skel-row{display:flex;gap:9px;padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.04)}
.skel-dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.07);flex-shrink:0;margin-top:5px}
.skel-lines{flex:1;display:flex;flex-direction:column;gap:5px}
.skel-l{height:8px;background:rgba(255,255,255,.05);border-radius:3px;animation:bk 1.5s infinite}
.ol-wrap{padding:0 14px;margin-bottom:4px}
.ol-head{font-size:8px;font-family:'Space Mono',monospace;letter-spacing:2.5px;color:rgba(255,255,255,.2);text-transform:uppercase;margin-bottom:8px}
.ol-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ol-cell{border-radius:10px;padding:11px 8px;display:flex;flex-direction:column;align-items:center;gap:5px;transition:background .5s,border-color .5s;}
.ol-asset{font-size:8px;font-family:'Space Mono',monospace;letter-spacing:2px;color:rgba(255,255,255,.3);text-transform:uppercase}
.ol-verdict{font-family:'Bebas Neue',cursive;font-size:17px;letter-spacing:1px;text-align:center}
.ol-bar{height:2px;border-radius:1px;width:100%;margin-top:1px;opacity:.5}
.err-banner{margin:0 14px 10px;background:rgba(255,61,107,.07);border:1px solid rgba(255,61,107,.15);
  border-radius:10px;padding:8px 12px;font-size:10px;font-family:'Space Mono',monospace;
  color:rgba(255,100,120,.7);letter-spacing:.5px;}
.bot{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;z-index:200;
  padding:0 14px calc(12px + env(safe-area-inset-bottom));
  background:linear-gradient(0deg,rgba(6,11,20,1) 50%,transparent);}
.bot-inner{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.035);
  border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:9px 12px;backdrop-filter:blur(12px);}
.prog-wrap{flex:1}
.prog-top{display:flex;justify-content:space-between;font-size:8px;font-family:'Space Mono',monospace;
  color:rgba(255,255,255,.2);margin-bottom:5px;letter-spacing:1px}
.prog-track{height:2px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden}
.prog-fill{height:100%;background:linear-gradient(90deg,#C46A10,#F5D060);border-radius:2px;transition:width 1s linear}
.ref-btn{background:rgba(212,144,26,.12);border:1px solid rgba(212,144,26,.22);color:#F5D060;
  border-radius:9px;padding:7px 13px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;
  cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:background .15s,transform .1s;}
.ref-btn:active{background:rgba(212,144,26,.22);transform:scale(.97)}
.ref-btn:disabled{opacity:.3;pointer-events:none}
.settings-btn{background:transparent;border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.3);
  border-radius:9px;padding:7px 10px;font-family:'Space Mono',monospace;font-size:10px;
  cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .15s;}
.settings-btn:active{background:rgba(255,255,255,.05)}
`;

const CMETA = {
  bitcoin:     { k:"btc",  s:"BTC",  n:"Bitcoin",  ico:"₿" },
  ethereum:    { k:"eth",  s:"ETH",  n:"Ethereum", ico:"Ξ" },
  solana:      { k:"sol",  s:"SOL",  n:"Solana",   ico:"◎" },
  ripple:      { k:"xrp",  s:"XRP",  n:"XRP",      ico:"✕" },
  dogecoin:    { k:"doge", s:"DOGE", n:"Dogecoin", ico:"Ð" },
  pepe:        { k:"pepe", s:"PEPE", n:"Pepe",     ico:"🐸" },
  "shiba-inu": { k:"shib", s:"SHIB", n:"Shiba",    ico:"🐕" },
};

const COMM_DEF = [
  { k:"gold",   s:"XAU", n:"Gold",   u:"oz",  price:null, ch:null },
  { k:"silver", s:"XAG", n:"Silver", u:"oz",  price:null, ch:null },
  { k:"oil",    s:"WTI", n:"Oil",    u:"bbl", price:null, ch:null },
  { k:"dxy",    s:"DXY", n:"USD",    u:"",    price:null, ch:null },
];

const OL = [
  { a:"GOLD",   v:"STRONG↑", col:"#00D68F", bg:"rgba(0,214,143,.08)",   bd:"rgba(0,214,143,.18)",   pct:90 },
  { a:"SILVER", v:"BUY↑",    col:"#5AB3E0", bg:"rgba(90,179,224,.07)",  bd:"rgba(90,179,224,.16)",  pct:72 },
  { a:"OIL",    v:"RISING",  col:"#F5A623", bg:"rgba(245,166,35,.07)",  bd:"rgba(245,166,35,.15)",  pct:60 },
  { a:"BTC",    v:"WATCH",   col:"#F7931A", bg:"rgba(247,147,26,.07)",  bd:"rgba(247,147,26,.15)",  pct:48 },
  { a:"EQ",     v:"AVOID↓",  col:"#FF3D6B", bg:"rgba(255,61,107,.08)",  bd:"rgba(255,61,107,.18)",  pct:18 },
  { a:"USD",    v:"UNSTBL",  col:"#8BA3B5", bg:"rgba(139,163,181,.06)", bd:"rgba(139,163,181,.12)", pct:40 },
];

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
  return `${Math.floor(diff/1440)}d ago`;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // Use env keys if available (deployed), else prompt user
  const [keys, setKeys] = useState(
    ENV_TWELVE && ENV_GNEWS ? { twelve: ENV_TWELVE, gnews: ENV_GNEWS } : null
  );

  if (!keys) return <SetupScreen onSave={(t, g) => setKeys({ twelve: t, gnews: g })} />;
  return <Dashboard keys={keys} onReset={() => setKeys(null)} />;
}

function Dashboard({ keys, onReset }) {
  const [cr, setCr]     = useState({});
  const [co, setCo]     = useState(COMM_DEF);
  const [nw, setNw]     = useState([]);
  const [fgi, setFgi]   = useState(null);
  const [cd, setCd]     = useState(TICK_CRYPTO);
  const [lCr, setLCr]   = useState(true);
  const [lCo, setLCo]   = useState(true);
  const [lNw, setLNw]   = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const [upd, setUpd]   = useState(null);
  const tmRef = useRef(), crRef = useRef(), coRef = useRef(), nwRef = useRef();

  // ── load crypto (CoinGecko, no key) ──
  const loadCrypto = useCallback(async () => {
    try {
      setLCr(true);
      const d = await fetchCrypto();
      const m = {};
      for (const [id, meta] of Object.entries(CMETA)) {
        if (d[id]) m[meta.k] = { ...meta, price: d[id].usd, ch: d[id].usd_24h_change, mc: d[id].usd_market_cap };
      }
      setCr(m);
      setErr(null);
    } catch(e) {
      setErr("Crypto: " + e.message);
    } finally { setLCr(false); }
  }, []);

  // ── load commodities (Twelve Data) ──
  const loadCommodities = useCallback(async () => {
    try {
      setLCo(true);
      const { results, quotes, symbols } = await fetchCommodities(keys.twelve);
      const map = { gold: "XAU/USD", silver: "XAG/USD", oil: "WTIUSD", dxy: "DX" };
      const newCo = COMM_DEF.map(c => {
        const sym = map[c.k];
        const idx = symbols.indexOf(sym);
        const price = results[idx]?.price ? parseFloat(results[idx].price) : null;
        const ch = quotes[idx]?.percent_change ? parseFloat(quotes[idx].percent_change) : null;
        return { ...c, price, ch };
      });
      setCo(newCo);
      setErr(null);
    } catch(e) {
      setErr("Commodities: " + e.message);
    } finally { setLCo(false); }
  }, [keys.twelve]);

  // ── load Fear & Greed (Alternative.me) ──
  const loadFGI = useCallback(async () => {
    try {
      const d = await fetchFGI();
      if (d?.value) setFgi(parseInt(d.value));
    } catch {}
  }, []);

  // ── load news (GNews) ──
  const loadNews = useCallback(async () => {
    try {
      setLNw(true);
      const d = await fetchNews(keys.gnews);
      if (d.articles) setNw(d.articles.slice(0, 5));
    } catch(e) {
      setErr("News: " + e.message);
    } finally { setLNw(false); }
  }, [keys.gnews]);

  // ── initial load + schedule ──
  useEffect(() => {
    loadCrypto(); loadCommodities(); loadFGI(); loadNews();

    tmRef.current = setInterval(() => setCd(c => Math.max(0, c - 1)), 1000);
    crRef.current = setInterval(() => { loadCrypto(); loadFGI(); setCd(TICK_CRYPTO); }, TICK_CRYPTO * 1000);
    coRef.current = setInterval(loadCommodities, TICK_COMMOD * 1000);
    nwRef.current = setInterval(loadNews, TICK_NEWS * 1000);
    setUpd(new Date());

    return () => { [tmRef, crRef, coRef, nwRef].forEach(r => clearInterval(r.current)); };
  }, []);

  const doRefresh = useCallback(async () => {
    setBusy(true); setCd(TICK_CRYPTO);
    await Promise.all([loadCrypto(), loadCommodities(), loadFGI(), loadNews()]);
    setUpd(new Date()); setBusy(false);
  }, [loadCrypto, loadCommodities, loadFGI, loadNews]);

  const fgiColor = !fgi ? "#888"
    : fgi < 25 ? "#FF3D6B" : fgi < 45 ? "#F5A623"
    : fgi < 55 ? "#EAB308" : fgi < 75 ? "#84CC16" : "#00D68F";
  const fgiLabel = !fgi ? "LOADING"
    : fgi < 25 ? "EXTREME FEAR" : fgi < 45 ? "FEAR"
    : fgi < 55 ? "NEUTRAL" : fgi < 75 ? "GREED" : "EXTREME GREED";

  const timeStr  = upd ? upd.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" }) : "—";
  const pct      = (cd / TICK_CRYPTO) * 100;
  const cList    = Object.values(cr);
  const gold     = co.find(c => c.k === "gold");
  const btc      = cr.btc;

  const heatItems = [
    { sym:"XAU", ch:co[0]?.ch, col:C.gold   },
    { sym:"XAG", ch:co[1]?.ch, col:C.silver },
    { sym:"WTI", ch:co[2]?.ch, col:C.oil    },
    { sym:"DXY", ch:co[3]?.ch, col:C.dxy    },
    { sym:"BTC", ch:cr.btc?.ch, col:C.btc   },
    { sym:"ETH", ch:cr.eth?.ch, col:C.eth   },
    { sym:"SOL", ch:cr.sol?.ch, col:C.sol   },
    { sym:"XRP", ch:cr.xrp?.ch, col:C.xrp  },
  ];

  return (
    <>
      <style>{css}</style>
      <div className="wrap">
        <div className="glow g1"/><div className="glow g2"/><div className="glow g3"/>
        <div className="grid-bg"/>
        <div className="z1">

          {/* HEADER */}
          <div className="hdr">
            <div className="hdr-l">
              <Logo/>
              <div>
                <div className="brand">MarketPulse</div>
                <div className="brand-sub">Crisis Terminal</div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
              <div className={`live-badge ${busy?"loading":err?"error":""}`}>
                <span className="blink"/>
                {busy ? "SYNC" : err ? "ERR" : "LIVE"}
              </div>
              <div className="hdr-time">{timeStr}</div>
            </div>
          </div>

          {/* ERROR BANNER */}
          {err && <div className="err-banner">⚠ {err} — check API key</div>}

          {/* WAR STRIP */}
          <div className="war-strip">
            <span className="war-tag">DAY 5</span>
            <div className="war-items">
              {[
                {col:"#FF3D6B",txt:"Iran Retaliation"},
                {col:"#F5A623",txt:"Hormuz Watch"},
                {col:"#00D68F",txt:"Navy Escort"},
                {col:"#5AB3E0",txt:"Ceasefire 46%"},
              ].map(c=>(
                <div className="war-chip" key={c.txt}>
                  <div className="wc-dot" style={{background:c.col}}/>{c.txt}
                </div>
              ))}
            </div>
          </div>

          {/* 3 INSTRUMENT GAUGES */}
          <div className="instrument-row">
            <div className="inst" style={{animationDelay:"0s"}}>
              <div className="inst-label">GOLD</div>
              <ArcGauge val={Math.min(gold?.price||0,8000)} max={8000} r={32} stroke={6} size={80}
                color={C.gold} glow
                label={lCo&&!gold?.price?"···":gold?.price?`$${f(gold.price,0)}`:"—"}
                sublabel="XAU/OZ"/>
              <div className="inst-change"><Pill v={gold?.ch} sm/></div>
            </div>
            <div className="inst" style={{animationDelay:".06s",borderColor:"rgba(255,61,107,.18)",background:"rgba(255,61,107,.04)"}}>
              <div className="inst-label" style={{color:"#FF3D6B"}}>CONFLICT</div>
              <ArcGauge val={72} max={100} r={32} stroke={6} size={80} color="#FF3D6B" glow
                label="DAY 5" sublabel="~30D EST"/>
              <div style={{fontSize:8,fontFamily:"'Space Mono',monospace",color:"rgba(255,61,107,.6)",letterSpacing:1,marginTop:4}}>ACTIVE</div>
            </div>
            <div className="inst" style={{animationDelay:".12s"}}>
              <div className="inst-label">BTC</div>
              <ArcGauge val={Math.min(btc?.price||0,150000)} max={150000} r={32} stroke={6} size={80}
                color={C.btc} glow
                label={lCr&&!btc?.price?"···":btc?.price?`$${f(btc.price/1000,0)}K`:"—"}
                sublabel="BITCOIN"/>
              <div className="inst-change"><Pill v={btc?.ch} sm/></div>
            </div>
          </div>

          {/* HEATMAP */}
          <div style={{fontSize:8,fontFamily:"'Space Mono',monospace",letterSpacing:"2.5px",color:"rgba(255,255,255,.2)",textTransform:"uppercase",padding:"4px 14px 6px"}}>
            24H Change Map
          </div>
          <div className="heat-grid">
            {heatItems.map((h,i)=>{
              const loading=(i<4?lCo:lCr)&&h.ch==null;
              const up=(h.ch??0)>=0;
              const intensity=Math.min(Math.abs(h.ch??0)/5,1);
              const bg=h.ch==null?"rgba(255,255,255,.025)":up?`rgba(0,214,143,${.05+intensity*.18})`:`rgba(255,61,107,${.05+intensity*.18})`;
              const bd=h.ch==null?"rgba(255,255,255,.05)":up?`rgba(0,214,143,${.1+intensity*.25})`:`rgba(255,61,107,${.1+intensity*.25})`;
              return (
                <div className="hc" key={h.sym} style={{background:bg,borderColor:bd,animationDelay:`${i*.04}s`}}>
                  <span className="hc-sym">{h.sym}</span>
                  {loading?<div className="hc-loading"/>
                    :<span className="hc-val" style={{color:h.ch==null?"rgba(255,255,255,.2)":up?C.up:C.dn}}>
                      {h.ch==null?"—":`${up?"+":""}${f(h.ch,1)}%`}
                    </span>}
                </div>
              );
            })}
          </div>

          {/* CRYPTO */}
          <div style={{fontSize:8,fontFamily:"'Space Mono',monospace",letterSpacing:"2.5px",color:"rgba(255,255,255,.2)",textTransform:"uppercase",padding:"4px 14px 6px"}}>
            Crypto · Swipe
          </div>
          <div className="cx-row">
            {(lCr&&cList.length===0?Object.values(CMETA):cList).map((c,i)=>{
              const col=C[c.k]||"#888";
              const isL=lCr&&!c.price;
              const up=(c.ch??0)>=0;
              const ps=!isL&&c.price?pf(c.price,c.k):null;
              return (
                <div className="cx" key={c.k} style={{animationDelay:`${i*.05}s`,borderColor:`${col}22`}}>
                  <div className="cx-top">
                    <div className="cx-ico" style={{background:`${col}18`,color:col}}>{c.ico||c.s[0]}</div>
                    {!isL&&<span className={`cx-ch ${c.ch==null?"na":up?"up":"dn"}`}>{c.ch==null?"—":`${up?"+":""}${c.ch.toFixed(1)}%`}</span>}
                  </div>
                  <div className="cx-sym">{c.s}</div>
                  {isL?<div className="cx-loading"/>:(
                    <><div className="cx-price">{ps}</div>
                      <div className="cx-spark"><Spark up={up} w={80} h={18}/></div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* FGI + CEASEFIRE */}
          <div className="gauge-row">
            <div className="gc">
              <div className="gc-head">Fear · Greed</div>
              <ArcGauge val={fgi||20} max={100} r={36} stroke={7} size={90} color={fgiColor} glow
                label={fgi?String(fgi):"···"} sublabel={fgiLabel}/>
              <div className="gc-foot">{fgiLabel}</div>
            </div>
            <div className="gc">
              <div className="gc-head">Ceasefire Odds</div>
              <ArcGauge val={46} max={100} r={36} stroke={7} size={90} color="#5AB3E0" glow
                label="46%" sublabel="BY MAR"/>
              <div className="gc-foot">Polymarket</div>
            </div>
          </div>

          {/* NEWS */}
          <div className="news-wrap">
            <div className="news-head">Live Updates</div>
            <div className="news-stack">
              {lNw&&nw.length===0
                ?[80,62,88,55,72].map((w,i)=>(
                  <div className="skel-row" key={i} style={{borderBottom:i<4?"1px solid rgba(255,255,255,.04)":"none"}}>
                    <div className="skel-dot"/>
                    <div className="skel-lines">
                      <div className="skel-l" style={{width:`${w}%`,animationDelay:`${i*.12}s`}}/>
                      <div className="skel-l" style={{width:"30%",animationDelay:`${i*.12+.1}s`}}/>
                    </div>
                  </div>
                ))
                :nw.map((item,i)=>{
                  const sent = item.sentiment || "neutral";
                  const dotCol = sent==="positive"?"#00D68F":sent==="negative"?"#FF3D6B":"rgba(255,255,255,.18)";
                  const title = item.title || item.text || "";
                  const pub = item.publishedAt || item.time;
                  return (
                    <div className="ni" key={i}
                      style={{animationDelay:`${i*.07}s`,borderBottom:i<nw.length-1?"1px solid rgba(255,255,255,.04)":"none"}}
                      onClick={()=>item.url&&window.open(item.url,"_blank")}>
                      <div className="ni-dot" style={{background:dotCol}}/>
                      <div>
                        <div className="ni-text">{title.length>90?title.slice(0,87)+"…":title}</div>
                        <div className="ni-t">{pub?timeAgo(pub):"Just now"} · {item.source?.name||""}</div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* OUTLOOK */}
          <div className="ol-wrap">
            <div className="ol-head">7-Day Outlook</div>
            <div className="ol-grid">
              {OL.map((o,i)=>(
                <div className="ol-cell" key={o.a} style={{background:o.bg,border:`1px solid ${o.bd}`,animationDelay:`${i*.06}s`}}>
                  <span className="ol-asset">{o.a}</span>
                  <span className="ol-verdict" style={{color:o.col}}>{o.v}</span>
                  <div className="ol-bar" style={{background:o.col,width:`${o.pct}%`}}/>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* BOTTOM BAR */}
        <div className="bot">
          <div className="bot-inner">
            <div className="prog-wrap">
              <div className="prog-top">
                <span>Crypto refresh</span>
                <span style={{color:"#D4901A"}}>{cd}s</span>
              </div>
              <div className="prog-track"><div className="prog-fill" style={{width:`${pct}%`}}/></div>
            </div>
            <button className="settings-btn" onClick={onReset} title="Change API keys">⚙</button>
            <button className="ref-btn" onClick={doRefresh} disabled={busy}>{busy?"···":"↻ Now"}</button>
          </div>
        </div>

      </div>
    </>
  );
}
