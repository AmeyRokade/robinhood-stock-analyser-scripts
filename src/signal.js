/**
 * signal.js
 * On-demand signal engine for Robinhood Stock Analyser.
 * Improved with RSI(14) and EMA(20).
 */

const YAHOO_QUOTE_URL = (sym) => 
  `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1mo`;
const YAHOO_RSS_URL = (sym) => 
  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=US&lang=en-US`;

const POSITIVE_WORDS = new Set(['beat','beats','strong','surge','surges','rally','rallies','gain','gains','rises','rise','up','upgrade','upgraded','outperform','buy','bullish','record','growth','profit','revenue','exceed','exceeds','positive','optimistic','higher','expansion','boom','soar','soars','momentum','breakout','opportunity','undervalued','cheap','attractive','raised','raises','top','best']);
const NEGATIVE_WORDS = new Set(['miss','misses','weak','decline','declines','fall','falls','drop','drops','down','downgrade','downgraded','underperform','sell','bearish','loss','losses','cut','cuts','concern','concerns','risk','risks','warning','warns','negative','pessimistic','lower','contraction','bust','plunge','plunges','slowdown','overvalued','expensive','disappointing','layoffs','lawsuit','investigation','fraud','recall','crash','tariff','tariffs','fine','penalty']);
const NEGATORS = new Set(['not','no','never','neither','barely','hardly']);
const INTENSIFIERS = new Set(['very','highly','extremely','significantly','sharply']);

const MACRO_SCORE = 0;
const MACRO_LABEL = 'Balanced (tariff risk offset by rate cut outlook)';

function scoreText(text) {
  const words = text.toLowerCase().match(/\\b\\w+\\b/g) || [];
  let score = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let multiplier = 1.0;
    if (i > 0) {
      const prev = words[i - 1];
      if (NEGATORS.has(prev)) multiplier = -1.0;
      else if (INTENSIFIERS.has(prev)) multiplier = 1.5;
    }
    if (POSITIVE_WORDS.has(w)) score += 1.0 * multiplier;
    if (NEGATIVE_WORDS.has(w)) score -= 1.0 * multiplier;
  }
  return Math.max(-1, Math.min(1, score / Math.max(1, words.length / 10)));
}

function classifySentiment(rawScore) {
  if (rawScore > 0.05) return { label: 'POSITIVE', score: rawScore };
  if (rawScore < -0.05) return { label: 'NEGATIVE', score: rawScore };
  return { label: 'NEUTRAL', score: rawScore };
}

function calculateRSI(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(closes, period) {
  if (closes.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = (closes[i] * k) + (ema * (1 - k));
  }
  return ema;
}

function gmFetch(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET', url, headers: { 'Accept': 'application/json, text/xml, */*' },
      onload: (res) => { if (res.status >= 200 && res.status < 300) resolve(res.responseText); else reject(new Error(\`HTTP \${res.status}\`)); },
      onerror: reject, ontimeout: () => reject(new Error('Timeout')), timeout: 10000,
    });
  });
}

export async function fetchLivePrice(symbol) {
  const text = await gmFetch(YAHOO_QUOTE_URL(symbol));
  const data = JSON.parse(text);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(\`No price data\`);
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => v != null);
  if (closes.length < 2) throw new Error(\`Insufficient history\`);
  const currentPrice = closes[closes.length - 1];
  const prevPrice = closes[0];
  const pctChange = (currentPrice - prevPrice) / prevPrice * 100;
  const rsi = calculateRSI(closes, 14);
  const ema20 = calculateEMA(closes, 20);
  return { currentPrice, prevPrice, pctChange, rsi, ema20, closes };
}

export async function fetchSentiment(symbol) {
  try {
    const xml = await gmFetch(YAHOO_RSS_URL(symbol));
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    const headlines = items.slice(0, 10).map(i => (i.querySelector('title')?.textContent || '') + ' ' + (i.querySelector('description')?.textContent || '')).map(t => t.trim());
    const rawScore = scoreText(headlines.join(' '));
    const { label, score } = classifySentiment(rawScore);
    return { label, score, headlines: headlines.slice(0, 5) };
  } catch (e) { return { label: 'NEUTRAL', score: 0, headlines: [] }; }
}

function computeSignal({ pctChange, rsi, ema20, currentPrice, sentimentLabel, hasHighShortInterest }) {
  let score = 0;
  let momentum = 'FLAT';
  if (pctChange > 5) { score += 1; momentum = 'BULLISH'; }
  else if (pctChange < -5) { score -= 1; momentum = 'BEARISH'; }
  
  let rsiLabel = 'NEUTRAL';
  if (rsi < 35) { score += 1; rsiLabel = 'OVERSOLD'; }
  else if (rsi > 65) { score -= 1; rsiLabel = 'OVERBOUGHT'; }

  const emaSignal = currentPrice > ema20 ? 1 : -1;
  score += emaSignal;

  score += MACRO_SCORE;
  if (sentimentLabel === 'POSITIVE') score += 1;
  if (sentimentLabel === 'NEGATIVE') score -= 1;
  if (hasHighShortInterest) score += 1;

  let signal = score >= 2 ? 'BUY' : (score <= -2 ? 'SELL' : 'HOLD');
  return { signal, score, momentum, rsiLabel, rsiValue: rsi, emaLabel: currentPrice > ema20 ? 'ABOVE EMA20' : 'BELOW EMA20' };
}

export async function runSignal(symbol) {
  const sym = symbol.toUpperCase().trim();
  const HIGH_SHORT_INTEREST = new Set(['AMD','GOOGL','AVGO','RIVN','BYND','GME','AMC']);
  const [p, s] = await Promise.all([fetchLivePrice(sym), fetchSentiment(sym)]);
  const sig = computeSignal({ pctChange: p.pctChange, rsi: p.rsi, ema20: p.ema20, currentPrice: p.currentPrice, sentimentLabel: s.label, hasHighShortInterest: HIGH_SHORT_INTEREST.has(sym) });
  return {
    symbol: sym, currentPrice: p.currentPrice, prevPrice: p.prevPrice, pctChange: p.pctChange,
    signal: sig.signal, score: sig.score, momentum: sig.momentum,
    rsi: \`\${sig.rsiValue.toFixed(1)} (\${sig.rsiLabel})\`,
    ema: sig.emaLabel,
    sentiment: s.label, sentimentScore: s.score, macro: MACRO_LABEL, headlines: s.headlines,
  };
}
