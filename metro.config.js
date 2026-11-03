const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web loads SQLite as a .wasm asset and talks to its worker over
// SharedArrayBuffer, which browsers only allow on cross-origin-isolated pages.
config.resolver.assetExts.push('wasm');

// The isolation headers must be on the HTML document itself. SDK 54's dev server
// serves that page ahead of `server.enhanceMiddleware`, and expo-router's
// `headers` option only applies to `expo export`, so stamp every response from
// this process instead. Dev only: whatever hosts the web export must send these
// two headers itself.
// ponytail: global writeHead patch, drop it once the dev server honours router headers.
const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return writeHead.apply(this, args);
};

module.exports = config;
