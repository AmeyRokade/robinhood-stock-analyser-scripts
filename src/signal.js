/**
 * signal.js
 * On-demand signal engine for Robinhood Stock Analyser.
 *
 * Given a stock symbol, this module:
 *   1. Fetches the live current price + 4-week ago price from Yahoo Finance
 *      (no API key required, uses the public query2 JSON endpoint)
 *   2. Fetches recent RSS headlines from Yahoo Finance for free sentiment scoring
 *   3. Applies the same composite signal logic validated in backtest.py V3:
 *      Momentum + Macro + Sentiment + Short Squeeze -> BUY / HOLD / SELL
 *
 * Exported API:
 *   runSignal(symbol) -> Promise<SignalResult>
 *
 * SignalResult: {
 *   symbol, currentPrice, prevPrice, pctChange,
 *   signal, score, momentum, sentiment, sentimentScore, macro, headlines
 * }
 */

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const YAHOO_QUOTE_URL  = (sym) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1mo`;

const YAHOO_RSS_URL = (sym) =>
  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=US&lang=en-US`;

// ---------------------------------------------------------------------------
// POSITIVE / NEGATIVE word lists for free RSS sentiment
// (mirrors sentiment_free.py)
// ---------------------------------------------------------------------------
const POSITIVE_WORDS = new Set([
  'beat','beats','strong','surge','surges','rally','rallies',
  'gain','gains','rises','rise','up','upgrade','upgraded',
  'outperform','buy','bullish','record','growth','profit',
  'revenue','exceed','exceeds','positive','optimistic','higher',
  'expansion','boom','soar','soars','momentum','breakout','opportunity',
  'undervalued','cheap','attractive','raised','raises','top','best',
]);

const NEGATIVE_WORDS = new Set([
  'miss','misses','weak','decline','declines','fall','falls',
  'drop','drops','down','downgrade','downgraded','underperform',
  'sell','bearish','loss','losses','cut','cuts','concern','concerns',
  'risk','risks','warning','warns','negative','pessimistic','lower',
  'contraction','bust','plunge','plunges','slowdown','overvalued',
  'expensive','disappointing','layoffs','lawsuit','investigation',
  'fraud','recall','crash','tariff','tariffs','fine','penalty',
]);

const NEGATORS     = new Set(['not','no','never','neither','barely','hardly']);
const INTENSIFIERS = new Set(['very','highly','extremely','significantly','sharply']);

// ---------------------------------------------------------------------------
// MACRO SCORE (global context — updated periodically)
// Based on current known macro state as of Apr 2026:
//   - Tariff uncertainty: -1
//   - IMF rate cut trajectory: +1
//   - Iran geopolitical risk: -1
//   - Strong jobs market: +1
//   Net = 0 (balanced)
// This can be updated as macro conditions change.
// ---------------------------------------------------------------------------
const MACRO_SCORE = 0;
const MACRO_LABEL = 'Balanced (tariff risk offset by rate cut outlook)';

// ---------------------------------------------------------------------------
// SENTIMENT SCORER
// ---------------------------------------------------------------------------
function scoreText(text) {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  let score = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let multiplier = 1.0;
    if (i > 0) {
      const prev = words[i - 1];
      if (NEGATORS.has(prev))     multiplier = -1.0;
      else if (INTENSIFIERS.has(prev)) multiplier = 1.5;
    }
    if (POSITIVE_WORDS.has(w)) score += 1.0 * multiplier;
    if (NEGATIVE_WORDS.has(w)) score -= 1.0 * multiplier;
  }
  // Clamp to [-1, +1]
  return Math.max(-1, Math.min(1, score / Math.max(1, words.length / 10)));
}

function classifySentiment(rawScore) {
  if (rawScore >  0.05) return { label: 'POSITIVE', score: rawScore };
  if (rawScore < -0.05) return { label: 'NEGATIVE', score: rawScore };
  return { label: 'NEUTRAL', score: rawScore };
}

// ---------------------------------------------------------------------------
// FETCH HELPERS (GM_xmlhttpRequest wrapped as Promise)
// ---------------------------------------------------------------------------
function gmFetch(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      headers: { 'Accept': 'application/json, text/xml, */*' },
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) resolve(res.responseText);
        else reject(new Error(`HTTP ${res.status} for ${url}`));
      },
      onerror: (err) => reject(err),
      ontimeout: () => reject(new Error('Request timed out')),
      timeout: 10000,
    });
  });
}

// ---------------------------------------------------------------------------
// PRICE FETCHER
// Returns { currentPrice, prevPrice, pctChange }
// currentPrice = latest close, prevPrice = close ~4 weeks ago
// ---------------------------------------------------------------------------
export async function fetchLivePrice(symbol) {
  const text = await gmFetch(YAHOO_QUOTE_URL(symbol));
  const data = JSON.parse(text);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No price data for ${symbol}`);

  const closes = result.indicators?.quote?.[0]?.close || [];
  // Filter out null values
  const validCloses = closes.filter(v => v != null);
  if (validCloses.length < 2) throw new Error(`Insufficient price history for ${symbol}`);

  const currentPrice = validCloses[validCloses.length - 1];
  const prevPrice    = validCloses[0]; // ~4 weeks ago (1mo range, daily)
  const pctChange    = (currentPrice - prevPrice) / prevPrice * 100;

  return { currentPrice, prevPrice, pctChange };
}

// ---------------------------------------------------------------------------
// SENTIMENT FETCHER
// Returns { label, score, headlines[] }
// ---------------------------------------------------------------------------
export async function fetchSentiment(symbol) {
  try {
    const xml = await gmFetch(YAHOO_RSS_URL(symbol));
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    const headlines = items.slice(0, 10).map(item => {
      const title = item.querySelector('title')?.textContent || '';
      const desc  = item.querySelector('description')?.textContent || '';
      return `${title} ${desc}`.trim();
    });
    const combinedText = headlines.join(' ');
    const rawScore = scoreText(combinedText);
    const { label, score } = classifySentiment(rawScore);
    return { label, score, headlines: headlines.slice(0, 5) };
  } catch (e) {
    // Sentiment fetch failed — return neutral, don't block signal
    console.warn(`[Signal] Sentiment fetch failed for ${symbol}:`, e.message);
    return { label: 'NEUTRAL', score: 0, headlines: [] };
  }
}

// ---------------------------------------------------------------------------
// COMPOSITE SIGNAL ENGINE
// Mirrors backtest.py V3 logic:
//   Score = momentum(1/-1/0) + macro(0) + sentiment(1/-1/0) + squeeze(0/1)
//   >= +1 -> BUY | <= -1 -> SELL | else -> HOLD
// ---------------------------------------------------------------------------
function computeSignal({ pctChange, sentimentLabel, hasHighShortInterest }) {
  let score = 0;
  let momentum = 'FLAT';

  // Momentum: >5% bullish, <-5% bearish
  if (pctChange > 5)       { score += 1; momentum = 'BULLISH'; }
  else if (pctChange < -5) { score -= 1; momentum = 'BEARISH'; }

  // Macro overlay (global context)
  score += MACRO_SCORE;

  // Sentiment
  if (sentimentLabel === 'POSITIVE') score += 1;
  if (sentimentLabel === 'NEGATIVE') score -= 1;

  // Short squeeze potential (elevated short interest = contrarian buy signal)
  if (hasHighShortInterest) score += 1;

  let signal;
  if (score >= 1)       signal = 'BUY';
  else if (score <= -1) signal = 'SELL';
  else                  signal = 'HOLD';

  return { signal, score, momentum };
}

// ---------------------------------------------------------------------------
// MAIN EXPORTED FUNCTION
// ---------------------------------------------------------------------------
/**
 * runSignal(symbol) -> Promise<SignalResult>
 *
 * Fetches live price + sentiment for `symbol` and returns a full signal.
 * Short interest flag is set automatically for known high-SI tickers;
 * users can override in future versions.
 */
export async function runSignal(symbol) {
  const sym = symbol.toUpperCase().trim();

  // Known high short-interest tickers (from backtest validation)
  const HIGH_SHORT_INTEREST = new Set(['AMD','GOOGL','AVGO','RIVN','BYND','GME','AMC']);

  // Fetch price and sentiment in parallel
  const [priceData, sentimentData] = await Promise.all([
    fetchLivePrice(sym),
    fetchSentiment(sym),
  ]);

  const { signal, score, momentum } = computeSignal({
    pctChange:          priceData.pctChange,
    sentimentLabel:     sentimentData.label,
    hasHighShortInterest: HIGH_SHORT_INTEREST.has(sym),
  });

  return {
    symbol:        sym,
    currentPrice:  priceData.currentPrice,
    prevPrice:     priceData.prevPrice,
    pctChange:     priceData.pctChange,
    signal,
    score,
    momentum,
    sentiment:     sentimentData.label,
    sentimentScore: sentimentData.score,
    macro:         MACRO_LABEL,
    headlines:     sentimentData.headlines,
  };
}
