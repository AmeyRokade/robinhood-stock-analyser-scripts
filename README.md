# Robinhood Stock Ratings & Fair Value Fetcher

A Tampermonkey userscript that fetches analyst ratings and Morningstar fair value data for all stocks on your Robinhood portfolio/watchlist and exports them to Excel. Also includes a free Python sentiment analysis module powered by Yahoo Finance and Google News RSS feeds.

## Features

- Intercepts Robinhood's API calls to capture instrument IDs automatically
- Fetches analyst buy/hold/sell ratings for all captured stocks
- Fetches Morningstar fair value, star rating, economic moat, uncertainty, and stewardship
- Calculates Potential Profit/Loss % vs current price
- Exports everything to a formatted Excel file
- Free sentiment analysis via `sentiment_free.py` (no API key needed)
- Keyboard shortcut `Ctrl+Shift+R` to toggle the UI panel

## Project Structure

```
robinhood-stock-analyser-scripts/
├── src/
│   ├── main.js          # Entry point
│   ├── api.js           # Robinhood API calls
│   ├── auth.js          # Auth token interceptor
│   ├── config.js        # Constants
│   ├── data.js          # Data compilation
│   ├── excel.js         # Excel export
│   ├── ui.js            # Floating UI panel
│   └── utils.js         # Helpers
├── build/
│   └── script.user.js   # Built userscript (auto-generated)
├── sentiment_free.py    # Free Python sentiment module
├── requirements.txt     # Python dependencies
├── build.js             # esbuild build script
└── package.json
```

## Userscript Setup

### Option 1: Install pre-built script (easiest)

Install [Tampermonkey](https://www.tampermonkey.net/) and click:

```
https://raw.githubusercontent.com/AmeyRokade/robinhood-stock-analyser-scripts/main/build/script.user.js
```

### Option 2: Build from source

```bash
npm install
npm run build
```

Then install `build/script.user.js` in Tampermonkey.

## Usage

1. Navigate to `robinhood.com` and log in
2. Browse your portfolio or watchlist (this triggers the API calls)
3. Click the green **Stock Data Fetcher** panel (top-right)
4. Click **Download Excel** — file saves automatically

## Python Sentiment Module

Free sentiment analysis using Yahoo Finance + Google News RSS feeds.

```bash
pip install -r requirements.txt
python sentiment_free.py
```

```python
from sentiment_free import get_sentiment, get_sentiment_batch

# Single ticker
result = get_sentiment("AAPL", verbose=True)

# Batch
sentiments = get_sentiment_batch(["AAPL", "MSFT", "NVDA", "TSLA"])
for ticker, s in sentiments.items():
    print(f"{ticker}: {s['label']} ({s['avg_score']:+.3f}) - {s['article_count']} articles")
```

### Sentiment Output Fields

| Field | Description |
|---|---|
| `avg_score` | Float from -1.0 (very negative) to +1.0 (very positive) |
| `label` | `POSITIVE`, `NEUTRAL`, or `NEGATIVE` |
| `article_count` | Total articles analyzed |
| `positive_count` | Articles scored positive |
| `negative_count` | Articles scored negative |
| `top_headlines` | Top 5 headlines used |

## Excel Output Columns

| Column | Description |
|---|---|
| Symbol | Stock ticker |
| Total Ratings | Sum of all analyst ratings |
| Buy Ratings % | % of buy ratings |
| Fair Value | Morningstar fair value estimate |
| Star Rating | Morningstar star rating (1-5) |
| Economic Moat | None / Narrow / Wide |
| Uncertainty | Low / Medium / High / Very High |
| Stewardship | Poor / Standard / Exemplary |
| Quote Last Trade Price | Current price |
| Potential Profit/Loss % | (Fair Value - Price) / Price * 100 |

## Notes

- Requires an active Robinhood session (auth token is captured automatically)
- Fair value data requires Robinhood Gold subscription
- Rate limiting is built-in (1s delay per 10 stocks) to avoid API bans
- The sentiment module is rule-based — it won't catch sarcasm but is fast and free
