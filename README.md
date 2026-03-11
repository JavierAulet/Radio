# 📻 Radio Online — Estación En Vivo 24/7

Plataforma completa de radio online con AutoDJ, transmisión en vivo, chat en tiempo real, sistema de peticiones, y paneles de administración. Construida con Node.js + React.

---

## Características

### 🎵 AutoDJ 24/7
- Reproducción automática continua de la biblioteca MP3 cuando no hay DJ en vivo
- Sistema de cola inteligente: no repite canciones hasta que todas hayan sonado
- Detección de bitrate VBR (variable) con muestreo en múltiples posiciones del archivo
- Streaming compensado por tiempo con factor de velocidad 1.05x para evitar cortes
- Salto automático de etiquetas ID3v2 para evitar glitches en el decodificador

### 🎙️ Transmisión en Vivo (DJ)
- Protocolo compatible con Icecast/VirtualDJ/BUTT/Mixxx
- Al conectar un DJ en vivo, el AutoDJ se detiene automáticamente
- Al desconectarse, el AutoDJ reanuda la programación
- Actualización de metadatos de canción en tiempo real

### 💬 Chat en Tiempo Real
- Chat integrado con Socket.IO
- Historial de mensajes persistente durante la sesión
- Sistema de XP por participación
- Mensajes del sistema para eventos (DJ conectado/desconectado)

### 📋 Peticiones de Canciones
- Los oyentes pueden solicitar canciones desde el reproductor
- Las peticiones se almacenan en base de datos

### 📊 Panel de DJ (`/dj-panel`)
- Login con credenciales de DJ
- Estado de la radio en tiempo real (canción actual, oyentes, estado)
- Datos de conexión con botones de copiar al portapapeles
- Actualización de metadatos de canción al aire
- Calendario semanal visual de transmisión con grilla de 7 columnas
- Reserva y eliminación de turnos programados
- Indicador del día actual con highlight

### ⚙️ Panel de Administración (`/admin`)
- 4 tarjetas de estadísticas en tiempo real (Estado, Oyentes, DJs, Canciones)
- Barra "Sonando ahora" con botón Saltar canción
- CRUD completo de locutores (crear/eliminar DJs)
- Gestión de música AutoDJ con drag-and-drop y subida múltiple
- Búsqueda/filtro de canciones en la biblioteca

### 🎨 Reproductor Principal (`/`)
- Visualizador de audio con Web Audio API
- Controles de reproducción y volumen
- Badge de "EN VIVO" cuando hay DJ transmitiendo
- Ticker con nombre de la canción actual
- Auto-reconexión en caso de error fatal del stream

---

## Arquitectura

```
Radio/
├── backend/
│   ├── server.js          # Servidor Express + Socket.IO + streaming
│   ├── database.js        # SQLite: usuarios, DJs, horarios, peticiones
│   ├── music/             # Directorio de archivos MP3 del AutoDJ
│   └── radio.db           # Base de datos SQLite
│
└── frontend/
    └── src/
        ├── App.jsx              # Player principal + chat + peticiones
        ├── DjDashboard.jsx      # Panel de DJ
        ├── AdminDashboard.jsx   # Panel de administración
        └── index.css            # Sistema de diseño completo
```

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Backend | Node.js + Express 5 |
| Tiempo real | Socket.IO |
| Base de datos | SQLite3 |
| Streaming | HTTP chunked (Icecast-compatible) |
| Upload | Multer |
| Frontend | React + Vite |
| Routing | React Router DOM |
| Iconos | Lucide React |
| Audio | Web Audio API |
| Diseño | CSS custom (Inter + JetBrains Mono) |

---

## Instalación

### Requisitos
- Node.js 18+
- npm

### Backend
```bash
cd backend
npm install
node server.js
```
El servidor arranca en `http://localhost:3000`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
El frontend arranca en `http://localhost:5173`

---

## Endpoints API

### Públicos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/stream` | Stream de audio (MP3 chunked) |
| GET | `/api/schedules` | Lista de horarios programados |
| GET | `/api/radio/status` | Estado actual (canción, DJ, oyentes) |
| POST | `/api/dj/login` | Autenticación de DJ |

### Admin (requiere headers `admin-user` + `admin-pass`)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/djs` | Listar todos los DJs |
| POST | `/api/admin/djs` | Crear nuevo DJ |
| DELETE | `/api/admin/djs/:id` | Eliminar DJ |
| GET | `/api/admin/music` | Listar canciones |
| POST | `/api/admin/music` | Subir MP3 |
| DELETE | `/api/admin/music/:filename` | Eliminar canción |
| POST | `/api/admin/skip` | Saltar canción actual |

### Horarios (requiere autenticación DJ)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/schedules` | Reservar turno |
| DELETE | `/api/schedules/:id` | Eliminar turno propio |

---

## Credenciales por defecto

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `supersecret` | Administrador + DJ |

---

## Conexión DJ (VirtualDJ/BUTT/Mixxx)

| Campo | Valor |
|---|---|
| Host | `localhost` (o IP pública) |
| Puerto | `3000` |
| Punto de montaje | `/broadcast` |
| Protocolo | Icecast / HTTP Source |

---

## Socket.IO Events

### Servidor → Cliente
| Evento | Datos | Descripción |
|---|---|---|
| `radioData` | `{ isDjLive, djName, currentSong }` | Estado de la radio |
| `listenersCount` | `number` | Oyentes conectados |
| `chatMessage` | `{ username, text, timestamp }` | Mensaje de chat |
| `chatHistory` | `array` | Historial al conectar |
| `systemMessage` | `{ text, isError }` | Mensajes del sistema |

### Cliente → Servidor
| Evento | Datos | Descripción |
|---|---|---|
| `join` | `username` | Unirse al chat |
| `chatMessage` | `{ username, text }` | Enviar mensaje |
| `updateCurrentSong` | `{ token, username, songName }` | Actualizar metadatos |
