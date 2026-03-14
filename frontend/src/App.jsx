import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Play, Pause, Volume2, VolumeX, MessageSquare, Send, Settings, Radio, Users, Clock, Music, Mic2, TrendingUp, Bell } from 'lucide-react';
import { io } from 'socket.io-client';
import DjDashboard from './DjDashboard';
import AdminDashboard from './AdminDashboard';

const socket = io();
const STREAM_URL = '/stream';
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ── Wave bars animation ─────────────────────────────────────────────────────
const WAVE_COUNT = 60;
function HeroWaves({ isPlaying }) {
  return (
    <div className="hero-waves" aria-hidden="true">
      {Array.from({ length: WAVE_COUNT }).map((_, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            animationDuration: `${0.8 + (i % 7) * 0.18}s`,
            animationDelay: `${(i % 11) * 0.07}s`,
            animationPlayState: isPlaying ? 'running' : 'paused',
            opacity: isPlaying ? (0.4 + (i % 5) * 0.12) : 0.15,
          }}
        />
      ))}
    </div>
  );
}

// ── User color ───────────────────────────────────────────────────────────────
const USER_COLORS = ['#ff6b6b','#ffa502','#2ed573','#1e90ff','#ff6348','#7bed9f','#70a1ff','#ff4757','#eccc68','#a29bfe','#fd79a8','#00cec9','#e17055','#6c5ce7','#55efc4','#fdcb6e','#e84393','#00b894','#0984e3','#d63031'];
const getUserColor = (name) => {
  if (!name || name === 'Sistema') return 'var(--text-muted)';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return USER_COLORS[Math.abs(h) % USER_COLORS.length];
};

// ── Main component ───────────────────────────────────────────────────────────
function RadioPlayer() {
  const [isPlaying, setIsPlaying]     = useState(false);
  const [volume, setVolume]           = useState(0.7);
  const [isMuted, setIsMuted]         = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [radioInfo, setRadioInfo]     = useState({ isDjLive: false, djName: null, currentSong: 'Conectando...' });
  const [schedules, setSchedules]     = useState([]);
  const [username, setUsername]       = useState('');
  const [userLevel, setUserLevel]     = useState(1);
  const [userXp, setUserXp]           = useState(0);
  const [listenerCount, setListenerCount] = useState(0);
  const [activeTab, setActiveTab]     = useState('chat');
  const [needsClick, setNeedsClick]   = useState(false);
  const [toasts, setToasts]           = useState([]);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [topSongs, setTopSongs]       = useState([]);
  const [topArtists, setTopArtists]   = useState([]);

  const audioRef         = useRef(null);
  const canvasRef        = useRef(null);
  const audioCtxRef      = useRef(null);
  const analyserRef      = useRef(null);
  const chatContainerRef = useRef(null);
  const isPlayingRef     = useRef(false);
  const userHasInteracted = useRef(false);
  const srcChangedAt     = useRef(0);
  const reconnectStream  = useRef(null);
  const reconnectTimer   = useRef(null);
  const reconnectCount   = useRef(0);
  const MAX_RECONNECTS   = 8;

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const doReconnect = () => {
    if (!audioRef.current || !userHasInteracted.current) return;
    if (reconnectCount.current >= MAX_RECONNECTS) return;
    clearTimeout(reconnectTimer.current);
    reconnectCount.current++;
    reconnectTimer.current = setTimeout(() => {
      if (!audioRef.current) return;
      srcChangedAt.current = Date.now();
      audioRef.current.src = `${STREAM_URL}?t=${Date.now()}`;
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }, 2000);
  };
  reconnectStream.current = doReconnect;

  // Autoplay
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const isStandalone = window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    srcChangedAt.current = Date.now();
    audio.src = `${STREAM_URL}?t=${Date.now()}`;
    audio.volume = 0.7;
    audio.play()
      .then(() => { setIsPlaying(true); setNeedsClick(false); userHasInteracted.current = true; })
      .catch(() => {
        if (!isStandalone) setNeedsClick(true);
        else setTimeout(() => {
          audio.play().then(() => { setIsPlaying(true); userHasInteracted.current = true; }).catch(() => setNeedsClick(true));
        }, 800);
      });
    const onError = () => {
      if (Date.now() - srcChangedAt.current < 1000) return;
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

  const startFromClick = () => {
    const audio = audioRef.current;
    if (!audio) return;
    userHasInteracted.current = true;
    setNeedsClick(false);
    srcChangedAt.current = Date.now();
    audio.src = `${STREAM_URL}?t=${Date.now()}`;
    audio.play().then(() => setIsPlaying(true)).catch(() => {
      setTimeout(() => { audioRef.current?.play().catch(() => {}); }, 1000);
    });
  };

  // Socket
  useEffect(() => {
    const name = 'User' + Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    setUsername(name);
    socket.emit('join', name);
    socket.on('userData',      d => { setUserLevel(d.level); setUserXp(d.xp); });
    socket.on('chatHistory',   h => setChatMessages(h));
    socket.on('newMessage',    m => setChatMessages(p => [...p, m]));
    socket.on('systemMessage', m => {
      setChatMessages(p => [...p, { id: Date.now(), user: 'Sistema', text: m.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), level: 99 }]);
      addToast(m.text, m.isError ? 'error' : 'info');
    });
    socket.on('radioData', d => {
      const prev = radioInfo.currentSong;
      setRadioInfo(d);
      if (d.currentSong && d.currentSong !== prev && d.currentSong !== 'Conectando...') {
        addToast(`🎵 ${d.currentSong}`, 'song');
      }
    });
    socket.on('listenersCount', n => setListenerCount(n));
    fetch('/api/schedules').then(r => r.json()).then(setSchedules).catch(() => {});
    fetch('/api/top-songs').then(r => r.json()).then(setTopSongs).catch(() => {});
    fetch('/api/top-artists').then(r => r.json()).then(setTopArtists).catch(() => {});
    return () => {
      socket.off('userData'); socket.off('chatHistory'); socket.off('newMessage');
      socket.off('systemMessage'); socket.off('radioData'); socket.off('listenersCount');
    };
  }, []);

  // Crossfade AutoDJ ↔ DJ
  const prevIsDjLive = useRef(null);
  useEffect(() => {
    if (prevIsDjLive.current === null) { prevIsDjLive.current = radioInfo.isDjLive; return; }
    if (prevIsDjLive.current === radioInfo.isDjLive) return;
    prevIsDjLive.current = radioInfo.isDjLive;
    if (!audioRef.current || !isPlayingRef.current) return;
    const audio = audioRef.current;
    const targetVol = audio.volume || volume;
    let cur = targetVol;
    const fadeOut = setInterval(() => {
      cur = Math.max(0, cur - 0.05);
      audio.volume = cur;
      if (cur <= 0) {
        clearInterval(fadeOut);
        srcChangedAt.current = Date.now();
        audio.src = `${STREAM_URL}?t=${Date.now()}`;
        audio.play().catch(() => {});
        let v2 = 0;
        const fadeIn = setInterval(() => {
          v2 = Math.min(targetVol, v2 + 0.05);
          audio.volume = v2;
          if (v2 >= targetVol) clearInterval(fadeIn);
        }, 30);
      }
    }, 30);
  }, [radioInfo.isDjLive]);

  // Chat scroll
  useEffect(() => {
    if (chatContainerRef.current)
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatMessages]);

  // Visualizer
  useEffect(() => {
    if (!isPlaying || !canvasRef.current) return;
    if (!audioCtxRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        const src = ctx.createMediaElementSource(audioRef.current);
        src.connect(analyser); analyser.connect(ctx.destination);
        audioCtxRef.current = ctx; analyserRef.current = analyser;
      } catch(e) { return; }
    } else if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    const canvas = canvasRef.current;
    const ctx2d = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);

    // Adaptar el buffer del canvas al tamaño real en pantalla
    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      ctx2d.scale(dpr, dpr);
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx2d.clearRect(0, 0, w, h);
      const barW = (w / bufLen) * 2.2;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = data[i] * (h / 255) * 0.85;
        const g = ctx2d.createLinearGradient(0, h - barH, 0, h);
        g.addColorStop(0, `rgba(0,243,255,${data[i]/255})`);
        g.addColorStop(1, 'rgba(255,0,229,0.6)');
        ctx2d.fillStyle = g;
        ctx2d.beginPath();
        ctx2d.roundRect(x, h - barH, barW, barH, Math.min(barW/2, 3));
        ctx2d.fill();
        x += barW + 2;
      }
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [isPlaying]);

  // Buffer watchdog — evita que el stream se adelante tras horas de escucha
  useEffect(() => {
    const MAX_AHEAD = 18; // segundos máximos de buffer adelantado
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (!audio || !isPlayingRef.current || !userHasInteracted.current) return;
      try {
        if (!audio.buffered || audio.buffered.length === 0) return;
        const ahead = audio.buffered.end(audio.buffered.length - 1) - audio.currentTime;
        if (ahead > MAX_AHEAD) {
          srcChangedAt.current = Date.now();
          audio.src = `${STREAM_URL}?t=${Date.now()}`;
          audio.play().catch(() => {});
        }
      } catch (_) {}
    }, 12000);
    return () => clearInterval(id);
  }, []);

  // PWA install
  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;
    if (isIOS) { setShowIosBanner(true); return; }
    if (window.__pwaPrompt) { setInstallPrompt(window.__pwaPrompt); setShowInstallBanner(true); }
    const handler = () => { if (window.__pwaPrompt) { setInstallPrompt(window.__pwaPrompt); setShowInstallBanner(true); } };
    window.addEventListener('pwaPromptReady', handler);
    return () => window.removeEventListener('pwaPromptReady', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setShowInstallBanner(false);
    setInstallPrompt(null);
  };

  const addToast = (text, type = 'info') => {
    setToasts(prev => {
      if (prev.some(t => t.text === text)) return prev;
      const id = Date.now() + Math.random();
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
      return [...prev.slice(-3), { id, text, type }];
    });
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    userHasInteracted.current = true;
    if (isPlaying) { audioRef.current.pause(); }
    else {
      srcChangedAt.current = Date.now();
      audioRef.current.src = `${STREAM_URL}?t=${Date.now()}`;
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(p => !p);
  };

  const handleVolumeChange = e => {
    const v = parseFloat(e.target.value);
    setVolume(v); setIsMuted(v === 0);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const toggleMute = () => {
    const next = !isMuted; setIsMuted(next);
    if (audioRef.current) audioRef.current.volume = next ? 0 : volume;
  };

  const sendMessage = e => {
    e.preventDefault();
    if (!currentMessage.trim()) return;
    socket.emit('sendMessage', { user: username, text: currentMessage });
    setCurrentMessage('');
  };

  return (
    <div className="page-wrapper">
      <audio ref={audioRef} preload="none" />

      {/* Click overlay */}
      {needsClick && (
        <div onClick={startFromClick} className="click-overlay">
          <div className="click-circle"><Play size={40} color="var(--neon-cyan)" /></div>
          <p className="click-title">Toca para escuchar</p>
          <p className="click-sub">Urbanova Radio · 24/7 en vivo</p>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Bell size={13} style={{ flexShrink: 0 }} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* ── STICKY PLAYER BAR ── */}
      <header className="sticky-player glass-panel">
        <div className="sp-left">
          <img src="/favicon.png" alt="Urbanova Radio" className="sp-logo" />
          <div className="sp-info">
            <div className="sp-song">{radioInfo.currentSong}</div>
            <div className="sp-meta">
              {radioInfo.isDjLive
                ? <><span className="live-dot" /><span style={{ color: 'var(--neon-magenta)' }}>EN VIVO · {radioInfo.djName}</span></>
                : <span style={{ color: 'var(--text-muted)' }}>AutoDJ</span>
              }
            </div>
          </div>
        </div>
        <div className="sp-controls">
          <button className="btn-play-sm" onClick={togglePlay}>
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
        </div>
        <div className="sp-right">
          <div className="sp-listeners">
            <Users size={13} color="var(--neon-green)" />
            <span style={{ color: 'var(--neon-green)', fontWeight: 700 }}>{listenerCount}</span>
          </div>
          <button className="btn-icon" onClick={toggleMute} style={{ opacity: 0.7 }}>
            {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input type="range" className="slider sp-volume" min="0" max="1" step="0.02"
            value={isMuted ? 0 : volume} onChange={handleVolumeChange} />
          <Link to="/dj-panel" className="btn-icon" title="Panel DJ" style={{ opacity: 0.5 }}>
            <Settings size={16} />
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero-section">
        <div className="hero-bg" />
        <HeroWaves isPlaying={isPlaying} />
        <canvas ref={canvasRef} className="hero-canvas" />
        <div className="hero-content">
          <div className="hero-live-badge">
            <span className="live-dot" />
            <span>{radioInfo.isDjLive ? `DJ EN VIVO · ${radioInfo.djName}` : 'AutoDJ · 24/7'}</span>
          </div>
          <h1 className="hero-title">URBANOVA</h1>
          <p className="hero-sub">RADIO</p>
          <p className="hero-tagline">Tu estación urbana favorita. Reggaetón, Trap, Hip-Hop & más.</p>
          <div className="hero-now-playing">
            <Music size={14} color="var(--neon-cyan)" />
            <span className="hero-song-text">{radioInfo.currentSong}</span>
          </div>
        </div>
      </section>

      {/* ── STATS INTEGRADAS ── */}
      <section className="stats-bridge">
        <div className="stats-bridge-inner">
          <div className="stats-bridge-item">
            <div className="stats-bridge-icon stats-bridge-icon--cyan"><Radio size={20} /></div>
            <div className="stats-bridge-val">24/7</div>
            <div className="stats-bridge-sub">En Vivo</div>
          </div>
          <div className="stats-bridge-sep" />
          <div className="stats-bridge-item">
            <div className="stats-bridge-icon stats-bridge-icon--green"><Users size={20} /></div>
            <div className="stats-bridge-val stats-bridge-val--green">{listenerCount}</div>
            <div className="stats-bridge-sub">Oyentes ahora</div>
          </div>
          <div className="stats-bridge-sep" />
          <div className="stats-bridge-item">
            <div className="stats-bridge-icon stats-bridge-icon--magenta"><Mic2 size={20} /></div>
            <div className="stats-bridge-val stats-bridge-val--magenta">
              {radioInfo.isDjLive ? radioInfo.djName || 'DJ' : 'AutoDJ'}
            </div>
            <div className="stats-bridge-sub">En directo</div>
          </div>
        </div>
      </section>

      {/* ── DISCORD CTA ── */}
      <section className="discord-cta">
        <div className="discord-cta-glow" />
        <div className="discord-cta-inner">
          <div className="discord-cta-left">
            <div className="discord-badge-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
              Bot Oficial
            </div>
            <h2 className="discord-cta-title">
              ESCUCHA <span className="discord-brand">URBANOVA</span><br />
              EN TU SERVIDOR <span className="discord-brand">DISCORD</span>
            </h2>
            <p className="discord-cta-sub">
              Añade nuestro bot a tu servidor y disfruta de Urbanova Radio en directo con tu comunidad. Música urbana 24/7 al alcance de un comando.
            </p>
            <div className="discord-features">
              {['🎵 Stream 24/7 en vivo','🎙️ DJs en directo','📻 AutoDJ siempre activo'].map(f => (
                <span key={f} className="discord-feature-tag">{f}</span>
              ))}
            </div>
            <a
              href="https://discord.com/oauth2/authorize?client_id=1482117598501146644&permissions=3147776&integration_type=0&scope=bot"
              target="_blank" rel="noopener noreferrer"
              className="btn-discord"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
              Añadir a Discord
            </a>
          </div>
          <div className="discord-cta-right">
            <div className="discord-logo-wrap">
              <div className="discord-logo-glow" />
              <img src="/logos/discord-logo.png" alt="Discord" className="discord-logo-img" />
            </div>
          </div>
        </div>
      </section>

      {/* ── DISPONIBLE EN ── */}
      <section className="listen-on">
        <p className="listen-on-label">También nos puedes escuchar en</p>
        <div className="listen-on-logos">
          {[
            { name: 'Streema',        logo: '/logos/logo-streema.png',          href: 'https://es.streema.com/radios/Urbanova_Radio',             invert: true },
            { name: 'MyTuner Radio',  logo: '/logos/mytuner-logo.png',          href: 'https://mytuner-radio.com/es/emisora/urbanova-radio-518500/' },
            { name: 'TuneIn',         logo: '/logos/TuneIn-Logo.png',           href: 'https://tunein.com/radio/Urbanova-Radio-s353937/' },
            { name: 'OnlineRadioBox', logo: '/logos/onlineradiobox-logo.png',   href: 'https://onlineradiobox.com/es/urbanova/?cs=es.urbanova' },
          ].map(p => (
            <a key={p.name} href={p.href} target="_blank" rel="noopener noreferrer" className="listen-on-logo-link" title={p.name}>
              <img src={p.logo} alt={p.name} className={`listen-on-logo-img${p.invert ? ' logo-invert' : ''}`} />
            </a>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <img src="/logo.png" alt="Urbanova Radio" style={{ height: 36, opacity: 0.7 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>© 2025 Urbanova Radio · Todos los derechos reservados</span>
      </footer>

      {/* Banners PWA */}
      {showInstallBanner && (
        <div className="pwa-banner glass-panel">
          <img src="/favicon.png" alt="" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>Instalar Urbanova Radio</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Acceso rápido desde tu pantalla de inicio</div>
          </div>
          <button onClick={handleInstall} className="btn-install">Instalar</button>
          <button onClick={() => setShowInstallBanner(false)} className="btn-close-banner">✕</button>
        </div>
      )}
      {showIosBanner && (
        <div className="pwa-banner glass-panel">
          <img src="/favicon.png" alt="" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>Instalar en iPhone</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Pulsa <span style={{ color: 'var(--neon-cyan)' }}>⬆ Compartir</span> → "Añadir a pantalla de inicio"
            </div>
          </div>
          <button onClick={() => setShowIosBanner(false)} className="btn-close-banner">✕</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"         element={<RadioPlayer />} />
        <Route path="/dj-panel" element={<DjDashboard  socket={socket} />} />
        <Route path="/admin"    element={<AdminDashboard socket={socket} />} />
      </Routes>
    </Router>
  );
}
