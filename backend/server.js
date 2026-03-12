const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { getUser, createUser, addXP, authenticateDj, getSchedules, addSchedule, deleteSchedule, getScheduleById, getAllDjs, createDj, deleteDj } = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Servir el frontend compilado en producción
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

const multer = require('multer');
const musicDir = path.join(__dirname, 'music');
const adDir    = path.join(__dirname, 'ads');
if (!fs.existsSync(adDir)) fs.mkdirSync(adDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, musicDir),
  filename:    (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

const adStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, adDir),
  filename:    (req, file, cb) => cb(null, file.originalname)
});
const uploadAd = multer({ storage: adStorage });

const server = http.createServer((req, res) => {
    // Interceptar SOURCE/PUT antes de Express para compatibilidad IceCast pura
    if (['SOURCE', 'PUT'].includes(req.method) && req.url === '/broadcast') {
        handleBroadcast(req, res).catch(err => {
            console.error('Error en broadcast:', err);
            try { res.writeHead(500); res.end(); } catch(e) {}
        });
        return;
    }
    app(req, res);
});

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const chatHistory = [
  { id: 1, user: 'System', text: 'Welcome to the Best Online Radio! 📻', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), level: 99 }
];

// ----- CONFIGURACIÓN DEL STREAMING DE AUDIO (Icecast-like + AutoDJ) -----
const activeListeners = new Set();
let currentListeners = 0;

let radioState = {
  isDjLive: false,
  djName: null,
  currentSong: "Cargando AutoDJ..."
};

const MAX_HISTORY = 5;
let songHistory = [];

const cleanSongName = (filename) => {
    if (!filename) return "Desconocido";
    let name = filename.replace(/\.(mp3|wav|flac|ogg)$/i, ''); // quitar extensión
    name = name.replace(/^(\d+\s*-\s*\d+[A-Z]\s*-\s*|\d+[A-Z]\s*-\s*|\d+\s*BPM\s*-\s*)/i, ''); // quitar "11A - " o "113 - 11A - "
    name = name.replace(/\s*\(?\d+\s*BPM\)?\s*$/i, ''); // quitar " (113 BPM)" al final
    return name.trim();
};

const addToHistory = (song) => {
    if (songHistory.length > 0 && songHistory[0] === song) return;
    songHistory.unshift(song);
    if (songHistory.length > MAX_HISTORY) songHistory.pop();
};

// AUTO-DJ SYSTEM
// Time-compensated streaming: each tick calculates how many bytes SHOULD have been
// sent based on elapsed wall-clock time, and sends exactly that deficit.
// This eliminates setInterval drift — if a tick fires late, the next one catches up.
const TICK_MS = 50;                  // smaller tick = finer compensation
const MAX_BURST_BYTES = 65536;       // 64KB cap per tick — allows fast catch-up
const SPEED_FACTOR = 1.05;           // send 5% faster than real-time to build client buffer

let playlist = [];            // Cola de reproducción pendiente (nombres de archivo)
let playedSongs = new Set();  // Canciones ya reproducidas en el ciclo actual
let currentTrackName = null;  // Nombre del archivo actualmente sonando
let autoDjTimer      = null;
let autoDjFd         = null;   // file descriptor for current track
let autoDjPos        = 0;      // byte position in current track
let autoDjTrackSize  = 0;      // total bytes in current track
let autoDjByteRate   = 16000;  // bytes/sec for current track (updated per track)
let autoDjTrackStart = 0;      // wall-clock ms when current track streaming began
let autoDjBytesSent  = 0;      // bytes sent for current track so far

// PUBLICIDAD / CUÑAS
let adPlaylist       = [];     // Lista de archivos en backend/ads/
let currentAdIndex   = 0;      // Índice de la próxima cuña a reproducir
let isPlayingAd      = false;  // true mientras suena una cuña
let adInterval       = 3;      // reproducir cuña cada N canciones (0 = desactivado)
let songsSinceLastAd = 0;      // canciones reproducidas desde la última cuña

const loadAds = () => {
    adPlaylist = fs.existsSync(adDir)
        ? fs.readdirSync(adDir).filter(f => f.endsWith('.mp3'))
        : [];
    console.log(`Publicidad: ${adPlaylist.length} cuñas cargadas.`);
};

// Detect MP3 bitrate by scanning frames from the file.
// For VBR accuracy we use the file size / duration approach when possible,
// falling back to scanning frames from multiple positions in the file.
const detectMp3ByteRate = (fd) => {
    const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const fileSize = fs.fstatSync(fd).size;
    const CHUNK = 65536; // 64KB per sample
    
    // Detect ID3v2 tag size
    const id3Buf = Buffer.alloc(10);
    fs.readSync(fd, id3Buf, 0, 10, 0);
    let audioOffset = 0;
    if (id3Buf[0] === 0x49 && id3Buf[1] === 0x44 && id3Buf[2] === 0x33) {
        audioOffset = 10 + (((id3Buf[6] & 0x7F) << 21) | ((id3Buf[7] & 0x7F) << 14) |
                            ((id3Buf[8] & 0x7F) << 7)  |  (id3Buf[9] & 0x7F));
    }

    // Sample frames from multiple positions: start, 25%, 50%, 75% of audio data
    const audioSize = fileSize - audioOffset;
    const samplePositions = [
        audioOffset,
        audioOffset + Math.floor(audioSize * 0.25),
        audioOffset + Math.floor(audioSize * 0.50),
        audioOffset + Math.floor(audioSize * 0.75)
    ];

    const foundBitrates = [];
    const buf = Buffer.alloc(CHUNK);

    for (const pos of samplePositions) {
        if (pos >= fileSize) continue;
        const n = fs.readSync(fd, buf, 0, CHUNK, pos);
        for (let i = 0; i < n - 3 && foundBitrates.length < 50; i++) {
            if (buf[i] !== 0xFF || (buf[i + 1] & 0xE0) !== 0xE0) continue;
            const b1 = buf[i + 1], b2 = buf[i + 2];
            const mpeg  = (b1 >> 3) & 0x03;
            const layer = (b1 >> 1) & 0x03;
            const bri   = (b2 >> 4) & 0x0F;
            const sampleRateIdx = (b2 >> 2) & 0x03;
            const padding = (b2 >> 1) & 0x01;
            if (mpeg !== 3 || layer !== 1 || bri === 0 || bri === 15 || sampleRateIdx === 3) continue;
            const kbps = MPEG1_L3_KBPS[bri];
            const sampleRate = [44100, 48000, 32000][sampleRateIdx];
            const frameSize = Math.floor(144 * kbps * 1000 / sampleRate) + padding;
            if (frameSize < 24 || frameSize > 1441) continue;
            const nextFramePos = i + frameSize;
            if (nextFramePos + 1 < n && buf[nextFramePos] === 0xFF && (buf[nextFramePos + 1] & 0xE0) === 0xE0) {
                foundBitrates.push(kbps);
                i += frameSize - 1;
            }
        }
    }

    if (foundBitrates.length === 0) return 40000; // fallback 320kbps (generous)
    // Use MAX found bitrate — ensures we never send slower than any part of the file
    const maxKbps = Math.max(...foundBitrates);
    return maxKbps * 125; // kbps -> bytes/sec
};

// Detect byte offset where actual MPEG audio frames begin (skipping ID3v2 tag).
// Streaming from here avoids injecting ID3 metadata mid-stream, which corrupts
// the browser's MP3 decoder and causes audible cuts/glitches on track transitions.
const detectAudioStart = (fd) => {
    const header = Buffer.alloc(10);
    const n = fs.readSync(fd, header, 0, 10, 0);
    if (n >= 10 && header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) { // "ID3"
        const tagSize = ((header[6] & 0x7F) << 21) | ((header[7] & 0x7F) << 14) |
                        ((header[8] & 0x7F) << 7)  |  (header[9] & 0x7F);
        return 10 + tagSize;
    }
    return 0;
};

// Fisher-Yates shuffle helper
const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

// Construye una nueva cola de reproducción con las canciones que aún no se han
// reproducido en este ciclo. Si ya se tocaron todas, reinicia el ciclo.
const rebuildQueue = () => {
    if (!fs.existsSync(musicDir)) { playlist = []; return; }
    const allFiles = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));

    // Quitar de playedSongs cualquier canción que ya no exista en disco
    for (const s of playedSongs) {
        if (!allFiles.includes(s)) playedSongs.delete(s);
    }

    // Canciones pendientes = las que están en disco y NO se han tocado aún
    let pending = allFiles.filter(f => !playedSongs.has(f));

    // Si no quedan pendientes, nuevo ciclo: resetear playedSongs
    if (pending.length === 0) {
        playedSongs.clear();
        // La canción actual sigue marcada para no repetirla justo después
        if (currentTrackName && allFiles.includes(currentTrackName)) {
            playedSongs.add(currentTrackName);
        }
        pending = allFiles.filter(f => !playedSongs.has(f));
    }

    playlist = shuffle(pending);
    console.log(`AutoDJ: Cola actualizada — ${playlist.length} pendientes de ${allFiles.length} totales.`);
};

// loadPlaylist: se llama al inicio y al subir/borrar canciones.
// NO interrumpe la canción que está sonando.
const loadPlaylist = () => {
    rebuildQueue();
};

const stopAutoDj = () => {
    if (autoDjTimer) { clearInterval(autoDjTimer); autoDjTimer = null; }
    if (autoDjFd !== null) { try { fs.closeSync(autoDjFd); } catch(e) {} autoDjFd = null; }
    audioRingBuffer = [];
    audioRingBufferSize = 0;
};

// Ring buffer: almacena los últimos ~10 segundos de audio para enviar burst al conectar
const MAX_RING_BUFFER = 320000 * 10 / 8; // 10 seg a 320kbps = ~400KB
let audioRingBuffer = [];
let audioRingBufferSize = 0;

const pushToRingBuffer = (chunk) => {
    audioRingBuffer.push(chunk);
    audioRingBufferSize += chunk.length;
    while (audioRingBufferSize > MAX_RING_BUFFER) {
        const removed = audioRingBuffer.shift();
        audioRingBufferSize -= removed.length;
    }
};

const broadcastChunk = (chunk) => {
    pushToRingBuffer(chunk);
    const dead = [];
    activeListeners.forEach(res => {
        try {
            res.write(chunk);
        } catch(e) {
            dead.push(res);
        }
    });
    dead.forEach(res => {
        activeListeners.delete(res);
        try { res.end(); } catch(e) {}
    });
    if (dead.length > 0) {
        currentListeners = activeListeners.size;
        io.emit('listenersCount', currentListeners);
    }
};

// Saca la siguiente canción de la cola. Si la cola está vacía, la reconstruye.
const getNextTrack = () => {
    if (playlist.length === 0) rebuildQueue();
    if (playlist.length === 0) return null; // No hay canciones en disco
    return playlist.shift(); // Toma y elimina la primera de la cola
};

const playNextAutoDjTrack = () => {
    if (radioState.isDjLive) return;

    stopAutoDj();

    const nextFile = getNextTrack();
    if (!nextFile) {
        console.log('AutoDJ: No hay canciones disponibles.');
        return;
    }

    try {
        const trackPath = path.join(musicDir, nextFile);
        const fd = fs.openSync(trackPath, 'r');
        const size = fs.fstatSync(fd).size;
        const byteRate = detectMp3ByteRate(fd);
        const audioStart = detectAudioStart(fd);
        console.log(`AutoDJ -> Play: ${nextFile} (${Math.round(byteRate * 8 / 1000)} kbps, audio@${audioStart})`);

        autoDjFd         = fd;
        autoDjTrackSize  = size;
        autoDjByteRate   = byteRate;
        autoDjPos        = audioStart;
        autoDjBytesSent  = 0;
        autoDjTrackStart = Date.now();
        currentTrackName = nextFile;
        playedSongs.add(nextFile);
        
        const cleanName = cleanSongName(nextFile);
        radioState.currentSong = cleanName;
        addToHistory(cleanName);
        io.emit('radioData', { ...radioState, history: songHistory });
    } catch(e) {
        console.error('AutoDJ: Error abriendo track:', e.message);
        setTimeout(playNextAutoDjTrack, 500);
        return;
    }

    const buf = Buffer.allocUnsafe(MAX_BURST_BYTES);

    autoDjTimer = setInterval(() => {
        if (radioState.isDjLive) return;

        // Cambio de pista inline — sin gap de silencio
        if (autoDjPos >= autoDjTrackSize) {
            if (autoDjFd !== null) { try { fs.closeSync(autoDjFd); } catch(e) {} autoDjFd = null; }

            // Si acabó una canción (no una cuña), incrementar contador
            if (!isPlayingAd) songsSinceLastAd++;

            // Decidir: ¿cuña o canción?
            const timeForAd = adPlaylist.length > 0 && adInterval > 0 && songsSinceLastAd >= adInterval;

            if (!isPlayingAd && timeForAd) {
                // --- Reproducir cuña ---
                const adFile = adPlaylist[currentAdIndex % adPlaylist.length];
                currentAdIndex = (currentAdIndex + 1) % adPlaylist.length;
                const adPath = path.join(adDir, adFile);
                try {
                    const fd   = fs.openSync(adPath, 'r');
                    const size = fs.fstatSync(fd).size;
                    const byteRate = detectMp3ByteRate(fd);
                    console.log(`📢 Publicidad: ${adFile}`);
                    autoDjFd         = fd;
                    autoDjTrackSize  = size;
                    autoDjByteRate   = byteRate;
                    autoDjPos        = 0;
                    autoDjBytesSent  = 0;
                    autoDjTrackStart = Date.now();
                    isPlayingAd      = true;
                    songsSinceLastAd = 0;
                    radioState.currentSong = '📢 Publicidad';
                    io.emit('radioData', { ...radioState, history: songHistory });
                } catch(e) {
                    console.error('AutoDJ: Error abriendo cuña:', e.message);
                    isPlayingAd = false;
                }
            } else {
                // --- Reproducir siguiente canción ---
                isPlayingAd = false;
                const nextFile = getNextTrack();
                if (!nextFile) {
                    console.log('AutoDJ: No hay más canciones.');
                    clearInterval(autoDjTimer); autoDjTimer = null;
                    return;
                }
                try {
                    const trackPath  = path.join(musicDir, nextFile);
                    const fd         = fs.openSync(trackPath, 'r');
                    const size       = fs.fstatSync(fd).size;
                    const byteRate   = detectMp3ByteRate(fd);
                    const audioStart = detectAudioStart(fd);
                    console.log(`AutoDJ -> Play: ${nextFile} (${Math.round(byteRate * 8 / 1000)} kbps)`);
                    autoDjFd         = fd;
                    autoDjTrackSize  = size;
                    autoDjByteRate   = byteRate;
                    autoDjPos        = audioStart;
                    autoDjBytesSent  = 0;
                    autoDjTrackStart = Date.now();
                    currentTrackName = nextFile;
                    playedSongs.add(nextFile);
                    const cleanName  = cleanSongName(nextFile);
                    radioState.currentSong = cleanName;
                    addToHistory(cleanName);
                    io.emit('radioData', { ...radioState, history: songHistory });
                } catch(e) {
                    console.error('AutoDJ: Error cambiando pista:', e.message);
                    return;
                }
            }
        }

        // Time-compensated: send bytes at SPEED_FACTOR × real-time to build client buffer
        const elapsed  = Date.now() - autoDjTrackStart;
        const expected = Math.floor(autoDjByteRate * SPEED_FACTOR * elapsed / 1000);
        const toSend   = Math.min(expected - autoDjBytesSent, MAX_BURST_BYTES);
        if (toSend <= 0) return; // ahead of schedule, wait

        let bytesRead = 0;
        try {
            bytesRead = fs.readSync(autoDjFd, buf, 0, toSend, autoDjPos);
        } catch(e) {
            console.error('AutoDJ: Error leyendo track:', e.message);
            autoDjPos = autoDjTrackSize;
            return;
        }

        if (bytesRead > 0) {
            autoDjPos      += bytesRead;
            autoDjBytesSent += bytesRead;
            broadcastChunk(Buffer.from(buf.slice(0, bytesRead)));
        }
    }, TICK_MS);
};

// Inicializar el AutoDJ
loadPlaylist();
loadAds();
setTimeout(playNextAutoDjTrack, 2000);

// Endpoint Lector (Oyentes)
app.get('/stream', (req, res) => {
  // Enviar cabeceras inmediatamente evitando que el navegador espere un fin
  res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
      'icy-name': 'Urbanova Radio',
      'icy-description': 'Transmisión en vivo ininterrumpida',
      'icy-pub': '1',
      'icy-br': '128'
  });

  // Enviar burst del ring buffer para que el navegador empiece a reproducir de inmediato
  if (audioRingBuffer.length > 0) {
    try { res.write(Buffer.concat(audioRingBuffer)); } catch(e) {}
  }

  activeListeners.add(res);
  currentListeners = activeListeners.size;
  io.emit('listenersCount', currentListeners);

  const removeListener = () => {
    if (activeListeners.delete(res)) {
      currentListeners = activeListeners.size;
      io.emit('listenersCount', currentListeners);
    }
  };

  req.on('close', removeListener);
  req.on('error', removeListener);
});
// Manejador IceCast fuera de Express — responde HTTP/1.0 directo al socket
async function handleBroadcast(req, res) {
    const auth = req.headers['authorization'];
    let isAuthenticated = false;
    let currentDj = null;

    if (auth && auth.startsWith('Basic ')) {
        const b64auth = auth.split(' ')[1];
        const decoded = Buffer.from(b64auth, 'base64').toString();
        const colonIndex = decoded.indexOf(':');
        const login = decoded.substring(0, colonIndex);
        const password = decoded.substring(colonIndex + 1);

        if (login && login !== 'source') {
            currentDj = await authenticateDj(login, password);
            if (currentDj) isAuthenticated = true;
        } else {
            // Algunos programas (BUTT, Mixxx) envían "source" como usuario
            // El DJ debe poner su username en el campo "Nombre de Sesión" (ice-name)
            const iceName = req.headers['ice-name'] || req.headers['icy-name'];
            if (iceName) {
                currentDj = await authenticateDj(iceName, password);
                if (currentDj) isAuthenticated = true;
            }
        }
    }

    if (!isAuthenticated && req.headers['ice-password']) {
        const iceName = req.headers['ice-name'] || req.headers['icy-name'];
        if (iceName) {
            currentDj = await authenticateDj(iceName, req.headers['ice-password']);
            if (currentDj) isAuthenticated = true;
        }
    }

    if (!isAuthenticated) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Icecast Server"' });
        res.end();
        return;
    }

    if (radioState.isDjLive) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Ya hay un DJ en transmisión en vivo.');
        return;
    }

    const encoderName = (currentDj ? currentDj.display_name : null) || req.headers['ice-name'] || "DJ Residente";
    console.log(`🎙️ === DJ CONECTADO: ${encoderName} (${req.method} HTTP/${req.httpVersion}) === 🎙️`);

    // Detener AutoDJ
    stopAutoDj();

    radioState.isDjLive = true;
    radioState.djName = encoderName;
    radioState.currentSong = "¡Transmisión en Vivo!";
    addToHistory(`🎙️ DJ Show: ${encoderName}`);
    io.emit('radioData', { ...radioState, history: songHistory });
    io.emit('systemMessage', { text: `🎙️ ¡Un DJ se ha conectado (${encoderName}) y estamos EN VIVO!`, isError: false });

    const socket = req.socket;
    socket.setTimeout(0);

    // Respuesta IceCast pura antes de desconectar el parser HTTP
    socket.write('HTTP/1.0 200 OK\r\n\r\n');

    // CRÍTICO: remover todos los listeners del parser HTTP del socket para que
    // no intente parsear el stream de audio como HTTP y tire "Parse Error"
    socket.removeAllListeners('data');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
    socket.removeAllListeners('end');

    // Neutralizar el objeto res para que Node.js no interfiera más
    res.writeHead = () => {};
    res.write = () => {};
    res.end = () => {};

    let isDisconnected = false;

    const endConnection = () => {
        if (isDisconnected) return;
        isDisconnected = true;
        console.log('🎙️ === DJ DESCONECTADO: RETORNANDO A AutoDJ === 🎙️');
        radioState.isDjLive = false;
        radioState.djName = null;
        radioState.currentSong = "Cargando AutoDJ...";
        io.emit('radioData', radioState);
        io.emit('systemMessage', { text: "🎙️ El DJ se ha desconectado. Regresando a la programación habitual.", isError: false });
        // No need to adjust index; queue-based AutoDJ picks next song automatically
        playNextAutoDjTrack();
        try { socket.destroy(); } catch(e) {}
    };

    // Ahora el socket es nuestro — recibimos el stream de audio directamente
    socket.on('data', (chunk) => {
        activeListeners.forEach(clientRes => {
            try { clientRes.write(chunk); } catch(e) {}
        });
    });

    socket.on('close', endConnection);
    socket.on('error', endConnection);
}
// --- API REST PARA LA GESTIÓN DEL DASHBOARD Y CALENDARIO ---

app.post('/api/dj/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const dj = await authenticateDj(username, password);
        if (dj) {
            const { password: _, ...djData } = dj; 
            res.json({ success: true, dj: djData });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.get('/api/schedules', async (req, res) => {
    try {
        const schedules = await getSchedules();
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/schedules', async (req, res) => {
    const { username, password, day_of_week, start_time, end_time, show_name } = req.body;
    try {
        const dj = await authenticateDj(username, password);
        if (!dj) return res.status(401).json({ error: 'No autorizado' });

        const result = await addSchedule(dj.id, day_of_week, start_time, end_time, show_name);
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    const { username, password } = req.body;
    try {
        const dj = await authenticateDj(username, password);
        if (!dj) return res.status(401).json({ error: 'No autorizado' });

        // Check if schedule belongs to this DJ (or DJ is admin)
        const schedule = await getScheduleById(req.params.id);
        if (!schedule) return res.status(404).json({ error: 'Turno no encontrado' });
        if (schedule.dj_id !== dj.id && dj.username !== 'admin') {
            return res.status(403).json({ error: 'Solo puedes borrar tus propios turnos' });
        }

        await deleteSchedule(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// --- RADIO STATUS API ---

app.get('/api/radio/status', (req, res) => {
    const totalSongs = fs.existsSync(musicDir)
        ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3')).length
        : 0;
    res.json({
        isDjLive: radioState.isDjLive,
        djName: radioState.djName,
        currentSong: radioState.currentSong,
        listeners: currentListeners,
        totalSongs
    });
});

// --- ADMIN API ENDPOINTS ---

const checkAdmin = async (req, res, next) => {
    const user = req.headers['admin-user'];
    const pass = req.headers['admin-pass'];
    if (!user || !pass) return res.status(401).json({ error: 'Faltan credenciales' });
    
    // We only allow "admin" to manage other DJs and Music
    if (user !== 'admin') return res.status(403).json({ error: 'Solo Admin puede realizar esta acción' });
    
    const dj = await authenticateDj(user, pass);
    if (!dj) return res.status(401).json({ error: 'Credenciales inválidas' });
    
    next();
};

app.get('/api/admin/djs', checkAdmin, async (req, res) => {
    try {
        const djs = await getAllDjs();
        res.json(djs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/djs', checkAdmin, async (req, res) => {
    const { username, password, display_name } = req.body;
    try {
        const result = await createDj(username, password, display_name);
        res.json({ success: true, dj: result });
    } catch (err) {
        res.status(500).json({ error: 'El usuario ya existe o hubo un error' });
    }
});

app.delete('/api/admin/djs/:id', checkAdmin, async (req, res) => {
    try {
        // Prevent deleting the main admin
        if (req.params.id === '1') return res.status(403).json({ error: 'No se puede borrar al Admin maestro' });
        
        await deleteDj(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/music', checkAdmin, (req, res) => {
    try {
        if (!fs.existsSync(musicDir)) return res.json([]);
        const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/music', checkAdmin, upload.single('song'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    loadPlaylist(); // Recargar playlist con la nueva canción
    res.json({ success: true, filename: req.file.originalname });
});

app.delete('/api/admin/music/:filename', checkAdmin, (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(musicDir, filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            loadPlaylist(); // Actualizar lista interna AutoDJ
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Archivo no encontrado' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PUBLICIDAD / CUÑAS ---

app.get('/api/admin/ads', checkAdmin, (req, res) => {
    loadAds();
    res.json({ ads: adPlaylist, interval: adInterval });
});

app.post('/api/admin/ads/upload', checkAdmin, uploadAd.single('ad'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    loadAds();
    res.json({ success: true, filename: req.file.originalname });
});

app.delete('/api/admin/ads/:filename', checkAdmin, (req, res) => {
    try {
        const adPath = path.join(adDir, req.params.filename);
        if (fs.existsSync(adPath)) fs.unlinkSync(adPath);
        loadAds();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/ads/config', checkAdmin, (req, res) => {
    const { interval } = req.body;
    if (typeof interval === 'number' && interval >= 0) {
        adInterval = Math.floor(interval);
        songsSinceLastAd = 0; // reset counter when interval changes
    }
    res.json({ interval: adInterval });
});

app.post('/api/admin/skip', checkAdmin, (req, res) => {
    if (radioState.isDjLive) {
        return res.status(400).json({ error: 'No se puede saltar cuando hay DJ en vivo' });
    }
    // Force track end — the interval will pick the next song
    autoDjPos = autoDjTrackSize;
    res.json({ success: true, message: 'Saltando a la siguiente canción' });
});

// -------------------------------------------------------------

io.on('connection', (socket) => {
  socket.on('join', async (username) => {
    try {
      let user = await getUser(username);
      if (!user) user = await createUser(username);
      
      socket.emit('chatHistory', chatHistory);
      socket.emit('userData', user);
      
socket.emit('listenersCount', currentListeners);
      socket.emit('radioData', { ...radioState, history: songHistory }); // Enviar estado del DJ/AutoDJ con historial
    } catch (e) {
      console.error('Error in join event:', e);
    }
  });

  socket.on('sendMessage', async (messageData) => {
    try {
      let user = await getUser(messageData.user);
      if (user) {
        user = await addXP(user.username, 1);
        socket.emit('userData', user);
      }

      const userLevel = user ? user.level : 1;
      const newMessage = {
        id: Date.now(),
        user: messageData.user || 'Anonymous',
        text: messageData.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        level: userLevel
      };
      
      chatHistory.push(newMessage);
      if (chatHistory.length > 50) chatHistory.shift();
      
      io.emit('newMessage', newMessage);
    } catch (e) {
      console.error('Error saving message/xp:', e);
    }
  });

// Evento especial para que el DJ actualice la canción actual
  // DjDashboard manda: { token (=password), songName, djName (opcional) }
  socket.on('updateCurrentSong', async (data) => {
      const { token, songName, username: djUser } = data;
      // Intentar autenticar si tenemos usuario+token, o simplemente actualizar si hay DJ en vivo
      let allowed = false;
      if (djUser && token) {
          const dj = await authenticateDj(djUser, token);
          if (dj) allowed = true;
      } else if (radioState.isDjLive) {
          // Sin credenciales pero hay DJ en vivo: permitimos (mejora: token-based en futuro)
          allowed = true;
      }
      if (allowed && radioState.isDjLive) {
          radioState.currentSong = songName;
          addToHistory(songName);
          io.emit('radioData', { ...radioState, history: songHistory });
          io.emit('systemMessage', { text: `🎵 Sonando ahora: ${songName}`, isError: false });
      }
  });
});

// Catch-all: cualquier ruta no-API sirve index.html (React Router)
if (fs.existsSync(distPath)) {
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor backend de Urbanova Radio corriendo en http://localhost:${PORT}`);
  console.log(`🎧 Endpoint de Escucha: GET http://localhost:${PORT}/stream`);
});
