import { updateProgress, showStatus } from './utils.js';

// Update instruments count display
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

// Create UI
export function createUI(capturedInstrumentIds, fetchStockDataFn) {
  const container = document.createElement('div');
  container.id = 'rh-stock-fetcher';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 400px;
    background: white;
    border: 2px solid #00c805;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
      <h3 style="margin:0;color:#00c805;font-size:16px">📈 Stock Data Fetcher</h3>
      <button id="rh-close-btn" style="background:none;border:none;cursor:pointer;font-size:18px">×</button>
    </div>
    <div id="rh-auth-status" style="display:none;padding:8px;border-radius:4px;margin-bottom:10px;font-size:13px">
      <span id="rh-auth-status-text"></span>
    </div>
    <div id="rh-instruments-count" style="font-size:13px;margin-bottom:10px;color:#666">
      📊 Monitoring quotes API calls... (0 stocks captured)
    </div>
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
  `;

  document.body.appendChild(container);

  document.getElementById('rh-close-btn').addEventListener('click', () => {
    container.remove();
  });

  document.getElementById('rh-fetch-btn').addEventListener('click', async () => {
    if (capturedInstrumentIds.size === 0) {
      showStatus('No stocks captured yet. Please wait for quotes API calls or navigate to stock pages.', 'error');
      return;
    }
    await fetchStockDataFn(capturedInstrumentIds, updateProgress, showStatus);
  });
}
