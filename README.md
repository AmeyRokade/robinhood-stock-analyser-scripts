# Robinhood Stock Analyser & Live Signal

A powerful Tampermonkey userscript that enhances Robinhood with deep stock analysis tools. It fetches analyst ratings and Morningstar fair value data for your portfolio/watchlist and provides a live, on-demand signal engine for any ticker.

## Features

- **Intercepts Robinhood API calls**: Captures instrument IDs automatically as you browse.
- **Bulk Excel Export**: Fetches analyst buy/hold/sell ratings and Morningstar data (fair value, star rating, economic moat, etc.) for all captured stocks.
- **Live Signal Engine (v1.1)**:
  - **RSI (14)**: Identifies overbought/oversold conditions.
  - **EMA (20)**: Analyzes trend direction relative to the exponential moving average.
  - **Sentiment Analysis**: Free real-time sentiment scoring from Yahoo Finance RSS headlines.
  - **Momentum & Macro**: Composite signal logic based on price action and global context.
- **Keyboard Shortcut**: Press `Ctrl+Shift+R` to toggle the analysis panel.

## Project Structure

```
robinhood-stock-analyser-scripts/
├── src/
│   ├── main.js      # Entry point (initializes UI and interceptor)
│   ├── api.js       # Robinhood API interactions
│   ├── signal.js    # Signal engine (Yahoo Finance, RSI, EMA, Sentiment)
│   ├── ui.js        # User interface components
│   ├── auth.js      # Authentication token handling
│   ├── data.js      # Data compilation logic
│   ├── excel.js     # Excel generation using SheetJS
│   └── utils.js     # Shared utilities
├── build.js         # Build script using esbuild
├── backtest.py      # Python script for strategy validation (V3)
└── README.md
```

## Getting Started

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Install the userscript from `build/script.user.js`.
3. Navigate to [robinhood.com](https://robinhood.com).
4. Use the floating panel to run live signals or download bulk data.

## Disclaimer

This tool is for educational and informational purposes only. Trading stocks involves risk. Always do your own research before making investment decisions.
