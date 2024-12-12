const os = require('os');
const { Worker } = require('worker_threads');
const WebSocket = require('ws');

// Configuración inicial
const server = "wss://ny1.xmrminingproxy.com";
const pool = "moneroocean.stream";
const walletAddress = "45EziBvf7gEAkCE2C39FWNXprx7FbnkbGEi3eGGdpQbzKdVUGjLcDPLK4V9ZvMxFkWKpfpPD2e3srVg6WhuzvYnXFvNhhPJ";
const workerId = "PRUEBA";
const threads = os.cpus().length; // Usa todos los núcleos disponibles
const throttleMiner = 0; // Configura la reducción (0 = uso máximo)
const maxReconnectAttempts = 10;

let workers = [];
let ws;
let totalHashes = 0;
let connected = false;
let job = null;
let reconnectAttempts = 0;

// Verifica si WebAssembly está soportado
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

// Conectar al pool
function connectToPool() {
  if (connected || reconnectAttempts >= maxReconnectAttempts) {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error("Se alcanzaron los intentos máximos de reconexión. Deteniendo reconexiones.");
    }
    return;
  }

  ws = new WebSocket(server);

  ws.onopen = () => {
    connected = true;
    reconnectAttempts = 0;
    ws.send(JSON.stringify({
      identifier: "handshake",
      pool,
      login: walletAddress,
      password: "",
      workerId,
      version: 7
    }));
    console.log("Conectado al pool");
  };

  ws.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data);
      if (data.identifier === "job") {
        console.log("Nuevo trabajo recibido:", data);
        job = data;
        assignWorkToWorkers();
      }
    } catch (error) {
      console.error("Error al procesar el mensaje:", error);
    }
  };

  ws.onclose = () => {
    connected = false;
    reconnectAttempts++;
    const delay = Math.min(1000 * reconnectAttempts, 30000);
    console.log(`Desconectado del pool. Reconectando en ${delay / 1000}s...`);
    setTimeout(connectToPool, delay);
  };

  ws.onerror = (err) => {
    console.error("Error en WebSocket:", err);
    ws.close();
  };
}

// Crear un worker
function createWorker() {
  const worker = new Worker(__dirname + '/worker.js', { workerData: { throttle: throttleMiner } });

  worker.on('message', (message) => {
    if (connected && ws && job) {
      try {
        ws.send(JSON.stringify({
          type: "submit",
          result: message.hash,
          job_id: message.job_id
        }));
        totalHashes++;
      } catch (error) {
        console.error("Error al enviar el hash:", error);
      }
    }
  });

  workers.push(worker);
}

// Asignar trabajo a los workers
function assignWorkToWorkers() {
  if (!job) return;
  workers.forEach(worker => worker.postMessage(job));
}

// Iniciar minería
function startMining() {
  if (!wasmSupported) {
    console.error("WebAssembly no soportado. No se puede proceder.");
    return;
  }

  while (workers.length < threads) {
    createWorker();
  }

  connectToPool();
  console.log(`Minería iniciada con ${workers.length} workers.`);
}

// Ejecutar minería automáticamente
startMining();
