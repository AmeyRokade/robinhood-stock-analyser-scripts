"""
sentiment_free.py
Free sentiment analysis using Yahoo Finance RSS + Google News RSS.
No API keys required. Install: pip install feedparser yfinance

V2: Enhanced with momentum, sentiment saturation, mean reversion dampening
"""

import feedparser
import re
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import quote

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    print("Warning: yfinance not installed. Momentum signals disabled.")
    print("Install: pip install yfinance")

# ── Simple rule-based word lists ────────────────────────────────────────────────

POSITIVE_WORDS = {
    "beat", "beats", "strong", "surge", "surges", "rally", "rallies",
    "gain", "gains", "rises", "rise", "up", "upgrade", "upgraded",
    "outperform", "buy", "bullish", "record", "growth", "profit",
    "revenue", "exceed", "exceeds", "positive", "optimistic", "higher",
    "expansion", "boom", "soar", "soars", "momentum", "breakout",
    "opportunity", "undervalued", "cheap", "attractive",
}

NEGATIVE_WORDS = {
    "miss", "misses", "weak", "decline", "declines", "fall", "falls",
    "drop", "drops", "down", "downgrade", "downgraded", "underperform",
    "sell", "bearish", "loss", "losses", "cut", "cuts", "concern",
    "concerns", "risk", "risks", "warning", "warns", "negative",
    "pessimistic", "lower", "contraction", "bust", "plunge", "plunges",
    "slowdown", "overvalued", "expensive", "disappointing", "layoffs",
    "lawsuit", "investigation", "fraud", "recall", "crash",
}

INTENSIFIERS = {"very", "highly", "extremely", "significantly", "sharply"}
NEGATORS = {"not", "no", "never", "neither", "barely", "hardly"}


def _score_text(text: str) -> float:
    """Lightweight rule-based sentiment score in [-1, +1]."""
    words = re.findall(r"\b\w+\b", text.lower())
    score = 0
    i = 0
    while i < len(words):
        w = words[i]
        multiplier = 1.0
        if i > 0:
            prev = words[i - 1]
            if prev in NEGATORS:
                multiplier *= -1.0
            elif prev in INTENSIFIERS:
                multiplier *= 1.5
        if w in POSITIVE_WORDS:
            score += 1.0 * multiplier
        elif w in NEGATIVE_WORDS:
            score -= 1.0 * multiplier
        i += 1

    if score == 0:
        return 0.0
    cap = max(abs(score), 1)
    return max(-1.0, min(1.0, score / cap))


def _label(score: float) -> str:
    if score > 0.15:
        return "POSITIVE"
    if score < -0.15:
        return "NEGATIVE"
    return "NEUTRAL"


# ── Feed fetchers ───────────────────────────────────────────────────────────────

def _fetch_yahoo_rss(ticker: str, max_items: int = 15) -> list:
    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}®ion=US&lang=en-US"
    feed = feedparser.parse(url)
    items = []
    for entry in feed.entries[:max_items]:
        items.append({
            "source": "Yahoo Finance",
            "title": entry.get("title", ""),
            "summary": entry.get("summary", ""),
            "published": entry.get("published", ""),
            "link": entry.get("link", ""),
        })
    return items


def _fetch_google_news_rss(ticker: str, max_items: int = 15) -> list:
    query = quote(f"{ticker} stock")
    url = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
    feed = feedparser.parse(url)
    items = []
    for entry in feed.entries[:max_items]:
        items.append({
            "source": "Google News",
            "title": entry.get("title", ""),
            "summary": entry.get("summary", ""),
            "published": entry.get("published", ""),
            "link": entry.get("link", ""),
        })
    return items


# ── Momentum / Price History (yfinance) ─────────────────────────────────────────

def get_momentum_signals(ticker: str) -> dict:
    """
    Fetch 60-day price history and compute:
      - pct_off_52w_high: % below 52-week high (negative = stock down from peak)
      - pct_change_30d: 30-day price change %
      - pct_change_60d: 60-day price change %
    Returns dict or None if yfinance unavailable.
    """
    if not YFINANCE_AVAILABLE:
        return None

    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1y")  # fetch 1 year for 52w high
        if hist.empty:
            return None

        current_price = hist['Close'].iloc[-1]
        high_52w = hist['Close'].max()

        pct_off_high = ((current_price - high_52w) / high_52w) * 100

        # 30-day and 60-day price change
        if len(hist) >= 30:
            price_30d_ago = hist['Close'].iloc[-30]
            pct_change_30d = ((current_price - price_30d_ago) / price_30d_ago) * 100
        else:
            pct_change_30d = 0.0

        if len(hist) >= 60:
            price_60d_ago = hist['Close'].iloc[-60]
            pct_change_60d = ((current_price - price_60d_ago) / price_60d_ago) * 100
        else:
            pct_change_60d = 0.0

        return {
            "current_price": round(current_price, 2),
            "high_52w": round(high_52w, 2),
            "pct_off_52w_high": round(pct_off_high, 2),
            "pct_change_30d": round(pct_change_30d, 2),
            "pct_change_60d": round(pct_change_60d, 2),
        }
    except Exception as e:
        print(f"Error fetching momentum for {ticker}: {e}")
        return None


# ── Public API ──────────────────────────────────────────────────────────────────

def get_sentiment(ticker: str, verbose: bool = False) -> dict:
    """
    Fetch and score recent news for *ticker*.
    Returns dict with avg_score, label, counts, top_headlines, momentum signals.
    """
    articles = []
    articles += _fetch_yahoo_rss(ticker)
    time.sleep(0.3)
    articles += _fetch_google_news_rss(ticker)

    # Fetch momentum signals
    momentum = get_momentum_signals(ticker)

    if not articles:
        return {
            "ticker": ticker,
            "article_count": 0,
            "avg_score": 0.0,
            "label": "NEUTRAL",
            "positive_count": 0,
            "neutral_count": 0,
            "negative_count": 0,
            "top_headlines": [],
            "momentum": momentum,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    scored = []
    for a in articles:
        combined = f"{a['title']} {a['summary']}"
        s = _score_text(combined)
        scored.append({**a, "score": s, "label": _label(s)})

    if verbose:
        print(f"\n{'---'*20}")
        print(f" Sentiment for {ticker} ({len(scored)} articles)")
        print(f"{'---'*20}")
        for a in scored[:10]:
            print(f" [{a['label']:8s} {a['score']:+.2f}] {a['title'][:72]}")

    avg_score = sum(a["score"] for a in scored) / len(scored)
    pos = sum(1 for a in scored if a["label"] == "POSITIVE")
    neu = sum(1 for a in scored if a["label"] == "NEUTRAL")
    neg = sum(1 for a in scored if a["label"] == "NEGATIVE")

    return {
        "ticker": ticker,
        "article_count": len(scored),
        "avg_score": round(avg_score, 4),
        "label": _label(avg_score),
        "positive_count": pos,
        "neutral_count": neu,
        "negative_count": neg,
        "top_headlines": [a["title"] for a in scored[:5]],
        "momentum": momentum,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def get_sentiment_batch(tickers: list, verbose: bool = False) -> dict:
    """Run get_sentiment for a list of tickers. Returns {ticker: sentiment_dict}."""
    results = {}
    for ticker in tickers:
        results[ticker] = get_sentiment(ticker, verbose=verbose)
        time.sleep(0.5)
    return results


# ── Example usage ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Single ticker
    result = get_sentiment("AAPL", verbose=True)
    print(result)

    # Batch
    watchlist = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"]
    sentiments = get_sentiment_batch(watchlist, verbose=True)
    for t, s in sentiments.items():
        print(f"{t:6s} {s['label']:8s} score={s['avg_score']:+.3f} articles={s['article_count']}")
        if s['momentum']:
            m = s['momentum']
            print(f"       Momentum: {m['pct_off_52w_high']:+.1f}% off high | 30d: {m['pct_change_30d']:+.1f}% | 60d: {m['pct_change_60d']:+.1f}%")
