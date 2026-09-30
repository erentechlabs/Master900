/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload loaded with `node --require` */
// Preload for running server modules outside Next.js (worker, scripts): `server-only` throws when imported
// outside a React Server environment, so resolve it to an empty module. Usage: node --require ./scripts/server-only-shim.cjs
const Module = require("node:module");
const path = require("node:path");

const stub = path.join(__dirname, "server-only-stub.cjs");
const resolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, ...rest) {
  if (request === "server-only") return stub;
  return resolve.call(this, request, ...rest);
};
