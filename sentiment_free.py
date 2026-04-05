"""
sentiment_free.py
Free sentiment analysis using Yahoo Finance RSS + Google News RSS.
No API keys required. Install: pip install feedparser
"""

import feedparser
import re
import time
from datetime import datetime, timezone
from urllib.parse import quote

# ── Simple rule-based word lists ──────────────────────────────────────────────

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


# ── Feed fetchers ─────────────────────────────────────────────────────────────

def _fetch_yahoo_rss(ticker: str, max_items: int = 15) -> list:
    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
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


# ── Public API ────────────────────────────────────────────────────────────────

def get_sentiment(ticker: str, verbose: bool = False) -> dict:
    """
    Fetch and score recent news for *ticker*.
    Returns dict with avg_score, label, counts, top_headlines.
    """
    articles = []
    articles += _fetch_yahoo_rss(ticker)
    time.sleep(0.3)
    articles += _fetch_google_news_rss(ticker)

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
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    scored = []
    for a in articles:
        combined = f"{a['title']} {a['summary']}"
        s = _score_text(combined)
        scored.append({**a, "score": s, "label": _label(s)})

    if verbose:
        print(f"\n{'---'*20}")
        print(f"  Sentiment for {ticker}  ({len(scored)} articles)")
        print(f"{'---'*20}")
        for a in scored[:10]:
            print(f"  [{a['label']:8s}  {a['score']:+.2f}]  {a['title'][:72]}")

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
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def get_sentiment_batch(tickers: list, verbose: bool = False) -> dict:
    """Run get_sentiment for a list of tickers. Returns {ticker: sentiment_dict}."""
    results = {}
    for ticker in tickers:
        results[ticker] = get_sentiment(ticker, verbose=verbose)
        time.sleep(0.5)
    return results


# ── Example usage ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Single ticker
    result = get_sentiment("AAPL", verbose=True)
    print(result)

    # Batch
    watchlist = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"]
    sentiments = get_sentiment_batch(watchlist, verbose=True)
    for t, s in sentiments.items():
        print(f"{t:6s}  {s['label']:8s}  score={s['avg_score']:+.3f}  articles={s['article_count']}")
