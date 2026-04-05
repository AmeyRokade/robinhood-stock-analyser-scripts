"""
weekly_live_signal.py

LIVE WEEKLY SIGNAL — Week of Mar 30, 2026 -> Apr 2, 2026
(Market closed Apr 3 for Good Friday)

Stocks: META, GOOGL, NFLX, AMD, AVGO

Price data sourced from:
  - StockAnalysis.com / Investing.com / MarketBeat (verified)

Signal engine: same composite logic as backtest.py V3
  Momentum + Macro + Sentiment + Short Squeeze

Output: BUY / HOLD / SELL signal per stock heading into next week.
"""

# ---------------------------------------------------------------------------
# WEEKLY PRICE DATA  (actual daily closes, week of Mar 30 - Apr 2, 2026)
# ---------------------------------------------------------------------------
# NOTE: Market was closed Friday Apr 3 (Good Friday).
# Last trading day of week = Thursday Apr 2, 2026.

WEEK_DATA = {
    # ticker: {"prev_close": Mar 27 close, "week_close": Apr 2 close}
    "META":  {"prev_close": 525.72,  "week_close": 574.46},
    "GOOGL": {"prev_close": 274.34,  "week_close": 295.77},
    "NFLX":  {"prev_close": 93.43,   "week_close": 98.66},
    "AMD":   {"prev_close": 201.99,  "week_close": 217.50},
    "AVGO":  {"prev_close": 309.42,  "week_close": 314.55},  # Mar 26 prev
}

# Daily closes for intra-week momentum context
DAILY_CLOSES = {
    "META":  [525.72, 536.38, 572.13, 579.23, 574.46],  # Fri-Mon-Tue-Wed-Thu
    "GOOGL": [274.34, 273.50, 287.56, 297.39, 295.77],
    "NFLX":  [ 93.43,  92.97,  96.15,  95.55,  98.66],
    "AMD":   [201.99, 196.04, 203.43, 210.21, 217.50],
    "AVGO":  [309.42, 300.87, 309.51, 313.49, 314.55],
}

# ---------------------------------------------------------------------------
# MACRO CONTEXT  (week of Apr 4, 2026)
# ---------------------------------------------------------------------------
MACRO_CONTEXT = """
MACRO ENVIRONMENT — Week ending Apr 4, 2026:
- Good Friday market closure Apr 3; shortened trading week
- Tariff uncertainty continues: US average tariff rate ~12% (Deloitte)
  US Supreme Court struck down previous tariff measures in Feb 2026,
  but new tariff threats persist under renewed executive actions
- IMF signals rate cuts ahead for 2026; inflation at ~2.6% by year-end
- March jobs data beat expectations (robust labor market)
- Iran geopolitical tensions adding risk premium to markets
- S&P 500 wrapped up a tough March; analysts cautiously optimistic on April
- Nasdaq YTD still under pressure from tech multiple compression
- AVGO: Q1 FY2026 AI revenue $8.4B, +106% YoY; Q2 guidance $10.7B (STRONG)
- NFLX: Ad revenues expected to double to $3B in 2026; subscriber growth intact
- GOOGL: Flat on Q4 2026 earnings beat; heavy AI capex commitment in 2026
- AMD: Recovery momentum but still below 2024 highs; AI GPU orders building
- META: Down from $604 (Mar 23) highs; tariff/ad-spend macro fears
"""

# ---------------------------------------------------------------------------
# SENTIMENT SCORES  (for the signal week: Mar 30 -> Apr 4, 2026)
# Based on actual news headlines this week
# ---------------------------------------------------------------------------
SENTIMENT = {
    "META":  0,   # Tariff-driven ad spend fears offset strong AI capex story; neutral
    "GOOGL": +1,  # Earnings beat, AI spending positive signal; DOJ overhang easing
    "NFLX":  +1,  # Ad revenue doubling, subscriber growth strong, no tariff exposure
    "AMD":   +1,  # AI GPU pipeline building, recovery trend intact
    "AVGO":  +1,  # Exceptional Q1 AI revenue beat, Q2 guidance raised sharply
}

# Short interest flags (elevated -> squeeze bias)
SHORT_SQUEEZE_FLAGS = {
    "AMD":   True,  # Still elevated short interest relative to peers
    "AVGO":  False,
    "META":  False,
    "GOOGL": False,
    "NFLX":  False,
}

# ---------------------------------------------------------------------------
# SIGNAL ENGINE
# ---------------------------------------------------------------------------

def weekly_momentum_signal(pct):
    if pct > 4:
        return "BUY", 1
    elif pct < -4:
        return "SELL", -1
    return "HOLD", 0

def macro_score_week():
    """
    Weekly macro overlay for Apr 4, 2026 week.
    - Rate cut trajectory: mildly bullish (+1)
    - Tariff uncertainty: mildly bearish (-1)
    - Strong jobs data: bullish for risk (+1)
    - Geopolitical (Iran): bearish risk-off (-1)
    Net = 0 (balanced / neutral macro)
    """
    return 0

def composite_signal_weekly(ticker, pct):
    score = 0
    label, m_score = weekly_momentum_signal(pct)
    score += m_score
    score += macro_score_week()           # 0 (balanced)
    score += SENTIMENT[ticker]            # per-stock sentiment
    if SHORT_SQUEEZE_FLAGS.get(ticker):
        score += 1                        # squeeze potential
    if score >= 1:
        return "BUY"
    elif score <= -1:
        return "SELL"
    return "HOLD"

# ---------------------------------------------------------------------------
# RUNNER
# ---------------------------------------------------------------------------

def run_weekly_signal():
    print("=" * 70)
    print("  LIVE WEEKLY SIGNAL — Week of Mar 30 -> Apr 2, 2026")
    print("  Prediction for NEXT week (Apr 6-10, 2026)")
    print("=" * 70)
    print(MACRO_CONTEXT)
    print("-" * 70)
    print(f"{'Ticker':<8} {'Prev Close':>11} {'Week Close':>11} {'Chg%':>8}  {'Signal':>7}  Rationale")
    print("-" * 70)

    signals = {}
    for ticker, prices in WEEK_DATA.items():
        prev  = prices["prev_close"]
        close = prices["week_close"]
        pct   = (close - prev) / prev * 100
        signal = composite_signal_weekly(ticker, pct)
        signals[ticker] = signal

        # Build rationale string
        sent_label = {+1: "POS", 0: "NEUT", -1: "NEG"}[SENTIMENT[ticker]]
        squeeze_note = " +SQUEEZE" if SHORT_SQUEEZE_FLAGS.get(ticker) else ""
        mom_label = "BULL" if pct > 4 else ("BEAR" if pct < -4 else "FLAT")
        rationale = f"Mom:{mom_label} Sent:{sent_label}{squeeze_note}"

        print(f"{ticker:<8} ${prev:>10.2f} ${close:>10.2f} {pct:>+7.1f}%  {signal:>7}  {rationale}")

    print("-" * 70)
    print()
    print("SUMMARY — Predictions for week of Apr 6-10, 2026:")
    for ticker, sig in signals.items():
        icon = ">>>" if sig == "BUY" else ("<<<" if sig == "SELL" else "---")
        print(f"  {icon}  {ticker:<6}: {sig}")
    print()
    print("Key Risks to Monitor Next Week:")
    print("  - Any new tariff executive orders (Iran, tech imports)")
    print("  - Fed speakers (rate cut timeline signals)")
    print("  - NFLX earnings Apr 16 — early positioning may start")
    print("  - AMD: AI GPU order announcements from hyperscalers")
    print("  - AVGO: Follow-through on Q2 AI guidance momentum")
    print("=" * 70)
    return signals

if __name__ == "__main__":
    run_weekly_signal()
