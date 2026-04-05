import { updateProgress, showStatus } from './utils.js';
import { runSignal } from './signal.js';

// ---------------------------------------------------------------------------
// INSTRUMENTS COUNT
// ---------------------------------------------------------------------------
export function updateInstrumentsCount(capturedInstrumentIds) {
  const countDiv = document.getElementById('rh-instruments-count');
  if (countDiv) {
    const count = capturedInstrumentIds.size;
    if (count > 0) {
      countDiv.textContent = `📊 ${count} stock${count !== 1 ? 's' : ''} captured from quotes API`;
    } else {
      countDiv.textContent = '📊 Monitoring quotes API calls... (0 stocks captured)';
    }
  } else {
    console.log(`📊 Instruments captured: ${capturedInstrumentIds.size} (UI not ready yet)`);
  }
}

// ---------------------------------------------------------------------------
// AUTH STATUS
// ---------------------------------------------------------------------------
export function updateAuthStatus(cachedAuthToken, capturedInstrumentIds) {
  const authStatusDiv = document.getElementById('rh-auth-status');
  const authStatusText = document.getElementById('rh-auth-status-text');
  if (authStatusDiv && authStatusText) {
    if (cachedAuthToken) {
      authStatusDiv.style.display = 'block';
      authStatusDiv.style.background = '#d4edda';
      authStatusDiv.style.color = '#155724';
      authStatusText.textContent = '✅ Authentication token ready';
    } else {
      authStatusDiv.style.display = 'block';
      authStatusDiv.style.background = '#fff3cd';
      authStatusDiv.style.color = '#856404';
      authStatusText.textContent = '⏳ Waiting for authentication token... (Navigate to a stock page if needed)';
    }
  }
  updateInstrumentsCount(capturedInstrumentIds);
}

// ---------------------------------------------------------------------------
// SIGNAL RESULT RENDERER
// ---------------------------------------------------------------------------
function renderSignalResult(result) {
  const el = document.getElementById('rh-signal-result');
  if (!el) return;

  const signalColor = result.signal === 'BUY' ? '#00c805'
    : result.signal === 'SELL' ? '#e00' : '#f5a623';
  const signalIcon = result.signal === 'BUY' ? '🟢' : result.signal === 'SELL' ? '🔴' : '🟡';
  const momentumIcon = result.momentum === 'BULLISH' ? '📈' : result.momentum === 'BEARISH' ? '📉' : '➡️';
  const sentimentIcon = result.sentiment === 'POSITIVE' ? '😊' : result.sentiment === 'NEGATIVE' ? '😟' : '😐';
  const pctStr = (result.pctChange >= 0 ? '+' : '') + result.pctChange.toFixed(2) + '%';

  const headlinesHtml = result.headlines.length > 0
    ? `<div style="margin-top:8px;font-size:11px;color:#555">
        <strong>Recent headlines:</strong>
        <ul style="margin:4px 0 0 0;padding-left:14px">
          ${result.headlines.map(h => `<li style="margin-bottom:3px">${h.length > 90 ? h.slice(0, 87) + '...' : h}</li>`).join('')}
        </ul>
      </div>`
    : '';

  el.style.display = 'block';
  el.innerHTML = `
    <div style="border:2px solid ${signalColor};border-radius:6px;padding:12px;background:#fafafa">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:18px;font-weight:bold;color:${signalColor}">${signalIcon} ${result.signal}</span>
        <span style="font-size:13px;color:#333;font-weight:bold">${result.symbol} · $${result.currentPrice.toFixed(2)}</span>
      </div>
      <div style="font-size:12px;color:#444;line-height:1.6">
        <div>${momentumIcon} <strong>Momentum:</strong> ${result.momentum} (${pctStr} over 4w)</div>
        <div>${sentimentIcon} <strong>Sentiment:</strong> ${result.sentiment} (score: ${result.sentimentScore.toFixed(3)})</div>
        <div>🌐 <strong>Macro:</strong> ${result.macro}</div>
        <div>📊 <strong>Composite score:</strong> ${result.score}</div>
      </div>
      ${headlinesHtml}
    </div>
  `;
}

function renderSignalError(msg) {
  const el = document.getElementById('rh-signal-result');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div style="color:#c00;font-size:12px;padding:8px;background:#fff0f0;border-radius:4px;border:1px solid #f5c6cb">
    ⚠️ ${msg}
  </div>`;
}

// ---------------------------------------------------------------------------
// CREATE UI
// ---------------------------------------------------------------------------
export function createUI(capturedInstrumentIds, fetchStockDataFn) {
  const container = document.createElement('div');
  container.id = 'rh-stock-fetcher';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 420px;
    background: white;
    border: 2px solid #00c805;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-height: 90vh;
    overflow-y: auto;
  `;

  // Detect symbol from URL (e.g. robinhood.com/stocks/AAPL/)
  const urlMatch = window.location.pathname.match(/\/stocks\/([A-Z]{1,6})\//i);
  const detectedSymbol = urlMatch ? urlMatch[1].toUpperCase() : '';

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
      <h3 style="margin:0;color:#00c805;font-size:16px">📈 Stock Analyser</h3>
      <button id="rh-close-btn" style="background:none;border:none;cursor:pointer;font-size:18px">×</button>
    </div>

    <div id="rh-auth-status" style="display:none;padding:8px;border-radius:4px;margin-bottom:10px;font-size:13px">
      <span id="rh-auth-status-text"></span>
    </div>

    <div id="rh-instruments-count" style="font-size:13px;margin-bottom:12px;color:#666">
      📊 Monitoring quotes API calls... (0 stocks captured)
    </div>

    <!-- SIGNAL SECTION -->
    <div style="border-top:1px solid #eee;padding-top:12px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px">⚡ Live Signal</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="rh-signal-input" type="text" placeholder="Ticker (e.g. AAPL)"
          value="${detectedSymbol}"
          style="flex:1;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;text-transform:uppercase" />
        <button id="rh-signal-btn"
          style="padding:8px 14px;background:#00c805;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;white-space:nowrap">
          ⚡ Run Signal
        </button>
      </div>
      <div id="rh-signal-result" style="display:none"></div>
    </div>

    <!-- BULK DOWNLOAD SECTION -->
    <div style="border-top:1px solid #eee;padding-top:12px">
      <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px">📥 Bulk Excel Export</div>
      <div id="rh-status" style="display:none;padding:8px;border-radius:4px;margin-bottom:10px;font-size:13px"></div>
      <div id="rh-progress" style="display:none;margin-bottom:10px">
        <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden">
          <div id="rh-progress-bar" style="background:#00c805;height:100%;width:0%;transition:width 0.3s"></div>
        </div>
        <div id="rh-progress-text" style="font-size:12px;color:#666;margin-top:4px"></div>
      </div>
      <button id="rh-fetch-btn" style="width:100%;padding:10px;background:#00c805;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold">
        Download Excel
      </button>
    </div>
  `;

  document.body.appendChild(container);

  // Close button
  document.getElementById('rh-close-btn').addEventListener('click', () => {
    container.remove();
  });

  // Signal input: uppercase as user types
  const signalInput = document.getElementById('rh-signal-input');
  signalInput.addEventListener('input', () => {
    signalInput.value = signalInput.value.toUpperCase();
  });

  // Signal button
  const signalBtn = document.getElementById('rh-signal-btn');

  signalBtn.addEventListener('click', async () => {
    const sym = signalInput.value.trim().toUpperCase();
    if (!sym) {
      renderSignalError('Please enter a ticker symbol.');
      return;
    }

    // Loading state
    signalBtn.disabled = true;
    signalBtn.textContent = 'Fetching...';
    document.getElementById('rh-signal-result').style.display = 'none';

    try {
      const result = await runSignal(sym);
      renderSignalResult(result);
    } catch (err) {
      console.error('[Signal] Error:', err);
      renderSignalError(`Could not fetch signal for ${sym}: ${err.message}`);
    } finally {
      signalBtn.disabled = false;
      signalBtn.textContent = '⚡ Run Signal';
    }
  });

  // Auto-run signal if symbol detected from URL
  if (detectedSymbol) {
    setTimeout(() => signalBtn.click(), 800);
  }

  // Bulk fetch button
  document.getElementById('rh-fetch-btn').addEventListener('click', async () => {
    if (capturedInstrumentIds.size === 0) {
      showStatus('No stocks captured yet. Please wait for quotes API calls or navigate to stock pages.', 'error');
      return;
    }
    await fetchStockDataFn(capturedInstrumentIds, updateProgress, showStatus);
  });
}
