const fs = require('fs');
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/broadcast',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer supersecret',
    'Content-Type': 'audio/mpeg'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (error) => {
  console.error(error);
});

// Enviaremos el archivo lentamente, como un stream real
const readStream = fs.createReadStream('test.mp3');

// Vamos a regular la velocidad para no saturar el buffer 
// y simular un stream en vivo (aprox. 128kbps = 16KB/s)
let chunkDelay = 100; // ms

readStream.on('data', (chunk) => {
  readStream.pause();
  req.write(chunk);
  setTimeout(() => {
    readStream.resume();
  }, chunkDelay);
});

readStream.on('end', () => {
    console.log('\nArchivo de audio transmitido totalmente.');
    req.end();
});
