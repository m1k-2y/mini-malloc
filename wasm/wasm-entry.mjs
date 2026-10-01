import { createBackend } from './backend.mjs';

// Set the promise before mounting so controls wait for WASM initialization.
globalThis.miniMallocBackend = createBackend();
// Attach a rejection handler immediately; app.js displays the failure to the user.
globalThis.miniMallocBackend.catch(() => {});
await import('./app.js');
