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
      authStatusText.textContent = '⏳ Waiting for Robinhood API call...';
    }
  }
}

// ---------------------------------------------------------------------------
// UI CREATION
// ---------------------------------------------------------------------------
export function createUI(capturedInstrumentIds, onExportClick) {
  // Check if UI already exists
  if (document.getElementById('robinhood-analyser-container')) return;

  const container = document.createElement('div');
  container.id = 'robinhood-analyser-container';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    width: 300px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    border: 1px solid #eee;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    border-bottom: 1px solid #eee;
    padding-bottom: 8px;
  `;
  header.innerHTML = '<h3 style="margin:0;font-size:16px;">📈 Stock Analyser</h3>';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;color:#999;line-height:1;';
  closeBtn.onclick = () => container.remove();
  header.appendChild(closeBtn);

  const stats = document.createElement('div');
  stats.id = 'rh-instruments-count';
  stats.style.fontSize = '13px';
  stats.style.marginBottom = '10px';
  stats.textContent = '📊 Monitoring quotes API calls... (0 stocks captured)';

  const authStatus = document.createElement('div');
  authStatus.id = 'rh-auth-status';
  authStatus.style.cssText = 'font-size:12px;padding:8px;border-radius:4px;margin-bottom:15px;';
  authStatus.innerHTML = '<span id="rh-auth-status-text">⏳ Waiting for Robinhood API call...</span>';

  const exportBtn = document.createElement('button');
  exportBtn.id = 'rh-fetch-btn';
  exportBtn.textContent = '📊 Export to Excel (with Fair Value)';
  exportBtn.style.cssText = `
    width: 100%;
    background: #00c805;
    color: white;
    border: none;
    padding: 10px;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
    margin-bottom: 15px;
  `;
  exportBtn.onclick = () => onExportClick(capturedInstrumentIds, updateProgress, showStatus);

  const signalSection = document.createElement('div');
  signalSection.style.marginBottom = '10px';
  signalSection.innerHTML = '<div style="font-size:12px;font-weight:bold;margin-bottom:5px;">Live Signal Engine</div>';

  const signalInputContainer = document.createElement('div');
  signalInputContainer.style.display = 'flex';
  signalInputContainer.style.gap = '5px';
  signalInputContainer.style.marginBottom = '10px';

  const signalInput = document.createElement('input');
  signalInput.id = 'rh-signal-input';
  signalInput.placeholder = 'Ticker (e.g. TSLA)';
  signalInput.style.cssText = 'flex:1;padding:5px;border:1px solid #ccc;border-radius:4px;text-transform:uppercase;';

  const signalBtn = document.createElement('button');
  signalBtn.textContent = 'Run';
  signalBtn.style.cssText = 'background:#2196F3;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;';
  signalBtn.onclick = () => {
    const sym = signalInput.value.trim().toUpperCase();
    if (sym) runSignal(sym);
  };

  signalInputContainer.appendChild(signalInput);
  signalInputContainer.appendChild(signalBtn);
  signalSection.appendChild(signalInputContainer);

  const progressContainer = document.createElement('div');
  progressContainer.id = 'rh-progress';
  progressContainer.style.display = 'none';
  progressContainer.style.marginBottom = '10px';
  progressContainer.innerHTML = `
    <div style="font-size:12px;margin-bottom:4px;display:flex;justify-content:space-between;">
      <span id="rh-progress-text">Processing...</span>
      <span id="rh-progress-percent">0%</span>
    </div>
    <div style="width:100%;background:#eee;height:8px;border-radius:4px;overflow:hidden;">
      <div id="rh-progress-bar" style="width:0%;background:#00c805;height:100%;transition:width 0.3s;"></div>
    </div>
  `;

  const statusMsg = document.createElement('div');
  statusMsg.id = 'rh-status';
  statusMsg.style.cssText = 'font-size:12px;color:#666;min-height:15px;';

  container.appendChild(header);
  container.appendChild(stats);
  container.appendChild(authStatus);
  container.appendChild(exportBtn);
  container.appendChild(signalSection);
  container.appendChild(progressContainer);
  container.appendChild(statusMsg);

  document.body.appendChild(container);
}
