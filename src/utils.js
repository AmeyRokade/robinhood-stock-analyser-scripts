// Utility functions

// Helper to extract auth token from headers (handles Headers object or plain object)
export function extractAuthToken(headers) {
  if (!headers) return null;

  // Handle Headers object
  if (headers instanceof Headers || (headers.get && typeof headers.get === 'function')) {
    return headers.get('Authorization') || headers.get('authorization');
  }

  // Handle plain object
  if (typeof headers === 'object') {
    return headers['Authorization'] || headers['authorization'] || headers.Authorization || headers.authorization;
  }

  return null;
}

export function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('rh-status');
  if (!statusDiv) return;
  statusDiv.textContent = message;
  statusDiv.style.display = 'block';
  statusDiv.style.background = type === 'error' ? '#fee' : type === 'success' ? '#efe' : '#eef';
  statusDiv.style.color = type === 'error' ? '#c00' : type === 'success' ? '#0a0' : '#006';
}

export function updateProgress(current, total, message) {
  const progressDiv = document.getElementById('rh-progress');
  const progressBar = document.getElementById('rh-progress-bar');
  const progressText = document.getElementById('rh-progress-text');
  const progressPercent = document.getElementById('rh-progress-percent');

  if (progressDiv) progressDiv.style.display = 'block';
  const percentage = total > 0 ? (current / total) * 100 : 0;
  if (progressBar) progressBar.style.width = percentage + '%';
  if (progressText) progressText.textContent = message || `${current} / ${total}`;
  if (progressPercent) progressPercent.textContent = `${Math.round(percentage)}%`;
}
