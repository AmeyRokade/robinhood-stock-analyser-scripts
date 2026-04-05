import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         Robinhood Stock Ratings & Fair Value Fetcher
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Fetch analyst ratings and fair value data for stocks from Robinhood API and export to Excel
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

function build() {
  console.log('Building userscript...');

  esbuild.build({
    entryPoints: [join(__dirname, 'src', 'main.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2017',
    outfile: join(__dirname, 'build', 'script.user.js'),
    banner: {
      js: USERSCRIPT_HEADER
    },
    minify: false, // Keep readable for userscript debugging
    write: true,
  }).then(() => {
    console.log('Build complete! Output: build/script.user.js');
  }).catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

build();
