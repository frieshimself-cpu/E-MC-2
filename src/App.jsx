import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TOTAL_SUPPLY = 1e9;
const MINT = "GX1HiPYh54o4cdPUqoeAYGC8dnhNqc3h7CtJQ8ySpump";
const LAUNCH_TS = 1780759108439;
const COMPOUND_MINUTES = 10;

const PUMP_URL = `https://pump.fun/coin/${MINT}`;
const DEX_URL = `https://dexscreener.com/solana/${MINT}`;
const BUY_URL = PUMP_URL;

const EQUATION_CARDS = [
  {
    sym: "E",
    name: "Energy",
    eq: "the market cap",
    body: "The whole thing — the number everyone watches. It is what mass and attention produce together.",
    tone: "yellow",
  },
  {
    sym: "M",
    name: "Mass",
    eq: "the liquidity",
    body: "The floor. Heavy, hard to move. Every 10 minutes the fees add more — the mass only ever grows.",
    tone: "cyan",
  },
  {
    sym: "C²",
    name: "Attention²",
    eq: "the multiplier",
    body: "The crowd, squared. One meme reaches one timeline; a thousand reach the whole market. Attention compounds.",
    tone: "pink",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Trade",
    body: "Every buy and sell of $EMC2 pays a pump.fun creator fee. Energy in.",
  },
  {
    n: "02",
    title: "Claim",
    body: "Every 10 minutes the bot claims 100% of the accumulated creator fees.",
  },
  {
    n: "03",
    title: "Compound",
    body: "Those fees go straight back into liquidity. The mass increases — automatically.",
  },
  {
    n: "04",
    title: "Floor rises",
    body: "Deeper liquidity, stronger floor. Then it does it again. And again. Forever.",
  },
];

const TAPE_ITEMS = [
  "LIQUIDITY = MASS",
  "ATTENTION = THE MULTIPLIER",
  "100% OF FEES → LIQUIDITY",
  "EVERY 10 MINUTES",
  "THE MASS ONLY GROWS",
  "E = MC²",
];

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtUsd(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Number(v);
  return n >= 1e9
    ? "$" + (n / 1e9).toFixed(2) + "B"
    : n >= 1e6
      ? "$" + (n / 1e6).toFixed(2) + "M"
      : n >= 1e3
        ? "$" + (n / 1e3).toFixed(1) + "K"
        : n > 0 && n < 0.01
          ? "$" + n.toFixed(6)
          : "$" + n.toFixed(2);
}

function fmtInt(v) {
  return isNaN(v) ? "—" : Math.round(Number(v)).toLocaleString("en-US");
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Number(v);
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const LIVE = !!MINT;

async function fetchMarket(mints) {
  if (!mints || !mints.length) return {};
  try {
    const res = await fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mints }),
    });
    return res.ok ? (await res.json()).tokens || {} : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Tape
// ---------------------------------------------------------------------------

function Tape() {
  const items = [...TAPE_ITEMS, ...TAPE_ITEMS, ...TAPE_ITEMS, ...TAPE_ITEMS];
  return (
    <div className="tape" aria-hidden="true">
      <div className="tape__track">
        {items.map((item, i) => (
          <span className="tape__item" key={i}>
            {item}
            <span className="tape__star">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function Nav() {
  return (
    <header className="nav">
      <div className="container nav__inner">
        <a className="nav__brand" href="#top">
          <img src="/logo.png" alt="E=MC²" className="nav__logo" />
          <span className="nav__word">E=MC²</span>
        </a>
        <nav className="nav__links">
          <a href="#equation">The equation</a>
          <a href="#reactor">The reactor</a>
          <a href="#how">How it works</a>
        </nav>
        <div className="nav__actions">
          <a className="nav__buy" href={BUY_URL} target="_blank" rel="noreferrer">
            Buy $EMC2
          </a>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ market }) {
  const mcap = market?.mcap;
  const liq = market?.liq;
  const chg = market?.chg;
  return (
    <section className="hero" id="top">
      <div className="container hero__inner">
        <div className="hero__copy">
          <div className="eyebrow">the most famous equation, on-chain</div>
          <h1 className="hero__title">
            Liquidity is the <span className="hl-cyan">mass.</span>
            <br />
            Attention is the <span className="hl-pink">multiplier.</span>
          </h1>
          <p className="hero__sub">
            $EMC2 turns <b>E = mc²</b> into a coin. 100% of creator fees are
            compounded back into liquidity <b>every 10 minutes</b> — the mass
            only grows, so the floor only rises.
          </p>
          <div className="hero__cta">
            <a
              className="btn btn--primary"
              href={BUY_URL}
              target="_blank"
              rel="noreferrer"
            >
              Buy $EMC2
            </a>
            <a className="btn btn--ghost" href="#reactor">
              See the reactor
            </a>
          </div>
          <div className="hero__stats">
            <div className="hstat">
              <span className="hstat__k">Mass · liquidity</span>
              <span className="hstat__v hl-cyan">
                {liq != null ? fmtUsd(liq) : "soon"}
              </span>
            </div>
            <div className="hstat">
              <span className="hstat__k">Energy · mcap</span>
              <span className="hstat__v">
                {mcap != null ? fmtUsd(mcap) : "soon"}
              </span>
            </div>
            <div className="hstat">
              <span className="hstat__k">24h</span>
              <span className={"hstat__v " + (chg >= 0 ? "up" : "down")}>
                {chg != null ? fmtPct(chg) : "—"}
              </span>
            </div>
          </div>
        </div>
        <div className="hero__art">
          <div className="hero__chalkring" aria-hidden="true" />
          <img
            className="hero__logo"
            src="/logo.png"
            alt="E = mc² written in chalk"
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useInView(threshold = 0.16) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function useCountUp(target, { duration = 1600, start = false } = {}) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let t0 = 0;
    const tick = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, start]);
  return value;
}

// ---------------------------------------------------------------------------
// Equation
// ---------------------------------------------------------------------------

function Equation() {
  const [ref, inView] = useInView(0.15);
  return (
    <section className="section equation" id="equation" ref={ref}>
      <div className="container">
        <div
          className="section__head"
          style={{ maxWidth: "760px", marginInline: "auto", textAlign: "center" }}
        >
          <div className="eyebrow">the whole story, in one equation</div>
        </div>
        <div className="eq__hero">
          E = M<span className="hl-cyan">C</span>
          <sup className="hl-pink">2</sup>
        </div>
        <p className="eq__legend">
          <span className="hl">Energy</span> ={" "}
          <span className="hl-cyan">Mass</span> ×{" "}
          <span className="hl-pink">Attention²</span>
        </p>
        <div className={"eq__grid " + (inView ? "is-in" : "")}>
          {EQUATION_CARDS.map((card, i) => (
            <div
              className={"eq__card reveal tone-" + card.tone}
              style={{ animationDelay: i * 0.08 + "s" }}
              key={card.sym}
            >
              <div
                className="eq__sym"
                dangerouslySetInnerHTML={{
                  __html: card.sym.replace("²", "<sup>2</sup>"),
                }}
              />
              <div className="eq__name">{card.name}</div>
              <div className="eq__eq">= {card.eq}</div>
              <p className="eq__body">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reactor
// ---------------------------------------------------------------------------

function secsToNextCompound(minutes) {
  const interval = minutes * 60 * 1e3;
  const now = Date.now();
  const next = Math.ceil(now / interval) * interval;
  return Math.max(0, Math.round((next - now) / 1e3));
}

function compoundsSince(ts, minutes) {
  return Math.max(0, Math.floor((Date.now() - ts) / (minutes * 60 * 1e3)));
}

function fmtClock(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function CountStat({ value, placeholder, format, start, cls }) {
  const isNum = typeof value === "number";
  const v = useCountUp(isNum ? value : 0, { start });
  return <div className={"rstat__v " + (cls || "")}>{isNum ? format(v) : placeholder}</div>;
}

function Reactor({ market, stats }) {
  const [ref, inView] = useInView(0.2);
  const [secs, setSecs] = useState(() => secsToNextCompound(COMPOUND_MINUTES));
  useEffect(() => {
    const id = setInterval(() => setSecs(secsToNextCompound(COMPOUND_MINUTES)), 1e3);
    return () => clearInterval(id);
  }, []);
  const liq = market?.liq;
  const mcap = market?.mcap;
  const compounds =
    stats?.compounds != null
      ? stats.compounds
      : compoundsSince(LAUNCH_TS, COMPOUND_MINUTES);
  const compoundsSub =
    stats?.solCompounded != null
      ? `${stats.solCompounded} SOL added`
      : "since launch";
  return (
    <section className="section section--dark reactor" id="reactor" ref={ref}>
      <div className="container">
        <div className="section__head">
          <div className="eyebrow eyebrow--cyan">the reactor · live</div>
          <h2 className="section__title">
            <span className="hl">100%</span> of fees → liquidity.{" "}
            <span className="hl-cyan">Every {COMPOUND_MINUTES} minutes.</span>
          </h2>
          <p className="section__sub">
            The mass is read straight off the chain — it only moves one way. The
            next compound counts down live; when it hits zero, the fees go back
            into the floor.
          </p>
        </div>
        <div className={"reactor__grid " + (inView ? "is-in" : "")}>
          <div className="rstat rstat--lead reveal">
            <CountStat value={liq} placeholder="soon" format={fmtUsd} start={inView} />
            <div className="rstat__k">Mass · liquidity</div>
            <div className="rstat__sub">the on-chain floor</div>
          </div>
          <div className="rstat reveal" style={{ animationDelay: ".08s" }}>
            <CountStat value={mcap} placeholder="soon" format={fmtUsd} start={inView} />
            <div className="rstat__k">Energy · market cap</div>
            <div className="rstat__sub">E = mc²</div>
          </div>
          <div className="rstat reveal" style={{ animationDelay: ".16s" }}>
            <div className="rstat__v count">{fmtClock(secs)}</div>
            <div className="rstat__k">Next compound</div>
            <div className="rstat__sub">every {COMPOUND_MINUTES} min</div>
          </div>
          <div className="rstat reveal" style={{ animationDelay: ".24s" }}>
            <CountStat
              value={compounds ?? 0}
              placeholder="—"
              format={(v) => Math.round(v).toLocaleString("en-US")}
              start={inView}
              cls="count"
            />
            <div className="rstat__k">Compounds</div>
            <div className="rstat__sub">{compoundsSub}</div>
          </div>
        </div>
        <div className="reactor__note">
          <span className="reactor__pulse" />
          {market ? "live from the chain" : "waiting for launch"}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  const [ref, inView] = useInView(0.15);
  return (
    <section className="section steps" id="how" ref={ref}>
      <div className="container">
        <div className="section__head">
          <div className="eyebrow eyebrow--cyan">how the mass grows</div>
          <h2 className="section__title">
            A reactor that never <span className="hl">cools down.</span>
          </h2>
          <p className="section__sub">
            No team wallet. No discretion. Every {COMPOUND_MINUTES} minutes the
            same four steps run on their own — and the floor is a little higher
            than it was before.
          </p>
        </div>
        <div className={"steps__grid " + (inView ? "is-in" : "")}>
          {STEPS.map((step, i) => (
            <div
              className="step reveal"
              style={{ animationDelay: i * 0.08 + "s" }}
              key={step.n}
            >
              <span className="step__n">{step.n}</span>
              <h3 className="step__t">{step.title}</h3>
              <p className="step__b">{step.body}</p>
              {i < STEPS.length - 1 && (
                <span className="step__arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why it holds
// ---------------------------------------------------------------------------

const WHY_CARDS = [
  {
    n: "01",
    t: "The floor only rises",
    b: "Liquidity is never withdrawn — only added to. Every 10 minutes the creator fees deepen it. The mass is a one-way ratchet, and a heavier coin is harder to dump.",
  },
  {
    n: "02",
    t: "Nothing to trust",
    b: "No team wallet decides anything. The fees are claimed and compounded on a fixed 30-minute clock, on-chain, in the open. You can watch the liquidity number go up live, right here.",
  },
  {
    n: "03",
    t: "A story anyone gets",
    b: "E = mc². Mass is liquidity, attention is the multiplier, market cap is the energy. One line, instantly understood, endlessly shareable — the attention does the squaring.",
  },
];

function Why() {
  const [ref, inView] = useInView(0.15);
  return (
    <section className="section section--dark why" id="why" ref={ref}>
      <div className="container">
        <div className="section__head">
          <div className="eyebrow eyebrow--pink">why it holds</div>
          <h2 className="section__title">
            Simple to grasp. <span className="hl">Hard to move.</span>
          </h2>
        </div>
        <div className={"why__grid " + (inView ? "is-in" : "")}>
          {WHY_CARDS.map((card, i) => (
            <div
              className="why__card reveal"
              style={{ animationDelay: i * 0.09 + "s" }}
              key={card.n}
            >
              <span className="why__n">{card.n}</span>
              <h3 className="why__t">{card.t}</h3>
              <p className="why__b">{card.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Buy CTA
// ---------------------------------------------------------------------------

function BuyCta() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <section className="section cta" id="buy">
      <div className="container">
        <div className="cta__box">
          <div className="eyebrow">join the experiment</div>
          <h2 className="cta__title">
            Add to the <span className="hl-cyan">mass.</span>
          </h2>
          <p className="cta__sub">
            Every trade pays a fee, and every fee comes back as liquidity. Buy
            $EMC2, and the floor you stand on gets heavier every 10 minutes.
          </p>
          <button className="cta__ca" onClick={copy} disabled={!LIVE} type="button">
            <span className="cta__ca-k">CONTRACT</span>
            <span className="cta__ca-v">{LIVE ? MINT : "drops at launch"}</span>
            {LIVE && (
              <span className="cta__ca-copy">{copied ? "copied!" : "copy"}</span>
            )}
          </button>
          <div className="cta__row">
            <a
              className="btn btn--primary btn--lg"
              href={BUY_URL}
              target="_blank"
              rel="noreferrer"
            >
              Buy on pump.fun
            </a>
            <a
              className="btn btn--ghost btn--lg"
              href={DEX_URL}
              target="_blank"
              rel="noreferrer"
            >
              View the chart
            </a>
          </div>
          <div className="cta__facts">
            <div className="cta__fact">
              <b>{fmtInt(TOTAL_SUPPLY)}</b>
              <span>total supply</span>
            </div>
            <div className="cta__fact">
              <b>100%</b>
              <span>fees → liquidity</span>
            </div>
            <div className="cta__fact">
              <b>{COMPOUND_MINUTES} min</b>
              <span>compound cycle</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="foot">
      <div className="container">
        <div className="foot__grid">
          <div className="foot__brand-col">
            <div className="foot__brand">
              <img src="/logo.png" alt="E=MC²" />
              <span>E=MC²</span>
            </div>
            <p className="foot__disclaim">
              {`$EMC2 is a community memecoin on Solana with a single mechanic: 100% of its pump.fun creator fees are claimed and compounded back into the token's liquidity every 10 minutes. "Liquidity is mass / attention is the multiplier" is a narrative framing, not a law of physics or a promise of returns. $EMC2 is not affiliated with anyone, and nothing here is financial advice. Memecoins are highly speculative and volatile — no profit or future value is implied. Only spend what you can afford to lose.`}
            </p>
          </div>
          <div className="foot__links">
            <a href={PUMP_URL} target="_blank" rel="noreferrer">
              pump.fun
            </a>
            <a href={DEX_URL} target="_blank" rel="noreferrer">
              DexScreener
            </a>
            <a href="#equation">The equation</a>
            <a href="#reactor">The reactor</a>
          </div>
        </div>
        <div className="foot__rule">
          E = MC² · LIQUIDITY IS THE MASS · 100% OF FEES → LIQUIDITY EVERY 10
          MIN · NOT FINANCIAL ADVICE · DYOR
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [market, setMarket] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!LIVE) return;
    let stale = false;
    const load = () =>
      fetchMarket([MINT]).then((tokens) => {
        if (!stale && tokens && tokens[MINT]) setMarket(tokens[MINT]);
      });
    load();
    const id = setInterval(load, 2e4);
    return () => {
      stale = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let stale = false;
    const load = () =>
      fetch("/api/stats")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!stale && json) setStats(json);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 3e4);
    return () => {
      stale = true;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <Tape />
      <Nav />
      <main>
        <Hero market={market} />
        <Equation />
        <Reactor market={market} stats={stats} />
        <HowItWorks />
        <Why />
        <BuyCta />
      </main>
      <Footer />
    </>
  );
}
