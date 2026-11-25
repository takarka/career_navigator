const { parentPort, workerData } = require('node:worker_threads');

const end = Date.now() + workerData.ms;
let x = 0;
while (Date.now() < end) x += Math.sqrt(x + 1);
parentPort.postMessage(x);
