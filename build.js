import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         Robinhood Stock Analyser & Live Signal
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Fetch analyst ratings, fair value, and live signals (RSI/EMA/Sentiment) for stocks on Robinhood.
// @author       You
// @match        *://*.robinhood.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @updateURL    https://raw.githubusercontent.com/AmeyRokade/robinhood-stock-analyser-scripts/main/build/script.user.js
// @downloadURL  https://raw.githubusercontent.com/AmeyRokade/robinhood-stock-analyser-scripts/main/build/script.user.js
// ==/UserScript==
`;

async function build() {
  console.log('Building userscript...');
  
  const buildDir = join(__dirname, 'build');
  if (!existsSync(buildDir)) {
    mkdirSync(buildDir);
  }

  const outfile = join(buildDir, 'script.user.js');

  try {
    await esbuild.build({
      entryPoints: [join(__dirname, 'src', 'main.js')],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2017',
      outfile: outfile,
      minify: false,
    });

    // Prepend USERSCRIPT_HEADER
    const content = readFileSync(outfile, 'utf8');
    writeFileSync(outfile, USERSCRIPT_HEADER + '\n' + content);
    
    console.log('Build complete! Output at: ' + outfile);
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();
