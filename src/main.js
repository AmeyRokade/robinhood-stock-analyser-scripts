import { setupAuthTokenInterceptor, getCachedAuthToken } from './auth.js';
import { createUI, updateAuthStatus, updateInstrumentsCount } from './ui.js';
import { fetchStockData } from './api.js';

// Store captured instrument IDs and their metadata
const capturedInstrumentIds = new Map(); // Map<instrumentId, {symbol, name}>

// Make capturedInstrumentIds and updateInstrumentsCount available globally for interceptor
window.capturedInstrumentIds = capturedInstrumentIds;
window.updateInstrumentsCount = () => updateInstrumentsCount(capturedInstrumentIds);
window.setupAuthTokenInterceptorFn = () => setupAuthTokenInterceptor(capturedInstrumentIds, updateInstrumentsCount);

// Setup auth token interceptor early
setupAuthTokenInterceptor(capturedInstrumentIds, updateInstrumentsCount);

// Check auth status periodically and update UI
function updateAuthStatusPeriodic() {
  updateAuthStatus(getCachedAuthToken(), capturedInstrumentIds);
}

// Initialize UI when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createUI(capturedInstrumentIds, fetchStockData);
    updateAuthStatusPeriodic();
    setInterval(() => {
      setupAuthTokenInterceptor(capturedInstrumentIds, updateInstrumentsCount);
      updateAuthStatusPeriodic();
    }, 2000);
  });
} else {
  createUI(capturedInstrumentIds, fetchStockData);
  updateAuthStatusPeriodic();
  setInterval(() => {
    setupAuthTokenInterceptor(capturedInstrumentIds, updateInstrumentsCount);
    updateAuthStatusPeriodic();
  }, 2000);
}

// Add keyboard shortcut to toggle UI (Ctrl+Shift+R)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    const existing = document.getElementById('rh-stock-fetcher');
    if (existing) {
      existing.remove();
    } else {
      createUI(capturedInstrumentIds, fetchStockData);
    }
  }
});
