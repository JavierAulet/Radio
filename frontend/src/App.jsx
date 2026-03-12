import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Play, Pause, Volume2, VolumeX, MessageSquare, Send, Share2, Settings, Radio, Users, Clock, Bell } from 'lucide-react';
import { io } from 'socket.io-client';
import DjDashboard from './DjDashboard';
import AdminDashboard from './AdminDashboard';

// URLs relativas: en dev Vite proxea /api, /stream y /socket.io al backend (puerto 8000).
// En producción Express sirve el frontend y el backend en el mismo origen/puerto.
const socket = io();
const STREAM_URL = '/stream';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function RadioPlayer() {
  const [isPlaying, setIsPlaying]   = useState(false);
  const [volume, setVolume]         = useState(0.7);
  const [isMuted, setIsMuted]       = useState(false);
  const [chatMessages, setChatMessages]   = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
const [radioInfo, setRadioInfo]   = useState({ isDjLive: false, djName: null, currentSong: 'Conectando...' });
  const [schedules, setSchedules]   = useState([]);
  const [username, setUsername]     = useState('');
  const [userLevel, setUserLevel]   = useState(1);
  const [userXp, setUserXp]         = useState(0);
  const [listenerCount, setListenerCount] = useState(0);
  const [activeTab, setActiveTab]   = useState('chat'); // 'chat' | 'requests' | 'history'
  const [needsClick, setNeedsClick] = useState(false);
  const [toasts, setToasts]         = useState([]);

  // Unique color per username from a curated palette
  const USER_COLORS = [
    '#ff6b6b', '#ffa502', '#2ed573', '#1e90ff', '#ff6348',
    '#7bed9f', '#70a1ff', '#ff4757', '#eccc68', '#a29bfe',
    '#fd79a8', '#00cec9', '#e17055', '#6c5ce7', '#55efc4',
    '#fdcb6e', '#e84393', '#00b894', '#0984e3', '#d63031'
  ];
  const getUserColor = (name) => {
    if (!name || name === 'Sistema') return 'var(--text-muted)';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  };

  const addToast = (text, type = 'info') => {
    setToasts(prev => {
      if (prev.some(t => t.text === text)) return prev; // no duplicates
      const id = Date.now() + Math.random();
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
      return [...prev.slice(-3), { id, text, type }];
    });
  };

  const audioRef       = useRef(null);
  const canvasRef      = useRef(null);
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const chatContainerRef = useRef(null);
  const isPlayingRef   = useRef(false);
  const userHasInteracted = useRef(false); // true después del primer click real
  const srcChangedAt   = useRef(0);        // timestamp del último cambio de src

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Auto-reconnect helper
  const reconnectStream = useRef(null);
  const reconnectTimer  = useRef(null);
  const reconnectCount  = useRef(0);
  const MAX_RECONNECTS  = 8;

  const doReconnect = () => {
    // Solo reconectar si el usuario ya interactuó y no excedimos intentos
    if (!audioRef.current || !userHasInteracted.current) return;
    if (reconnectCount.current >= MAX_RECONNECTS) return;
    clearTimeout(reconnectTimer.current);
    reconnectCount.current++;
    reconnectTimer.current = setTimeout(() => {
      if (!audioRef.current) return;
      console.log(`[Radio] Reconectando stream (${reconnectCount.current}/${MAX_RECONNECTS})…`);
      srcChangedAt.current = Date.now();
      audioRef.current.src = `${STREAM_URL}?t=${Date.now()}`;
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }, 2000);
  };
  reconnectStream.current = doReconnect;

  // Autoplay al cargar + attach recovery listeners
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    srcChangedAt.current = Date.now();
    audio.src = `${STREAM_URL}?t=${Date.now()}`;
    audio.volume = 0.7;
    audio.play()
      .then(() => { setIsPlaying(true); setNeedsClick(false); })
      .catch(() => { setNeedsClick(true); });

    const onError = () => {
      // Ignorar errores generados por cambio de src (MEDIA_ERR_ABORTED)
      // El navegador los dispara al cambiar audio.src, no son errores reales
      if (Date.now() - srcChangedAt.current < 1000) return;
      console.warn('[Radio] Stream error — reconectando');
      if (reconnectStream.current) reconnectStream.current();
    };
    const onPlaying = () => { reconnectCount.current = 0; };

    audio.addEventListener('error', onError);
    audio.addEventListener('playing', onPlaying);

    return () => {
      audio.removeEventListener('error', onError);
      audio.removeEventListener('playing', onPlaying);
      clearTimeout(reconnectTimer.current);
    };
  }, []);

  // Click para empezar — una vez interactuado, nunca volver al overlay
  const startFromClick = () => {
    const audio = audioRef.current;
    if (!audio) return;
    userHasInteracted.current = true;
    setNeedsClick(false); // ocultar overlay inmediatamente
    srcChangedAt.current = Date.now();
    audio.src = `${STREAM_URL}?t=${Date.now()}`;
    audio.play()
      .then(() => { setIsPlaying(true); })
      .catch(() => {
        // Si falla incluso con gesto de usuario (muy raro), intentar de nuevo en 1s
        setTimeout(() => {
          if (!audioRef.current) return;
          audioRef.current.play().catch(() => {});
        }, 1000);
      });
  };

  // Socket setup
  useEffect(() => {
    const name = 'User' + Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    setUsername(name);
    socket.emit('join', name);

    socket.on('userData',           d  => { setUserLevel(d.level); setUserXp(d.xp); });
    socket.on('chatHistory',        h  => setChatMessages(h));
    socket.on('newMessage',         m  => setChatMessages(p => [...p, m]));
    socket.on('systemMessage',      m  => {
      setChatMessages(p => [...p, {
        id: Date.now(), user: 'Sistema', text: m.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), level: 99
      }]);
      addToast(m.text, m.isError ? 'error' : 'info');
    });
socket.on('radioData',           d => {
      const prev = radioInfo.currentSong;
      setRadioInfo(d);
      if (d.currentSong && d.currentSong !== prev && d.currentSong !== 'Conectando...') {
        addToast(`🎵 ${d.currentSong}`, 'song');
      }
    });
    socket.on('listenersCount',      n => setListenerCount(n));

    fetch(`${BACKEND}/api/schedules`)
      .then(r => r.json()).then(setSchedules).catch(() => {});

    return () => {
      socket.off('userData'); socket.off('chatHistory'); socket.off('newMessage');
      socket.off('systemMessage'); socket.off('radioData'); socket.off('listenersCount');
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current)
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatMessages]);

  // Audio visualizer
  useEffect(() => {
    if (!isPlaying || !canvasRef.current) return;

    if (!audioCtxRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        const src = ctx.createMediaElementSource(audioRef.current);
        src.connect(analyser);
        analyser.connect(ctx.destination);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch(e) {
        // createMediaElementSource falla sin crossOrigin en algunos navegadores;
        // el audio sigue funcionando, solo sin visualizador
        return;
      }
    } else if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    const canvas   = canvasRef.current;
    const ctx2d    = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufLen   = analyser.frequencyBinCount;
    const data     = new Uint8Array(bufLen);
    let raf;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      const barW = (canvas.width / bufLen) * 2.2;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const h = data[i] * 0.55;
        const g = ctx2d.createLinearGradient(0, canvas.height - h, 0, canvas.height);
        g.addColorStop(0, `rgba(0, 243, 255, ${data[i] / 255})`);
        g.addColorStop(1, `rgba(255, 0, 229, 0.6)`);
        ctx2d.fillStyle = g;
        const r = Math.min(barW / 2, 3);
        ctx2d.beginPath();
        ctx2d.roundRect(x, canvas.height - h, barW, h, r);
        ctx2d.fill();
        x += barW + 2;
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.src = `${STREAM_URL}?t=${Date.now()}`;
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(p => !p);
  };

  const handleVolumeChange = e => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.volume = next ? 0 : volume;
  };

  const sendMessage = e => {
    e.preventDefault();
    if (!currentMessage.trim()) return;
    socket.emit('sendMessage', { user: username, text: currentMessage });
    setCurrentMessage('');
  };

// XP progress for next level
  const xpForLevel = lvl => lvl * 10;
  const xpProgress = Math.min(((userXp % 10) / 10) * 100, 100);

  return (
    <div className="app-container">
      <audio ref={audioRef} preload="none" />

      {/* Overlay "click para escuchar" cuando el navegador bloquea autoplay */}
      {needsClick && (
        <div onClick={startFromClick} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', cursor: 'pointer'
        }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            border: '3px solid var(--neon-cyan)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 30px var(--neon-cyan)', marginBottom: '1.5rem'
          }}>
            <Play size={40} color="var(--neon-cyan)" />
          </div>
          <p style={{ color: 'var(--neon-cyan)', fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
            Click para escuchar
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            El navegador requiere una interacción para reproducir audio
          </p>
        </div>
      )}

      {/* ── TOASTS ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Bell size={13} style={{ flexShrink: 0 }} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* ── MAIN AREA ── */}
      <main className="main-content glass-panel">
        
        {/* Visualizer */}
        <div className="visualizer-container">
          <div className="visualizer-bg" />

          <canvas
            ref={canvasRef}
            width={900}
            height={280}
            style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%', objectFit: 'fill' }}
          />

          {/* User badge top-right */}
          <div style={{
            position: 'absolute', top: '0.85rem', right: '0.85rem', zIndex: 20,
            display: 'flex', alignItems: 'center', gap: '0.75rem'
          }}>
            {/* Listener count */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'rgba(0,0,0,0.5)', borderRadius: '20px',
              padding: '0.35rem 0.75rem', border: '1px solid rgba(255,255,255,0.07)',
              backdropFilter: 'blur(10px)', fontSize: '0.72rem',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)'
            }}>
              <Users size={13} color="var(--neon-green)" />
              <span style={{ color: 'var(--neon-green)', fontWeight: 600 }}>{listenerCount}</span>
              <span>oyentes</span>
            </div>

            {/* User level */}
            <div style={{
              background: 'rgba(0,0,0,0.5)', borderRadius: '20px',
              padding: '0.35rem 0.75rem', border: '1px solid rgba(0, 243, 255, 0.15)',
              backdropFilter: 'blur(10px)', fontSize: '0.72rem',
              color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)',
              display: 'flex', gap: '0.4rem', alignItems: 'center'
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{username}</span>
              <span>·</span>
              <span style={{ fontWeight: 700 }}>Lvl {userLevel}</span>
              <span style={{ color: 'var(--text-subtle)' }}>({userXp} XP)</span>
            </div>
          </div>

          {/* Station logo bottom-left overlay */}
          {!isPlaying && (
            <div style={{
              position: 'absolute', bottom: '1rem', left: '1rem', zIndex: 15,
              display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start'
            }}>
              <img src="/logo.png" alt="Urbanova Radio" style={{ height: '56px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,243,255,0.4))' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.2em' }}>
                24/7 · EN VIVO
              </span>
            </div>
          )}
        </div>

        {/* Player Bar */}
        <div className="player-bar glass-panel m-4">
          {/* Song info */}
          <div className="song-info">
            <img
              src="/logo.png"
              alt="Album Art"
              className={`album-art ${isPlaying ? 'playing' : ''}`}
            />
            <div className="song-details">
              <h3 style={{ color: radioInfo.isDjLive ? 'var(--neon-magenta)' : 'var(--text-main)' }}>
                {radioInfo.currentSong}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ color: radioInfo.isDjLive ? 'var(--neon-magenta)' : 'var(--text-muted)' }}>
                  {radioInfo.isDjLive ? `🎙️ ${radioInfo.djName}` : 'AutoDJ'}
                </p>
                {radioInfo.isDjLive && (
                  <span className="live-badge">
                    <span className="live-dot" />
                    EN VIVO
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="player-controls">
            <div className="control-buttons">
              <Link to="/dj-panel" className="btn-icon" title="Panel DJs" style={{ opacity: 0.5 }}>
                <Settings size={18} />
              </Link>
              <button className="btn-play" onClick={togglePlay} title={isPlaying ? 'Pausar' : 'Reproducir'}>
                {isPlaying
                  ? <Pause  size={20} fill="currentColor" />
                  : <Play   size={20} fill="currentColor" style={{ marginLeft: 2 }} />
                }
              </button>
              <button className="btn-icon" title="Compartir" onClick={() => {
                if (navigator.share) navigator.share({ title: 'Urbanova Radio', url: window.location.href });
              }}>
                <Share2 size={18} />
              </button>
            </div>
          </div>

          {/* Volume */}
          <div className="volume-control">
            <button className="btn-icon" onClick={toggleMute}>
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range" className="slider"
              min="0" max="1" step="0.02"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
            />
          </div>
        </div>

        {/* Schedules */}
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', margin: '0 0.75rem 0.75rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Radio size={15} color="var(--neon-cyan)" />
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: '0.7rem',
              letterSpacing: '0.12em', color: 'var(--neon-cyan)', textTransform: 'uppercase', fontWeight: 700
            }}>Programación Semanal</span>
          </div>

          {schedules.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Programación en construcción — ¡sigue disfrutando la música!
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
              {schedules.map(s => (
                <div key={s.id} className="schedule-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--neon-magenta)', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-display)' }}>
                      {DAYS[s.day_of_week]}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                      {s.start_time}–{s.end_time}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>{s.show_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)' }}>🎧 {s.display_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        
        {/* Tab switcher */}
        <div className="glass-panel" style={{
          display: 'flex', padding: '0.3rem', gap: '0.3rem', flexShrink: 0
        }}>
          {[
            { key: 'chat', label: 'Chat', icon: <MessageSquare size={14}/> },
            { key: 'history', label: 'Historial', icon: <Clock size={14}/> },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1, padding: '0.5rem', border: 'none', borderRadius: '10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.8rem',
                transition: 'all 0.2s',
                background: activeTab === t.key ? 'rgba(0, 243, 255, 0.12)' : 'transparent',
                color: activeTab === t.key ? 'var(--neon-cyan)' : 'var(--text-muted)',
                border: activeTab === t.key ? '1px solid rgba(0, 243, 255, 0.25)' : '1px solid transparent',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* CHAT */}
        {activeTab === 'chat' && (
          <div className="chat-panel glass-panel" style={{ flex: 1 }}>
            <div className="panel-header">
              <MessageSquare size={14} /> Live Chat
            </div>
            <div className="panel-content" ref={chatContainerRef}>
              {chatMessages.map(msg => (
                <div key={msg.id} className="chat-message">
                  <div className="avatar" style={{
                    background: msg.user === 'Sistema'
                      ? 'rgba(100,100,120,0.5)'
                      : `linear-gradient(135deg, ${getUserColor(msg.user)}, ${getUserColor(msg.user)}88)`,
                    color: msg.user === 'Sistema' ? 'var(--text-muted)' : '#fff'
                  }}>
                    {msg.user.charAt(0).toUpperCase()}
                  </div>
                  <div className="msg-content">
                    <div className="msg-header">
                      <span className="msg-username" style={{
                        color: msg.user === 'Sistema' ? 'var(--text-muted)' : getUserColor(msg.user)
                      }}>
                        {msg.user}
                        {msg.level && msg.user !== 'Sistema' && (
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-subtle)', marginLeft: '4px' }}>
                            Lvl {msg.level}
                          </span>
                        )}
                      </span>
                      <span className="msg-time">{msg.time}</span>
                    </div>
                    <div className="msg-text" style={{
                      color: msg.user === 'Sistema' ? 'var(--text-muted)' : undefined,
                      fontStyle: msg.user === 'Sistema' ? 'italic' : undefined
                    }}>{msg.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <form className="chat-input-container" onSubmit={sendMessage}>
              <input
                type="text" className="chat-input"
                placeholder="Escribe un mensaje..."
                value={currentMessage}
                onChange={e => setCurrentMessage(e.target.value)}
                maxLength={200}
              />
              <button type="submit" className="btn-send"><Send size={14} /></button>
            </form>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="chat-panel glass-panel" style={{ flex: 1 }}>
            <div className="panel-header">
              <Clock size={14} /> Historial
            </div>
            <div className="panel-content">
              {(radioInfo.history && radioInfo.history.length > 0) ? (
                radioInfo.history.map((song, i) => (
                  <div key={i} className="history-item" style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.7rem 0.85rem', borderRadius: '10px',
                    background: i === 0 ? 'rgba(0, 243, 255, 0.06)' : 'rgba(255,255,255,0.02)',
                    border: i === 0 ? '1px solid rgba(0, 243, 255, 0.15)' : '1px solid rgba(255,255,255,0.03)',
                    marginBottom: '0.35rem', transition: 'all 0.2s'
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                      background: i === 0 ? 'linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta))' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700, color: i === 0 ? '#fff' : 'var(--text-subtle)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {i === 0 ? '▶' : i}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.82rem', fontWeight: i === 0 ? 600 : 400,
                        color: i === 0 ? 'var(--text-main)' : 'var(--text-muted)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>{song}</div>
                      {i === 0 && <div style={{ fontSize: '0.65rem', color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>SONANDO AHORA</div>}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.82rem', padding: '2rem 0' }}>
                  El historial aparecerá aquí cuando suenen canciones.
                </div>
              )}
            </div>
          </div>
        )}

      </aside>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"          element={<RadioPlayer />} />
        <Route path="/dj-panel"  element={<DjDashboard  socket={socket} />} />
        <Route path="/admin"     element={<AdminDashboard socket={socket} />} />
      </Routes>
    </Router>
  );
}
