import { ROBINHOOD_API_BASE, BATCH_SIZE, RATE_LIMIT_DELAY } from './config.js';
import { getCachedAuthToken, setupAuthTokenInterceptor } from './auth.js';
import { compileData } from './data.js';
import { generateExcel } from './excel.js';

export async function fetchWithAuth(url, requireAuth = false) {
  const baseHeaders = {
    'Accept': '*/*',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Origin': 'https://robinhood.com',
    'Referer': 'https://robinhood.com/',
    'X-Midlands-API-Version': '1.66.64',
  };

  if (requireAuth) {
    if (window.setupAuthTokenInterceptorFn) {
      window.setupAuthTokenInterceptorFn();
    }

    let cachedAuthToken = getCachedAuthToken();
    if (!cachedAuthToken) {
      for (let i = 0; i < 5 && !cachedAuthToken; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (window.setupAuthTokenInterceptorFn) {
          window.setupAuthTokenInterceptorFn();
        }
        cachedAuthToken = getCachedAuthToken();
      }
    }

    if (!cachedAuthToken) {
      console.warn('⚠️ Auth token not captured yet.');
    }

    if (cachedAuthToken) {
      baseHeaders['Authorization'] = cachedAuthToken;
    }
    baseHeaders['X-Hyper-Ex'] = 'enabled';
    baseHeaders['X-Timezone-Id'] = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';

    try {
      const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      const response = await pageWindow.fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: baseHeaders
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errorText = await response.text();
        if (response.status === 401 && !cachedAuthToken) {
          console.warn('⚠️ 401 Unauthorized - Auth token not available.');
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.warn('Page fetch failed, trying GM_xmlhttpRequest:', error);
    }
  }

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      headers: {
        ...baseHeaders,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
      },
      onload: function(response) {
        if (response.status >= 200 && response.status < 300) {
          try {
            resolve(JSON.parse(response.responseText));
          } catch (e) {
            resolve(response.responseText);
          }
        } else {
          reject(new Error(`HTTP ${response.status}: ${response.responseText}`));
        }
      },
      onerror: function(error) {
        reject(error);
      }
    });
  });
}

export async function getRatings(instrumentIds) {
  if (instrumentIds.length === 0) return {};
  const ratingsMap = {};

  for (let i = 0; i < instrumentIds.length; i += BATCH_SIZE) {
    const batch = instrumentIds.slice(i, i + BATCH_SIZE);
    const idsParam = batch.join('%2C');
    const url = `${ROBINHOOD_API_BASE}/midlands/ratings/?ids=${idsParam}`;
    try {
      const data = await fetchWithAuth(url);
      if (data.results) {
        data.results.forEach(result => {
          ratingsMap[result.instrument_id] = result;
        });
      }
    } catch (error) {
      console.error('Error fetching ratings for batch:', error);
    }
  }

  return ratingsMap;
}

export async function getFairValue(instrumentId) {
  try {
    const url = `${ROBINHOOD_API_BASE}/discovery/ratings/${instrumentId}/overview/`;
    const data = await fetchWithAuth(url, true);
    return data;
  } catch (error) {
    console.error(`Error fetching fair value for ${instrumentId}:`, error);
    return null;
  }
}

export async function getQuote(instrumentId) {
  if (!instrumentId) return null;
  try {
    const url = `${ROBINHOOD_API_BASE}/quotes/${instrumentId}/`;
    const data = await fetchWithAuth(url);
    return data;
  } catch (error) {
    console.error(`Error fetching quote for ${instrumentId}:`, error);
    return null;
  }
}

export async function fetchStockData(capturedInstrumentIds, updateProgress, showStatus) {
  const fetchBtn = document.getElementById('rh-fetch-btn');
  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching...';

  try {
    const instrumentIds = Array.from(capturedInstrumentIds.keys());
    const totalStocks = instrumentIds.length;

    if (totalStocks === 0) {
      showStatus('No stocks captured yet', 'error');
      return;
    }

    showStatus(`Fetching data for ${totalStocks} stocks...`, 'info');

    const instrumentMappings = Array.from(capturedInstrumentIds.entries()).map(([id, info]) => ({
      symbol: info.symbol,
      instrumentId: id,
      name: info.name
    }));

    updateProgress(0, totalStocks, 'Fetching analyst ratings...');
    const ratingsMap = await getRatings(instrumentIds);
    updateProgress(totalStocks, totalStocks, 'Ratings fetched');

    updateProgress(0, totalStocks, 'Fetching latest quotes...');
    const quotesMap = {};
    for (let i = 0; i < instrumentIds.length; i++) {
      const instrumentId = instrumentIds[i];
      const quote = await getQuote(instrumentId);
      if (quote) quotesMap[instrumentId] = quote;
      updateProgress(i + 1, totalStocks, `Fetched quotes ${i + 1}/${totalStocks}...`);
      if ((i + 1) % 10 === 0 && i + 1 < instrumentIds.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    updateProgress(0, totalStocks, 'Fetching fair value data...');
    const fairValueMap = {};
    for (let i = 0; i < instrumentIds.length; i++) {
      const instrumentId = instrumentIds[i];
      const fairValue = await getFairValue(instrumentId);
      fairValueMap[instrumentId] = fairValue;
      updateProgress(i + 1, totalStocks, `Fetched fair value ${i + 1}/${totalStocks}...`);
      if ((i + 1) % 10 === 0 && i + 1 < instrumentIds.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    updateProgress(0, 1, 'Compiling data...');
    const compiledData = compileData(instrumentMappings, ratingsMap, fairValueMap, quotesMap);

    updateProgress(1, 1, 'Generating Excel file...');
    generateExcel(compiledData);

    showStatus(`Successfully exported data for ${compiledData.length} stocks!`, 'success');
    updateProgress(compiledData.length, compiledData.length, 'Complete!');
  } catch (error) {
    console.error('Error fetching stock data:', error);
    showStatus(`Error: ${error.message}`, 'error');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Download Excel';
  }
}
