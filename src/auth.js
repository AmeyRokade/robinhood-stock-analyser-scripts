import { ROBINHOOD_API_BASE } from './config.js';
import { extractAuthToken } from './utils.js';
import { fetchWithAuth } from './api.js';

// Cache for authorization token
let cachedAuthToken = null;

export function getCachedAuthToken() {
  return cachedAuthToken;
}

export function setCachedAuthToken(token) {
  cachedAuthToken = token;
}

// Intercept fetch to capture authorization token and instrument IDs
export function setupAuthTokenInterceptor(capturedInstrumentIds, updateInstrumentsCount) {
  try {
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const originalFetch = pageWindow.fetch;

    if (originalFetch && !originalFetch._intercepted) {
      pageWindow.fetch = function(input, init = {}) {
        let url = '';
        let headers = null;

        if (typeof input === 'string') {
          url = input;
          headers = init.headers;
        } else if (input instanceof Request) {
          url = input.url;
          headers = input.headers;
          if (init.headers) {
            const mergedHeaders = new Headers(input.headers);
            if (init.headers instanceof Headers) {
              init.headers.forEach((value, key) => mergedHeaders.set(key, value));
            } else if (typeof init.headers === 'object') {
              Object.entries(init.headers).forEach(([key, value]) => mergedHeaders.set(key, value));
            }
            headers = mergedHeaders;
          }
        }

        if (url && url.includes('api.robinhood.com')) {
          if (headers) {
            const authHeader = extractAuthToken(headers);
            if (authHeader && authHeader.startsWith('Bearer ') && !cachedAuthToken) {
              cachedAuthToken = authHeader;
              console.log('✅ Captured auth token from page fetch');
            }
          }

          const isQuotesEndpoint = url.includes('/marketdata/quotes/') ||
                                   url.includes('/quotes/') ||
                                   (url.includes('/marketdata/') && url.includes('quote'));

          if (isQuotesEndpoint) {
            let idsParam = null;
            let ids = [];

            try {
              const urlObj = new URL(url);
              idsParam = urlObj.searchParams.get('ids') ||
                         urlObj.searchParams.get('ids[]') ||
                         urlObj.searchParams.get('instrument_ids');

              if (!idsParam) {
                const idsMatch = url.match(/[?&]ids=([^&]+)/i);
                if (idsMatch) idsParam = idsMatch[1];
              }

              if (!idsParam) {
                const pathMatch = url.match(/\/quotes\/([^/?]+)/);
                if (pathMatch) idsParam = pathMatch[1];
              }

              if (idsParam) {
                ids = idsParam.split(/%2[Cc]|[,;]/)
                  .map(id => { try { return decodeURIComponent(id.trim()); } catch (e) { return id.trim(); } })
                  .filter(id => id && id.length > 0);

                let newIdsCount = 0;
                ids.forEach(id => {
                  if (id && !capturedInstrumentIds.has(id)) {
                    capturedInstrumentIds.set(id, { symbol: 'Loading...', name: 'Loading...', instrumentId: id });
                    newIdsCount++;
                  }
                });

                if (newIdsCount > 0) {
                  updateInstrumentsCount(capturedInstrumentIds);
                }
              }

              const fetchPromise = originalFetch.apply(this, arguments);
              fetchPromise.then(async (response) => {
                if (response.ok) {
                  try {
                    const data = await response.clone().json();
                    if (data.results && Array.isArray(data.results)) {
                      data.results.forEach(result => {
                        if (result.instrument_id && result.symbol) {
                          const existing = capturedInstrumentIds.get(result.instrument_id);
                          capturedInstrumentIds.set(result.instrument_id, {
                            symbol: result.symbol,
                            name: existing?.name || result.symbol,
                            instrumentId: result.instrument_id
                          });
                        }
                      });
                      updateInstrumentsCount(capturedInstrumentIds);

                      setTimeout(async () => {
                        for (const [id, info] of capturedInstrumentIds.entries()) {
                          if (info.name === 'Loading...' || info.name === info.symbol) {
                            try {
                              const instrumentUrl = `${ROBINHOOD_API_BASE}/instruments/${id}/`;
                              const instrumentData = await fetchWithAuth(instrumentUrl);
                              if (instrumentData && instrumentData.name) {
                                info.name = instrumentData.name || instrumentData.simple_name || info.symbol;
                                capturedInstrumentIds.set(id, info);
                                updateInstrumentsCount(capturedInstrumentIds);
                              }
                            } catch (e) {
                              console.warn(`Failed to fetch instrument name for ${id}:`, e);
                            }
                          }
                        }
                      }, 100);
                    }
                  } catch (e) {
                    console.error('❌ Could not parse quotes response:', e);
                  }
                }
              }).catch(error => {
                console.error('❌ Error handling response:', error);
              });
              return fetchPromise;
            } catch (e) {
              console.error('❌ Error parsing quotes URL:', e);
            }
          }
        }

        return originalFetch.apply(this, arguments);
      };

      pageWindow.fetch._intercepted = true;
      console.log('✅ Auth token and quotes interceptor set up successfully');
    }

    // XHR fallback
    const originalXHROpen = pageWindow.XMLHttpRequest.prototype.open;
    const originalXHRSend = pageWindow.XMLHttpRequest.prototype.send;

    if (originalXHROpen && !originalXHROpen._intercepted) {
      pageWindow.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
      };

      pageWindow.XMLHttpRequest.prototype.send = function(...args) {
        if (this._url && this._url.includes('api.robinhood.com')) {
          const isQuotesCall = this._url.includes('/marketdata/quotes/') || this._url.includes('/quotes/');
          const authHeader = this.getRequestHeader?.('Authorization') || this.getRequestHeader?.('authorization');
          if (authHeader && authHeader.startsWith('Bearer ') && !cachedAuthToken) {
            cachedAuthToken = authHeader;
            console.log('✅ Captured auth token from XHR');
          }

          if (isQuotesCall) {
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = function() {
              if (this.readyState === 4 && this.status === 200) {
                try {
                  const data = JSON.parse(this.responseText);
                  if (data.results && Array.isArray(data.results)) {
                    data.results.forEach(result => {
                      if (result.instrument_id && result.symbol) {
                        if (!capturedInstrumentIds.has(result.instrument_id)) {
                          capturedInstrumentIds.set(result.instrument_id, {
                            symbol: result.symbol,
                            name: result.symbol,
                            instrumentId: result.instrument_id
                          });
                        }
                      }
                    });
                    updateInstrumentsCount(capturedInstrumentIds);
                  }
                } catch (e) {
                  console.warn('⚠️ Failed to parse XHR quotes response:', e);
                }
              }
              if (originalOnReadyStateChange) originalOnReadyStateChange.apply(this, arguments);
            };
          }
        }
        return originalXHRSend.apply(this, args);
      };
      originalXHROpen._intercepted = true;
    }
  } catch (e) {
    console.warn('Could not intercept fetch/XHR:', e);
  }

  return cachedAuthToken;
}
