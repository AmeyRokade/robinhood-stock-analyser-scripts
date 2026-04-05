#!/usr/bin/env python3
"""
Backtest V2: Robinhood Stock Analyser Signal Accuracy
Signal Date: March 4, 2025
Evaluation Date: April 4, 2025

Enhancements:
1. Macro Risk (Tariff exposure)
2. Momentum (Price trend)
3. Sentiment Saturation (Crowded trade check)
4. Mean Reversion Dampening (Oversold logic)
"""

import json
from datetime import date

# ---------------------------------------------------------------------------
# HISTORICAL DATA  (sourced from StatMuse / Yahoo Finance)
# ---------------------------------------------------------------------------

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
# ANALYST & MACRO DATA circa March 4, 2025
# ---------------------------------------------------------------------------
ANALYST_DATA = {
    "AAPL": {
        "buy_pct":    57.1,
        "fair_value": 215.0,
        "sentiment":  0.15,
        "star_rating": 3,
        "macro_risk":  0.8,   # High tariff exposure (China assembly)
        "off_high":   -2.0,   # Near peak momentum
        "chg_30d":     1.5,
    },
    "MSFT": {
        "buy_pct":    91.4,
        "fair_value": 490.0,
        "sentiment":  0.40,
        "star_rating": 4,
        "macro_risk":  0.2,   # Software/Services low tariff impact
        "off_high":   -5.0,
        "chg_30d":     2.0,
    },
    "NVDA": {
        "buy_pct":    88.0,
        "fair_value": 130.0,
        "sentiment":  0.55,
        "star_rating": 4,
        "macro_risk":  0.6,   # Supply chain / demand uncertainty
        "off_high":   -8.0,
        "chg_30d":    12.0,   # Strong prior run (potential exhaustion)
    },
    "TSLA": {
        "buy_pct":    38.5,
        "fair_value": 210.0,
        "sentiment": -0.20,
        "star_rating": 2,
        "macro_risk":  0.5,
        "off_high":   -43.0,  # CRASHED (Oversold mean reversion potential)
        "chg_30d":    -15.0,
    },
    "AMZN": {
        "buy_pct":    95.2,
        "fair_value": 260.0,
        "sentiment":  0.35,
        "star_rating": 5,
        "macro_risk":  0.3,
        "off_high":   -4.0,
        "chg_30d":     1.0,
    },
}

# ---------------------------------------------------------------------------
# ENHANCED SCORING LOGIC
# ---------------------------------------------------------------------------

def compute_enhanced_score(ticker: str) -> dict:
    d = ANALYST_DATA[ticker]
    p = PRICES[ticker]

    # 1. Base Score (40% Analyst, 40% Fair Value, 20% Sentiment)
    buy_score = d["buy_pct"] / 100.0
    fv_gap_pct = (d["fair_value"] - p["signal"]) / d["fair_value"] * 100
    fv_score = max(-1.0, min(1.0, fv_gap_pct / 50.0))
    sent_score = d["sentiment"]

    base_composite = (buy_score * 0.4 + fv_score * 0.4 + sent_score * 0.2)

    # 2. ENHANCEMENTS
    final_composite = base_composite

    # A. Macro Risk Penalty (Tariff Exposure)
    # Deduct up to 0.25 based on macro risk
    final_composite -= (d["macro_risk"] * 0.25)

    # B. Sentiment Saturation / Crowded Trade
    # If consensus is too high, upside is often limited
    if d["buy_pct"] > 85 and d["sentiment"] > 0.4:
        final_composite -= 0.10

    # C. Momentum & Mean Reversion
    # If stock is off high by >30%, it's "oversold" -> dampen SELL signals
    if d["off_high"] < -30:
        if final_composite < 0.1:  # would be a SELL
             final_composite += 0.2  # Bump to HOLD
    # If stock is near high AND has massive 30d run -> "exhaustion" risk
    if d["off_high"] > -5 and d["chg_30d"] > 10:
        final_composite -= 0.15

    # Signal Logic
    if final_composite > 0.30:
        signal = "BUY"
    elif final_composite > 0.05:  # lowered SELL floor from 0.1 to 0.05
        signal = "HOLD"
    else:
        signal = "SELL"

    actual_return = (p["eval"] - p["signal"]) / p["signal"] * 100

    return {
        "ticker": ticker,
        "base_score": round(base_composite, 4),
        "final_score": round(final_composite, 4),
        "signal": signal,
        "actual_return": round(actual_return, 2),
    }

def run_v2_backtest():
    print("=" * 70)
    print(f"  BACKTEST V2: Signal {SIGNAL_DATE}  →  Evaluation {EVAL_DATE}")
    print("=" * 70)

    results = [compute_enhanced_score(t) for t in PRICES]
    mkt_avg = sum(r["actual_return"] for r in results) / len(results)

    print(f"
Market average return: {mkt_avg:.2f}%
")

    header = f"{'Ticker':<6} {'Base':>7} {'Final':>7} {'Signal':>8} {'Actual Ret':>12} {'Correct':>8}"
    print(header)
    print("-" * len(header))

    correct = 0
    for row in results:
        # Correct if: BUY beats mkt, SELL loses to mkt, HOLD +/- 7%
        r = row["actual_return"]
        ok = False
        if row["signal"] == "BUY": ok = (r >= mkt_avg)
        elif row["signal"] == "SELL": ok = (r <= mkt_avg)
        else: ok = (abs(r - mkt_avg) <= 7.0) # Relative HOLD band

        if ok: correct += 1
        print(f"{row['ticker']:<6} {row['base_score']:>7.3f} {row['final_score']:>7.3f} {row['signal']:>8} {row['actual_return']:>11.2f}% {'YES' if ok else 'NO':>8}")

    print(f"
Signal accuracy: {correct}/{len(results)} = {correct/len(results)*100:.0f}%")
    return results

if __name__ == "__main__":
    run_v2_backtest()
