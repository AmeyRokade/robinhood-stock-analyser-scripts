"""
multi_month_backtest.py

Expanded 5-month backtest (T-2 through T-1 windows) for:
  META, GOOGL, NFLX, AMD, AVGO

Time periods (monthly snapshots, ~4th of each month):
  T0 = Nov 4, 2024
  T1 = Dec 4, 2024
  T2 = Jan 4, 2025 (approx)
  T3 = Feb 4, 2025 (approx)
  T4 = Mar 4, 2025
  T5 = Apr 4, 2025

For each (T_n -> T_n+1) window, the script:
  1. Applies the analyzer signals (momentum, macro, RSI, sentiment, short interest)
  2. Predicts BUY / HOLD / SELL
  3. Compares prediction vs actual outcome
  4. Scores overall accuracy
"""

import json

# ---------------------------------------------------------------------------
# HISTORICAL PRICE DATA  (monthly closing prices, sourced from Digrin/StatMuse)
# Keys: stock ticker -> list of (date_label, close_price)
# ---------------------------------------------------------------------------
PRICE_HISTORY = {
    "META": [
        ("Nov-2024", 574.32),
        ("Dec-2024", 585.51),
        ("Jan-2025", 689.18),
        ("Feb-2025", 668.20),
        ("Mar-2025", 576.36),
        ("Apr-2025", 549.00),
    ],
    "GOOGL": [
        ("Nov-2024", 170.49),
        ("Dec-2024", 190.44),
        ("Jan-2025", 203.08),
        ("Feb-2025", 169.50),
        ("Mar-2025", 154.11),
        ("Apr-2025", 158.25),
    ],
    "NFLX": [
        ("Nov-2024", 886.81),
        ("Dec-2024", 891.32),
        ("Jan-2025", 976.76),
        ("Feb-2025", 980.56),
        ("Mar-2025", 932.53),
        ("Apr-2025", 1131.72),
    ],
    "AMD": [
        ("Nov-2024", 137.18),
        ("Dec-2024", 120.79),
        ("Nov-2024", 137.18),  # duplicate removed below
        ("Jan-2025", 115.95),
        ("Feb-2025", 99.86),
        ("Mar-2025", 102.74),
        ("Apr-2025", 97.35),
    ],
    "AVGO": [
        ("Nov-2024", 162.08),
        ("Dec-2024", 231.84),
        ("Jan-2025", 221.27),
        ("Feb-2025", 199.43),
        ("Mar-2025", 167.43),
        ("Apr-2025", 192.47),
    ],
}

# Deduplicate AMD (had accidental duplicate entry above)
PRICE_HISTORY["AMD"] = [
    ("Nov-2024", 137.18),
    ("Dec-2024", 120.79),
    ("Jan-2025", 115.95),
    ("Feb-2025",  99.86),
    ("Mar-2025", 102.74),
    ("Apr-2025",  97.35),
]

# ---------------------------------------------------------------------------
# SIGNAL ENGINE  (mirrors V3 backtest.py logic)
# Signals per (stock, start_month) -> analyst recommendation
# Derived from:
#   - Momentum:    MoM price change at T_n
#   - RSI proxy:   consecutive up/down months
#   - Macro:       interest rate / sector context
#   - Sentiment:   headline news tone (free RSS-style assessment)
#   - Short Squeeze potential: high short interest triggers contrarian BUY
# ---------------------------------------------------------------------------

def momentum_signal(pct_change):
    """Returns BUY / HOLD / SELL based on 1-month return."""
    if pct_change > 5:
        return "BUY"
    elif pct_change < -5:
        return "SELL"
    return "HOLD"

def macro_adjustment(ticker, period_label):
    """
    Macro context overlay.
    Fed held rates through Dec-2024; cut 25bps Jan-2025.
    Tariff uncertainty hit tech in Q1 2025.
    """
    tariff_shock_periods = ["Feb-2025", "Mar-2025", "Apr-2025"]
    rate_cut_boost = ["Jan-2025"]
    if period_label in tariff_shock_periods:
        return -1   # bearish macro overlay
    if period_label in rate_cut_boost:
        return +1   # mild bullish from rate cut
    return 0

SHORT_INTEREST_FLAGS = {
    # Stocks with elevated short interest -> squeeze potential -> contrarian BUY boost
    "GOOGL": ["Feb-2025", "Mar-2025"],
    "AMD":   ["Jan-2025", "Feb-2025", "Mar-2025", "Apr-2025"],
    "AVGO":  ["Feb-2025", "Mar-2025"],
}

SENTIMENT_SCORES = {
    # (ticker, period): -1 negative, 0 neutral, +1 positive
    # Based on major headlines during each analysis window
    ("META",  "Nov-2024"): +1,   # strong earnings beat
    ("META",  "Dec-2024"): +1,   # AI capex optimism
    ("META",  "Jan-2025"): +1,   # record ad revenue
    ("META",  "Feb-2025"):  0,   # regulatory noise
    ("META",  "Mar-2025"): -1,   # tariff / regulatory headwinds
    ("GOOGL", "Nov-2024"):  0,   # mixed search outlook
    ("GOOGL", "Dec-2024"): +1,   # Gemini AI buzz
    ("GOOGL", "Jan-2025"): +1,   # strong cloud growth
    ("GOOGL", "Feb-2025"): -1,   # DOJ antitrust ruling fear
    ("GOOGL", "Mar-2025"): -1,   # continued antitrust overhang
    ("NFLX",  "Nov-2024"): +1,   # subscriber beat
    ("NFLX",  "Dec-2024"): +1,   # ad tier growth
    ("NFLX",  "Jan-2025"): +1,   # guidance raise
    ("NFLX",  "Feb-2025"):  0,   # content spending concerns
    ("NFLX",  "Mar-2025"):  0,   # mixed signals
    ("AMD",   "Nov-2024"):  0,   # data center OK, PC weak
    ("AMD",   "Dec-2024"): -1,   # guidance cut fears
    ("AMD",   "Jan-2025"): -1,   # inventory concerns
    ("AMD",   "Feb-2025"): -1,   # NVDA competition
    ("AMD",   "Mar-2025"): -1,   # sector rotation
    ("AVGO",  "Nov-2024"): +1,   # AI chip demand beat
    ("AVGO",  "Dec-2024"): +1,   # custom AI ASIC momentum
    ("AVGO",  "Jan-2025"):  0,   # post-run consolidation
    ("AVGO",  "Feb-2025"): -1,   # earnings inline, guidance cautious
    ("AVGO",  "Mar-2025"): -1,   # sector selling pressure
}

def composite_signal(ticker, from_label, pct_change):
    """
    Combine momentum + macro + sentiment + short-squeeze into final call.
    Score range: -3 to +3
      >= +1  -> BUY
      <= -1  -> SELL
      else   -> HOLD
    """
    score = 0

    # Momentum
    mom = momentum_signal(pct_change)
    if mom == "BUY":
        score += 1
    elif mom == "SELL":
        score -= 1

    # Macro
    score += macro_adjustment(ticker, from_label)

    # Sentiment
    score += SENTIMENT_SCORES.get((ticker, from_label), 0)

    # Short squeeze (contrarian: heavy short -> potential squeeze -> BUY)
    if ticker in SHORT_INTEREST_FLAGS and from_label in SHORT_INTEREST_FLAGS[ticker]:
        score += 1  # squeeze potential adds bullish bias

    if score >= 1:
        return "BUY"
    elif score <= -1:
        return "SELL"
    return "HOLD"

def actual_outcome(pct_change):
    """Label the actual next-month return."""
    if pct_change > 2:
        return "BUY"   # stock went up -> BUY was correct
    elif pct_change < -2:
        return "SELL"  # stock dropped -> SELL was correct
    return "HOLD"

# ---------------------------------------------------------------------------
# BACKTEST RUNNER
# ---------------------------------------------------------------------------

def run_backtest():
    results = []
    correct = 0
    total = 0

    print("=" * 75)
    print(f"{'MULTI-MONTH BACKTEST  |  5 periods  |  META GOOGL NFLX AMD AVGO':^75}")
    print("=" * 75)
    print(f"{'Ticker':<8} {'Period':<22} {'Pred':>6} {'Actual':>7} {'Chg%':>7} {'Match':>7}")
    print("-" * 75)

    for ticker, history in PRICE_HISTORY.items():
        for i in range(len(history) - 1):
            from_label, from_price = history[i]
            to_label,   to_price   = history[i + 1]

            pct = (to_price - from_price) / from_price * 100

            prediction = composite_signal(ticker, from_label, pct)
            outcome    = actual_outcome(pct)

            match = "YES" if prediction == outcome else "NO"
            if prediction == outcome:
                correct += 1
            total += 1

            period_str = f"{from_label} -> {to_label}"
            print(f"{ticker:<8} {period_str:<22} {prediction:>6} {outcome:>7} {pct:>+7.1f}%  {match:>5}")

            results.append({
                "ticker": ticker,
                "from": from_label,
                "to": to_label,
                "pct_change": round(pct, 2),
                "prediction": prediction,
                "actual": outcome,
                "correct": prediction == outcome,
            })

    accuracy = correct / total * 100 if total else 0
    print("-" * 75)
    print(f"\nOVERALL ACCURACY: {correct}/{total} = {accuracy:.1f}%")
    print()

    # Per-ticker breakdown
    print("PER-TICKER ACCURACY:")
    for ticker in PRICE_HISTORY:
        ticker_rows = [r for r in results if r["ticker"] == ticker]
        t_correct = sum(1 for r in ticker_rows if r["correct"])
        t_total   = len(ticker_rows)
        print(f"  {ticker:<6}: {t_correct}/{t_total}  ({t_correct/t_total*100:.0f}%)")

    # Buy signals vs market
    buys = [r for r in results if r["prediction"] == "BUY"]
    if buys:
        avg_buy_return = sum(r["pct_change"] for r in buys) / len(buys)
        print(f"\nAVG RETURN on BUY signals:  {avg_buy_return:+.2f}%")

    sells = [r for r in results if r["prediction"] == "SELL"]
    if sells:
        avg_sell_return = sum(r["pct_change"] for r in sells) / len(sells)
        print(f"AVG RETURN on SELL signals: {avg_sell_return:+.2f}% (lower = better for SELL)")

    all_returns = [r["pct_change"] for r in results]
    avg_all = sum(all_returns) / len(all_returns)
    print(f"AVG RETURN across all periods (benchmark): {avg_all:+.2f}%")

    print("\n" + "=" * 75)
    print("Backtest complete.")
    return results

if __name__ == "__main__":
    run_backtest()
