// ==UserScript==
// @name         Robinhood On-Demand Stock Signal
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Fetches live on-demand BUY/HOLD/SELL signals (momentum + sentiment + macro) for any ticker directly on Robinhood.
// @author       AmeyRokade
// @match        *://*.robinhood.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @noframes
// @connect      query1.finance.yahoo.com
// @connect      feeds.finance.yahoo.com
// ==/UserScript==

(function() {
    'use strict';

    // ---------------------------------------------------------------------------
    // CONFIG & CONSTANTS
    // ---------------------------------------------------------------------------
    const YAHOO_QUOTE_URL = (sym) => `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1mo`;
    const YAHOO_RSS_URL = (sym) => `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=US&lang=en-US`;

    const POSITIVE_WORDS = new Set(['beat','beats','strong','surge','surges','rally','rallies','gain','gains','rises','rise','up','upgrade','upgraded','outperform','buy','bullish','record','growth','profit','revenue','exceed','exceeds','positive','optimistic','higher','expansion','boom','soar','soars','momentum','breakout','opportunity','undervalued','cheap','attractive','raised','raises','top','best']);
    const NEGATIVE_WORDS = new Set(['miss','misses','weak','decline','declines','fall','falls','drop','drops','down','downgrade','downgraded','underperform','sell','bearish','loss','losses','cut','cuts','concern','concerns','risk','risks','warning','warns','negative','pessimistic','lower','contraction','bust','plunge','plunges','slowdown','overvalued','expensive','disappointing','layoffs','lawsuit','investigation','fraud','recall','crash','tariff','tariffs','fine','penalty']);
    const NEGATORS = new Set(['not','no','never','neither','barely','hardly']);
    const INTENSIFIERS = new Set(['very','highly','extremely','significantly','sharply']);

    const MACRO_SCORE = 0;
    const MACRO_LABEL = 'Balanced (tariff risk offset by rate cut outlook)';

    // ---------------------------------------------------------------------------
    // CORE LOGIC
    // ---------------------------------------------------------------------------
    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                onload: (res) => res.status >= 200 && res.status < 300 ? resolve(res.responseText) : reject(new Error(`HTTP ${res.status}`)),
                onerror: reject, ontimeout: () => reject(new Error('Timeout')), timeout: 10000
            });
        });
    }

    function scoreText(text) {
        const words = text.toLowerCase().match(/\b\w+\b/g) || [];
        let score = 0;
        for (let i = 0; i < words.length; i++) {
            let multiplier = 1.0;
            if (i > 0) {
                if (NEGATORS.has(words[i-1])) multiplier = -1.0;
                else if (INTENSIFIERS.has(words[i-1])) multiplier = 1.5;
            }
            if (POSITIVE_WORDS.has(words[i])) score += 1.0 * multiplier;
            if (NEGATIVE_WORDS.has(words[i])) score -= 1.0 * multiplier;
        }
        return Math.max(-1, Math.min(1, score / Math.max(1, words.length / 10)));
    }

    async function runSignal(symbol) {
        const sym = symbol.toUpperCase().trim();
        const [priceText, rssText] = await Promise.all([gmFetch(YAHOO_QUOTE_URL(sym)), gmFetch(YAHOO_RSS_URL(sym))]);

        // Price Logic
        const pData = JSON.parse(priceText).chart.result[0];
        const closes = pData.indicators.quote[0].close.filter(v => v != null);
        const currentPrice = closes[closes.length - 1];
        const pctChange = (currentPrice - closes[0]) / closes[0] * 100;

        // Sentiment Logic
        const doc = new DOMParser().parseFromString(rssText, 'text/xml');
        const headlines = Array.from(doc.querySelectorAll('item')).slice(0, 5).map(it => it.querySelector('title').textContent);
        const sScore = scoreText(headlines.join(' '));
        const sLabel = sScore > 0.05 ? 'POSITIVE' : sScore < -0.05 ? 'NEGATIVE' : 'NEUTRAL';

        // Composite Score
        let score = MACRO_SCORE;
        if (pctChange > 5) score += 1; else if (pctChange < -5) score -= 1;
        if (sLabel === 'POSITIVE') score += 1; else if (sLabel === 'NEGATIVE') score -= 1;
        if (new Set(['AMD','GOOGL','AVGO','RIVN','GME']).has(sym)) score += 1; // High SI Squeeze potential

        return {
            symbol: sym, price: currentPrice, pct: pctChange,
            signal: score >= 1 ? 'BUY' : score <= -1 ? 'SELL' : 'HOLD',
            score, sentiment: sLabel, sScore, headlines
        };
    }

    // ---------------------------------------------------------------------------
    // UI RENDERER
    // ---------------------------------------------------------------------------
    function injectUI() {
        if (document.getElementById('rh-signal-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'rh-signal-panel';
        panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;width:380px;background:white;border:2px solid #00c805;border-radius:12px;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,0.2);font-family:sans-serif;';

        const urlMatch = window.location.pathname.match(/\/stocks\/([A-Z]{1,6})\//i);
        const detected = urlMatch ? urlMatch[1].toUpperCase() : '';

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3 style="margin:0;font-size:16px;color:#00c805">⚡ On-Demand Signal</h3>
                <button id="rh-close" style="background:none;border:none;cursor:pointer;font-size:20px">×</button>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <input id="rh-input" type="text" value="${detected}" placeholder="Ticker" style="flex:1;padding:8px;border:1px solid #ccc;border-radius:6px;text-transform:uppercase">
                <button id="rh-btn" style="padding:8px 16px;background:#00c805;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer">Analyze</button>
            </div>
            <div id="rh-result" style="display:none"></div>
        `;

        document.body.appendChild(panel);
        document.getElementById('rh-close').onclick = () => panel.remove();

        const btn = document.getElementById('rh-btn');
        const res = document.getElementById('rh-result');
        const input = document.getElementById('rh-input');

        btn.onclick = async () => {
            const sym = input.value.trim().toUpperCase();
            if (!sym) return;
            btn.disabled = true; btn.textContent = '...';
            try {
                const r = await runSignal(sym);
                const color = r.signal === 'BUY' ? '#00c805' : r.signal === 'SELL' ? '#e00' : '#f5a623';
                res.style.display = 'block';
                res.innerHTML = `
                    <div style="border:2px solid ${color};padding:12px;border-radius:8px;background:#f9f9f9">
                        <div style="display:flex;justify-content:space-between;font-weight:bold;margin-bottom:8px">
                            <span style="color:${color};font-size:18px">${r.signal}</span>
                            <span>${r.symbol} · $${r.price.toFixed(2)}</span>
                        </div>
                        <div style="font-size:12px;line-height:1.5;color:#444">
                            <div>📈 Momentum: ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}% (4w)</div>
                            <div>😊 Sentiment: ${r.sentiment} (${r.sScore.toFixed(2)})</div>
                            <div>🌐 Macro: ${MACRO_LABEL}</div>
                        </div>
                    </div>
                `;
            } catch (e) {
                res.style.display = 'block'; res.innerHTML = `<div style="color:red;font-size:12px">Error: ${e.message}</div>`;
            } finally {
                btn.disabled = false; btn.textContent = 'Analyze';
            }
        };

        if (detected) setTimeout(() => btn.click(), 500);
    }

    // Handle SPA navigation
    let last = location.href;
    setInterval(() => { if(location.href !== last) { last = location.href; injectUI(); } }, 1000);
    injectUI();
})();
