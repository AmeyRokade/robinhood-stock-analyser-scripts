#!/usr/bin/env python3
"""
Backtest: Robinhood Stock Analyser Signal Accuracy
Signal Date: March 4, 2025
Evaluation Date: April 4, 2025

Tests whether the composite score (analyst buy%, Morningstar fair-value gap,
sentiment) correctly predicted relative performance over the following month.
"""

import json
from datetime import date

# ---------------------------------------------------------------------------
# HISTORICAL DATA  (sourced from StatMuse / Yahoo Finance)
# ---------------------------------------------------------------------------

# Closing prices on signal date and evaluation date
PRICES = {
    "AAPL": {"signal": 234.91, "eval": 188.38},
    "MSFT": {"signal": 385.66, "eval": 357.11},
    "NVDA": {"signal": 115.96, "eval":  94.29},
    "TSLA": {"signal": 272.04, "eval": 239.43},
    "AMZN": {"signal": 203.80, "eval": 175.26},
}

SIGNAL_DATE = date(2025, 3, 4)
EVAL_DATE   = date(2025, 4, 4)

# ---------------------------------------------------------------------------
# ANALYST DATA circa March 4, 2025
# Sources: Morningstar / TipRanks / Wall Street consensus (public data)
# buy_pct   : % of analyst ratings that are Buy/Strong-Buy
# fair_value: Morningstar fair-value estimate (USD) as of early March 2025
# sentiment : approximate composite RSS/news sentiment score (-1 to +1)
# ---------------------------------------------------------------------------
ANALYST_DATA = {
    "AAPL": {
        "buy_pct":    57.1,   # ~20 Buy, 12 Hold, 3 Sell  (TipRanks consensus)
        "fair_value": 215.0,  # Morningstar FVE ~$215 (stock trading at premium)
        "sentiment":  0.15,   # mildly positive news flow
        "star_rating": 3,     # 3-star (fairly valued / slight premium)
    },
    "MSFT": {
        "buy_pct":    91.4,   # 33 Buy, 3 Hold, 0 Sell
        "fair_value": 490.0,  # Morningstar FVE ~$490 (deep discount at $386)
        "sentiment":  0.40,
        "star_rating": 4,
    },
    "NVDA": {
        "buy_pct":    88.0,
        "fair_value": 130.0,  # Morningstar FVE ~$130; stock ~$116 = mild discount
        "sentiment":  0.55,
        "star_rating": 4,
    },
    "TSLA": {
        "buy_pct":    38.5,   # divided coverage; many Holds/Sells
        "fair_value": 210.0,  # Morningstar FVE ~$210; stock trading at premium
        "sentiment": -0.20,
        "star_rating": 2,
    },
    "AMZN": {
        "buy_pct":    95.2,   # 41 unanimous Buys (TipRanks)
        "fair_value": 260.0,  # Morningstar FVE ~$260; stock at big discount
        "sentiment":  0.35,
        "star_rating": 5,
    },
}

# ---------------------------------------------------------------------------
# SCORING LOGIC  (mirrors sentiment_free.py composite score)
# ---------------------------------------------------------------------------

def compute_score(ticker: str) -> dict:
    d = ANALYST_DATA[ticker]
    p = PRICES[ticker]

    # 1. Analyst buy signal (0-100 -> 0-1)
    buy_score = d["buy_pct"] / 100.0

    # 2. Fair-value gap: positive = stock below FVE (upside)
    fv_gap_pct = (d["fair_value"] - p["signal"]) / d["fair_value"] * 100
    # Normalise: clip to [-50, +50] then scale to [-1, +1]
    fv_score = max(-1.0, min(1.0, fv_gap_pct / 50.0))

    # 3. Sentiment score already in [-1, +1]
    sent_score = d["sentiment"]

    # Weighted composite (same weights as sentiment_free.py)
    composite = (
        buy_score  * 0.40 +
        fv_score   * 0.40 +
        sent_score * 0.20
    )

    # Signal: BUY if composite > 0.3, HOLD 0.1-0.3, SELL < 0.1
    if composite > 0.30:
        signal = "BUY"
    elif composite > 0.10:
        signal = "HOLD"
    else:
        signal = "SELL"

    actual_return = (p["eval"] - p["signal"]) / p["signal"] * 100

    return {
        "ticker":        ticker,
        "signal_price":  p["signal"],
        "eval_price":    p["eval"],
        "buy_pct":       d["buy_pct"],
        "fair_value":    d["fair_value"],
        "fv_gap_pct":    round(fv_gap_pct, 2),
        "sentiment":     d["sentiment"],
        "composite":     round(composite, 4),
        "signal":        signal,
        "actual_return": round(actual_return, 2),
        "star_rating":   d["star_rating"],
    }


# ---------------------------------------------------------------------------
# BACKTEST EVALUATION
# ---------------------------------------------------------------------------

def evaluate_signal(row: dict) -> bool:
    """
    A signal is 'correct' if:
      BUY  -> actual return >= market average (i.e. outperformed or less bad)
      HOLD -> absolute return within +/-5%
      SELL -> actual return <= market average
    """
    mkt_avg = sum(
        (PRICES[t]["eval"] - PRICES[t]["signal"]) / PRICES[t]["signal"] * 100
        for t in PRICES
    ) / len(PRICES)

    r = row["actual_return"]
    if row["signal"] == "BUY":
        return r >= mkt_avg
    elif row["signal"] == "SELL":
        return r <= mkt_avg
    else:  # HOLD
        return abs(r) <= 5.0


def run_backtest():
    print("=" * 70)
    print(f"  BACKTEST: Signal {SIGNAL_DATE}  →  Evaluation {EVAL_DATE}")
    print("=" * 70)

    results = [compute_score(t) for t in PRICES]

    # Market average return over the period
    mkt_avg = sum(r["actual_return"] for r in results) / len(results)

    print(f"\nMarket average return ({SIGNAL_DATE} → {EVAL_DATE}): {mkt_avg:.2f}%")
    print(f"(Note: April 2-4 2025 was the Liberation Day tariff sell-off)\n")

    header = (
        f"{'Ticker':<6} {'Signal':>6} {'Score':>7} "
        f"{'FV Gap%':>8} {'Buy%':>6} {'Sent':>6} "
        f"{'Actual Ret':>10} {'Correct':>8}"
    )
    print(header)
    print("-" * len(header))

    correct = 0
    for row in results:
        ok = evaluate_signal(row)
        if ok:
            correct += 1
        mark = "YES" if ok else "NO"
        print(
            f"{row['ticker']:<6} {row['signal']:>6} {row['composite']:>7.4f} "
            f"{row['fv_gap_pct']:>8.1f} {row['buy_pct']:>6.1f} {row['sentiment']:>6.2f} "
            f"{row['actual_return']:>9.2f}% {mark:>8}"
        )

    accuracy = correct / len(results) * 100
    print(f"\nSignal accuracy: {correct}/{len(results)} = {accuracy:.0f}%")

    # Buy-only portfolio vs equal-weight benchmark
    buy_tickers = [r for r in results if r["signal"] == "BUY"]
    if buy_tickers:
        buy_ret = sum(r["actual_return"] for r in buy_tickers) / len(buy_tickers)
        print(f"Average return of BUY signals:       {buy_ret:.2f}%")
        print(f"Average return of equal-weight port: {mkt_avg:.2f}%")
        alpha = buy_ret - mkt_avg
        print(f"Alpha (BUY vs mkt):                  {alpha:+.2f}%")
    else:
        print("No BUY signals generated.")

    print("\n" + "=" * 70)
    print("FULL RESULTS (JSON)")
    print("=" * 70)
    print(json.dumps(results, indent=2))

    return results, accuracy


if __name__ == "__main__":
    run_backtest()
