const net = require('net');

const server = net.createServer((socket) => {
  console.log('Client connected from', socket.remoteAddress);
  
  socket.on('data', (data) => {
    console.log('--- RECEIVED DATA ---');
    console.log(data.toString());
    console.log('--- END DATA ---');
    
    // Simulate Icecast 2 response
    socket.write('HTTP/1.0 200 OK\r\n');
    socket.write('Date: ' + new Date().toUTCString() + '\r\n');
    socket.write('Server: Icecast 2.4.0\r\n\r\n');
  });

  socket.on('end', () => {
    console.log('Client disconnected');
  });

  socket.on('error', (err) => {
    console.log('Socket error:', err.message);
  });
});

server.listen(3005, () => {
  console.log('Raw TCP sniffer listening on port 3005');
});
