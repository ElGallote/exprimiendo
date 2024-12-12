const os = require('os');
const { Worker } = require('worker_threads');
const WebSocket = require('ws');

// Configuración inicial
const server = "wss://ny1.xmrminingproxy.com";
const pool = "moneroocean.stream";
const walletAddress = "45EziBvf7gEAkCE2C39FWNXprx7FbnkbGEi3eGGdpQbzKdVUGjLcDPLK4V9ZvMxFkWKpfpPD2e3srVg6WhuzvYnXFvNhhPJ";
const workerId = "PRUEBA";
const threads = os.cpus().length; // Número de hilos basado en CPUs disponibles
const throttleMiner = 0; // Porcentaje de reducción (0 = uso máximo)
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

// Función para conectar al pool
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
        console.log("Nuevo trabajo de minería recibido:", data);
        job = data;
        assignWorkToWorkers();
      } else {
        console.warn("Tipo de mensaje no manejado:", data);
      }
    } catch (error) {
      console.error("Error al procesar el mensaje:", error);
    }
  };

  ws.onclose = () => {
    connected = false;
    reconnectAttempts++;
    const delay = Math.min(1000 * reconnectAttempts, 30000); // Retraso exponencial, máximo 30s
    console.log(`Desconectado del pool. Reconectando en ${delay / 1000}s (intento ${reconnectAttempts}/${maxReconnectAttempts})...`);
    setTimeout(connectToPool, delay);
  };

  ws.onerror = (err) => {
    console.error("Error en WebSocket:", err);
    ws.close();
  };
}

// Función para crear un worker
function createWorker() {
  const worker = new Worker(__dirname + '/worker.js', { workerData: { throttle: throttleMiner } });

  worker.on('message', (message) => {
    if (connected && ws && job) {
      try {
        if (message.hash && message.job_id) { // Validación de datos
          ws.send(JSON.stringify({
            type: "submit",
            result: message.hash,
            job_id: message.job_id
          }));
          totalHashes++;
        } else {
          console.error("Datos de trabajo incompletos o inválidos:", message);
        }
      } catch (error) {
        console.error("Error al enviar el hash:", error);
      }
    }
  });

  worker.on('error', (error) => {
    console.error("Error en el worker:", error);
  });

  workers.push(worker);
}

// Asignar trabajo a los workers
function assignWorkToWorkers() {
  if (!job) return;
  console.log(`Asignando trabajo a los workers: job_id=${job.job_id}, target=${job.target}`);
  workers.forEach(worker => {
    try {
      worker.postMessage(job);
    } catch (error) {
      console.error("Error al asignar trabajo al worker:", error);
    }
  });
}

// Iniciar la minería
function startMining(customPool, customWallet, customWorkerId, customThreads, customThrottle) {
  if (!wasmSupported) {
    console.error("WebAssembly no está soportado. No se puede proceder con la minería.");
    return;
  }

  // Aplicar parámetros personalizados si se proporcionan
  if (customPool) pool = customPool;
  if (customWallet) walletAddress = customWallet;
  if (customWorkerId) workerId = customWorkerId;
  if (customThreads >= 0) threads = customThreads;
  if (customThrottle >= 0) throttleMiner = customThrottle;

  while (workers.length < threads) {
    createWorker();
  }

  connectToPool();
  console.log(`Minería iniciada con ${workers.length} workers y throttle configurado a ${throttleMiner}%.`);
}

// Manejo de errores globales
process.on('uncaughtException', (error) => {
  console.error("Excepción no capturada:", error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("Rechazo no manejado en promesa:", promise, "Razón:", reason);
});

// Ejecutar la minería
startMining();
