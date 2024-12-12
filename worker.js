const { parentPort, workerData } = require('worker_threads');

parentPort.on('message', (job) => {
  const { job_id, data } = job;
  const throttleDelay = Math.max(0, (workerData.throttle / 100) * 100);

  setTimeout(() => {
    // Simula cálculo de hash (puedes usar un algoritmo real si es necesario)
    const hash = Buffer.from(data).toString('base64'); // Solo como ejemplo
    parentPort.postMessage({ hash, job_id });
  }, throttleDelay);
});
