// ==UserScript==
// @name         Robinhood Weekly Signal Overlay
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Shows weekly BUY/HOLD/SELL signals (momentum + sentiment + macro + short squeeze) as a floating panel on Robinhood. Signals update every Sunday with fresh weekly data.
// @author       AmeyRokade
// @match        *://*.robinhood.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-end
// @noframes
// @connect      query1.finance.yahoo.com
// @connect      feeds.finance.yahoo.com
// @updateURL    https://raw.githubusercontent.com/AmeyRokade/robinhood-stock-analyser-scripts/main/weekly_signal.user.js
// @downloadURL  https://raw.githubusercontent.com/AmeyRokade/robinhood-stock-analyser-scripts/main/weekly_signal.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // SIGNAL DATA
  // Update these every week with fresh prices + signals.
  // Format: { symbol, prevClose, weekClose, signal, rationale, sentiment }
  // ---------------------------------------------------------------------------
  const WEEK_LABEL = 'Week of Mar 30 \u2192 Apr 2, 2026';
  const NEXT_WEEK_LABEL = 'Apr 6\u201310, 2026';

  const SIGNALS = [
    {
      symbol:    'META',
      prevClose:  525.72,
      weekClose:  574.46,
      signal:    'BUY',
      sentiment: 'NEUTRAL',
      rationale: 'Strong rebound from lows; AI capex story intact; tariff ad-spend risk balanced'
    },
    {
      symbol:    'GOOGL',
      prevClose:  274.34,
      weekClose:  295.77,
      signal:    'BUY',
      sentiment: 'POSITIVE',
      rationale: 'Earnings beat + AI spending commitment; DOJ overhang easing'
    },
    {
      symbol:    'NFLX',
      prevClose:   93.43,
      weekClose:   98.66,
      signal:    'BUY',
      sentiment: 'POSITIVE',
      rationale: 'Ad revenue doubling; no tariff exposure; NFLX earnings Apr 16 positioning'
    },
    {
      symbol:    'AMD',
      prevClose:  201.99,
      weekClose:  217.50,
      signal:    'BUY',
      sentiment: 'POSITIVE',
      rationale: 'AI GPU pipeline + elevated short interest (squeeze risk); recovery trend intact'
    },
    {
      symbol:    'AVGO',
      prevClose:  309.42,
      weekClose:  314.55,
      signal:    'BUY',
      sentiment: 'POSITIVE',
      rationale: 'Q1 AI revenue +106% YoY; Q2 guidance $10.7B; weekly gain modest but fundamental outlook strong'
    },
  ];

  const MACRO_NOTE = '\u26a0\ufe0f Macro: Tariff uncertainty + Iran risk. IMF projects rate cuts in 2026. Strong March jobs beat. Shortened week (Good Friday Apr 3).';

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  function pct(prev, curr) {
    return ((curr - prev) / prev * 100).toFixed(1);
  }

  function signalColor(sig) {
    if (sig === 'BUY')  return '#00c853';
    if (sig === 'SELL') return '#d50000';
    return '#ff9100';
  }

  function signalIcon(sig) {
    if (sig === 'BUY')  return '\u25b2 BUY';
    if (sig === 'SELL') return '\u25bc SELL';
    return '\u25a0 HOLD';
  }

  function sentimentBadge(s) {
    const colors = { POSITIVE: '#00c853', NEUTRAL: '#ff9100', NEGATIVE: '#d50000' };
    return `<span style="background:${colors[s]||'#888'};color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;">${s}</span>`;
  }

  // ---------------------------------------------------------------------------
  // BUILD PANEL UI
  // ---------------------------------------------------------------------------
  function buildPanel() {
    // Remove existing panel if present
    const existing = document.getElementById('rh-weekly-signal-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'rh-weekly-signal-panel';
    panel.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 999999',
      'width: 380px',
      'background: #1a1a2e',
      'color: #e0e0e0',
      'border-radius: 12px',
      'box-shadow: 0 8px 32px rgba(0,0,0,0.6)',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'font-size: 13px',
      'overflow: hidden',
      'border: 1px solid #2a2a4a',
      'transition: all 0.2s ease',
    ].join(';');

    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = 'background:#16213e;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-bottom:1px solid #2a2a4a;';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">\ud83d\udcca</span>
        <div>
          <div style="font-weight:700;font-size:14px;color:#fff;">Weekly Signal Engine</div>
          <div style="font-size:10px;color:#888;">${WEEK_LABEL} &rarr; Pred: ${NEXT_WEEK_LABEL}</div>
        </div>
      </div>
      <div id="rh-signal-toggle" style="color:#888;font-size:18px;user-select:none;">&#x2212;</div>
    `;

    // --- Body ---
    const body = document.createElement('div');
    body.id = 'rh-signal-body';
    body.style.cssText = 'padding:12px 16px;';

    // Macro note
    const macroDiv = document.createElement('div');
    macroDiv.style.cssText = 'background:#12122a;border-radius:6px;padding:8px 10px;margin-bottom:12px;font-size:11px;color:#aaa;line-height:1.4;';
    macroDiv.textContent = MACRO_NOTE;
    body.appendChild(macroDiv);

    // Signals table
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;';

    // Table header row
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">
        <th style="text-align:left;padding:4px 0;">Ticker</th>
        <th style="text-align:right;padding:4px 0;">Close</th>
        <th style="text-align:right;padding:4px 0;">Chg%</th>
        <th style="text-align:center;padding:4px 0;">Signal</th>
        <th style="text-align:center;padding:4px 0;">Sent.</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    SIGNALS.forEach((s, idx) => {
      const change = pct(s.prevClose, s.weekClose);
      const changeColor = parseFloat(change) >= 0 ? '#00c853' : '#d50000';
      const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';

      const tr = document.createElement('tr');
      tr.style.cssText = `background:${rowBg};cursor:pointer;`;
      tr.title = s.rationale;

      tr.innerHTML = `
        <td style="padding:7px 0;font-weight:700;color:#fff;">${s.symbol}</td>
        <td style="text-align:right;color:#ccc;">$${s.weekClose.toFixed(2)}</td>
        <td style="text-align:right;color:${changeColor};font-weight:600;">${change >= 0 ? '+' : ''}${change}%</td>
        <td style="text-align:center;">
          <span style="background:${signalColor(s.signal)};color:#fff;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;">${signalIcon(s.signal)}</span>
        </td>
        <td style="text-align:center;">${sentimentBadge(s.sentiment)}</td>
      `;

      // Expand rationale on click
      tr.addEventListener('click', () => {
        const existing = document.getElementById(`rh-rationale-${s.symbol}`);
        if (existing) { existing.remove(); return; }
        const rationaleRow = document.createElement('tr');
        rationaleRow.id = `rh-rationale-${s.symbol}`;
        rationaleRow.innerHTML = `
          <td colspan="5" style="font-size:11px;color:#aaa;padding:4px 8px 8px;font-style:italic;line-height:1.4;background:rgba(255,255,255,0.03);border-radius:4px;">
            ${s.rationale}
          </td>
        `;
        tr.insertAdjacentElement('afterend', rationaleRow);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #2a2a4a;display:flex;justify-content:space-between;align-items:center;';
    footer.innerHTML = `
      <span style="font-size:10px;color:#555;">Click row for rationale. Signals are not financial advice.</span>
      <span style="font-size:10px;color:#444;">v1.0.0</span>
    `;
    body.appendChild(footer);

    panel.appendChild(header);
    panel.appendChild(body);

    // Collapse / expand toggle
    header.addEventListener('click', () => {
      const bodyEl = document.getElementById('rh-signal-body');
      const toggle = document.getElementById('rh-signal-toggle');
      if (bodyEl.style.display === 'none') {
        bodyEl.style.display = 'block';
        toggle.innerHTML = '&#x2212;';
        GM_setValue('rh_signal_collapsed', false);
      } else {
        bodyEl.style.display = 'none';
        toggle.innerHTML = '+';
        GM_setValue('rh_signal_collapsed', true);
      }
    });

    document.body.appendChild(panel);

    // Restore collapsed state
    if (GM_getValue('rh_signal_collapsed', false)) {
      document.getElementById('rh-signal-body').style.display = 'none';
      document.getElementById('rh-signal-toggle').innerHTML = '+';
    }

    // Make draggable
    makeDraggable(panel, header);
  }

  // ---------------------------------------------------------------------------
  // DRAGGABLE
  // ---------------------------------------------------------------------------
  function makeDraggable(panel, handle) {
    let isDragging = false, startX, startY, startRight, startBottom;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.id === 'rh-signal-toggle') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startRight  = window.innerWidth  - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.right  = `${startRight  - dx}px`;
      panel.style.bottom = `${startBottom - dy}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      document.body.style.userSelect = '';
    });
  }

  // ---------------------------------------------------------------------------
  // WAIT FOR PAGE READY AND INJECT
  // ---------------------------------------------------------------------------
  function init() {
    if (document.body) {
      buildPanel();
    } else {
      document.addEventListener('DOMContentLoaded', buildPanel);
    }
  }

  // Re-inject on Robinhood SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => {
        if (!document.getElementById('rh-weekly-signal-panel')) {
          buildPanel();
        }
      }, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

  init();

})();
