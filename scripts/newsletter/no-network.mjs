// Preload for tests (`node --import ./no-network.mjs`): any outbound fetch
// from the process under test throws, proving the code path is offline.
globalThis.fetch = () => { throw new Error('Network access is not allowed in this process'); };
