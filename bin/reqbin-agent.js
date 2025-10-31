#!/usr/bin/env node
// Simple CLI wrapper to start the local agent
import { startServer } from '../src/index.js';

function getPortFromArgs(argv) {
  const idxP = argv.indexOf('-p');
  const idxPort = argv.findIndex(a => a === '--port' || a.startsWith('--port='));
  if (idxP >= 0 && argv[idxP + 1]) return Number(argv[idxP + 1]);
  if (idxPort >= 0) {
    const val = argv[idxPort].includes('=') ? argv[idxPort].split('=')[1] : argv[idxPort + 1];
    if (val) return Number(val);
  }
  const direct = argv.find(a => /^\d{2,5}$/.test(a));
  if (direct) return Number(direct);
  return Number(process.env.PORT || 7070);
}

const port = getPortFromArgs(process.argv.slice(2));

startServer({ port })
  .then(server => {
    process.on('SIGINT', () => {
      server.close(() => process.exit(0));
    });
  })
  .catch(err => {
    console.error('[reqbin-agent] failed to start:', err);
    process.exit(1);
  });
