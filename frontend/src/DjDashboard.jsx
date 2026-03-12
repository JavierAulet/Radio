import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Radio, Key, HardDrive, Music, CheckCircle, AlertTriangle, Calendar, Clock, User, ArrowLeft, Users, Copy, Check, Headphones, Trash2 } from 'lucide-react';

const BACKEND = '';

export default function DjDashboard({ socket }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [djData, setDjData] = useState(null);
  
  const [songName, setSongName] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  
  // Radio state via socket
  const [radioInfo, setRadioInfo] = useState({ isDjLive: false, djName: null, currentSong: 'Conectando...' });
  const [listenerCount, setListenerCount] = useState(0);

  // Copy states
  const [copied, setCopied] = useState({});
  
  // Schedule states
  const [schedules, setSchedules] = useState([]);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('20:00');
  const [endTime, setEndTime] = useState('22:00');
  const [showName, setShowName] = useState('');
  const [calMsg, setCalMsg] = useState('');

  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Listen to socket events for real-time state
  useEffect(() => {
    socket.on('radioData', d => setRadioInfo(d));
    socket.on('listenersCount', n => setListenerCount(n));
    return () => { socket.off('radioData'); socket.off('listenersCount'); };
  }, [socket]);

  const loadSchedules = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/schedules`);
      const data = await res.json();
      setSchedules(data);
    } catch (e) { console.error("Error loading schedules"); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND}/api/dj/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        setDjData(data.dj);
        loadSchedules();
        // Join socket so we get events
        socket.emit('join', `DJ_${username}`);
      } else {
        setStatusMsg('Credenciales incorrectas');
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch (err) {
      setStatusMsg('Error de conexión');
    }
  };

  const handleBookSlot = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, show_name: showName })
      });
      if (res.ok) {
        setCalMsg('¡Horario reservado!');
        setShowName('');
        loadSchedules();
        setTimeout(() => setCalMsg(''), 3000);
      } else {
        setCalMsg('Error al reservar');
      }
    } catch (err) { setCalMsg('Error de conexión'); }
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('¿Eliminar este turno?')) return;
    try {
      const res = await fetch(`${BACKEND}/api/schedules/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        loadSchedules();
        setCalMsg('Turno eliminado');
        setTimeout(() => setCalMsg(''), 2000);
      }
    } catch (err) { console.error(err); }
  };

  const updateCurrentSong = (e) => {
    e.preventDefault();
    if (songName.trim() === '') return;
    socket.emit('updateCurrentSong', { token: password, username, songName });
    setStatusMsg('¡Metadatos actualizados!');
    setSongName('');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const copyToClipboard = (key, value) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000);
    });
  };

  // ─── LOGIN SCREEN ───
  if (!isAuthenticated) {
    return (
      <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="dashboard-card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', padding: '2.5rem' }}>
          <Shield size={48} color="var(--neon-magenta)" style={{ marginBottom: '1rem' }} />
          <h2 className="text-gradient" style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Acceso a Locutores</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>Panel exclusivo para DJs autorizados</p>
          
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neon-cyan)', opacity: 0.6 }} />
              <input type="text" placeholder="Usuario DJ..." value={username} onChange={e => setUsername(e.target.value)} className="chat-input" style={{ paddingLeft: '2.5rem', width: '100%' }} />
            </div>
            <div style={{ position: 'relative' }}>
              <Key size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neon-magenta)', opacity: 0.6 }} />
              <input type="password" placeholder="Contraseña..." value={password} onChange={e => setPassword(e.target.value)} className="chat-input" style={{ paddingLeft: '2.5rem', width: '100%' }} />
            </div>
            <button type="submit" className="button-primary" style={{ marginTop: '0.5rem' }}>Ingresar al Panel</button>
          </form>
          {statusMsg && <p style={{ color: 'var(--neon-magenta)', marginTop: '1rem', fontSize: '0.85rem' }}>{statusMsg}</p>}
          
          <Link to="/" className="back-link" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <ArrowLeft size={14} /> Volver a la Radio
          </Link>
        </div>
      </div>
    );
  }

  // ─── DASHBOARD ───
  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/" className="back-link"><ArrowLeft size={16} /></Link>
          <Radio size={24} color="var(--neon-cyan)" />
          <h1 className="text-gradient">DJ Dashboard</h1>
        </div>
        <div className="user-badge">
          <User size={14} color="var(--neon-magenta)" />
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{djData?.display_name}</span>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(0, 243, 255, 0.1)' }}>
            <Radio size={18} color="var(--neon-cyan)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={`status-dot ${radioInfo.isDjLive ? 'live' : 'autodj'}`} />
            <span className="stat-value" style={{ fontSize: '1rem', color: radioInfo.isDjLive ? '#ff5555' : 'var(--neon-green)' }}>
              {radioInfo.isDjLive ? 'EN VIVO' : 'AutoDJ'}
            </span>
          </div>
          <span className="stat-label">Estado</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(255, 0, 229, 0.1)' }}>
            <Music size={18} color="var(--neon-magenta)" />
          </div>
          <span className="stat-value" style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontFamily: 'var(--font-body)' }}>
            {radioInfo.currentSong?.length > 30 ? radioInfo.currentSong.slice(0, 30) + '…' : radioInfo.currentSong}
          </span>
          <span className="stat-label">Sonando Ahora</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(0, 255, 136, 0.1)' }}>
            <Headphones size={18} color="var(--neon-green)" />
          </div>
          <span className="stat-value" style={{ color: 'var(--neon-green)' }}>{listenerCount}</span>
          <span className="stat-label">Oyentes</span>
        </div>

        {radioInfo.isDjLive && (
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(255, 0, 229, 0.1)' }}>
              <User size={18} color="var(--neon-magenta)" />
            </div>
            <span className="stat-value" style={{ fontSize: '0.95rem', color: 'var(--neon-magenta)', fontFamily: 'var(--font-body)' }}>{radioInfo.djName}</span>
            <span className="stat-label">DJ Activo</span>
          </div>
        )}
      </div>

      {/* Cards Grid */}
      <div className="dashboard-grid">
        {/* Connection Info */}
        <div className="dashboard-card">
          <h3 className="card-title">
            <HardDrive size={18} color="var(--neon-cyan)" />
            <span>Datos de Conexión</span>
          </h3>
          
          {[
            { label: 'Servidor', value: window.location.hostname, key: 'host' },
            { label: 'Puerto', value: window.location.port || (window.location.protocol === 'https:' ? '443' : '80'), key: 'port' },
            { label: 'Punto de Montaje', value: '/broadcast', key: 'mount' },
            { label: 'Usuario', value: username, key: 'user' },
          ].map(item => (
            <div className="copy-row" key={item.key}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.label}</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.85rem' }}>{item.value}</strong>
                <button className={`copy-btn ${copied[item.key] ? 'copied' : ''}`} onClick={() => copyToClipboard(item.key, item.value)}>
                  {copied[item.key] ? <><Check size={10} /> OK</> : <><Copy size={10} /> Copiar</>}
                </button>
              </div>
            </div>
          ))}

          <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-gold)' }} />
            Configura BUTT, VirtualDJ o Mixxx con estos datos para transmitir en vivo.
          </p>
        </div>

        {/* Song Metadata */}
        <div className="dashboard-card">
          <h3 className="card-title">
            <Music size={18} color="var(--neon-magenta)" />
            <span>Actualizar Canción al Aire</span>
          </h3>
          
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Mientras transmites en vivo, actualiza la canción que los oyentes ven en su reproductor.
          </p>

          <form onSubmit={updateCurrentSong} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <input type="text" placeholder="Ej: The Weeknd - Blinding Lights..." value={songName} onChange={e => setSongName(e.target.value)} className="chat-input" style={{ width: '100%' }} />
            <button type="submit" className="button-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={16} /> Actualizar al Aire
            </button>
            {statusMsg && <p style={{ color: 'var(--neon-green)', textAlign: 'center', fontSize: '0.85rem' }}>{statusMsg}</p>}
          </form>
        </div>

        {/* Calendar */}
        <div className="dashboard-card full-width">
          <h3 className="card-title">
            <Calendar size={18} color="var(--neon-cyan)" />
            <span>Calendario Semanal</span>
          </h3>

          <form onSubmit={handleBookSlot} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.3rem' }}>Día</label>
              <select value={dayOfWeek} onChange={e => setDayOfWeek(parseInt(e.target.value))} className="chat-input" style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', width: '100%' }}>
                {DAYS.map((d, i) => <option key={i} value={i} style={{ color: 'black' }}>{d}</option>)}
              </select>
            </div>
            <div style={{ flex: '0 1 100px' }}>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.3rem' }}>Inicio</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="chat-input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: '0 1 100px' }}>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.3rem' }}>Fin</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="chat-input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: '2 1 160px', minWidth: 0 }}>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.3rem' }}>Show</label>
              <input type="text" placeholder="Nombre del Show..." value={showName} onChange={e => setShowName(e.target.value)} className="chat-input" style={{ width: '100%' }} required />
            </div>
            <button type="submit" className="button-primary" style={{ padding: '0.55rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
              <Clock size={14} /> Reservar
            </button>
            {calMsg && <span style={{ color: 'var(--neon-green)', fontSize: '0.78rem', width: '100%', textAlign: 'center' }}>{calMsg}</span>}
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.4rem', minHeight: '320px' }}>
            {[1, 2, 3, 4, 5, 6, 0].map(dayIdx => {
              const today = new Date().getDay();
              const isToday = dayIdx === today;
              const daySchedules = schedules.filter(s => s.day_of_week === dayIdx);
              return (
                <div key={dayIdx} style={{ background: isToday ? 'rgba(0, 243, 255, 0.04)' : 'rgba(0,0,0,0.15)', border: `1px solid ${isToday ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255,255,255,0.04)'}`, borderRadius: '10px', padding: '0.6rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', transition: 'border-color 0.3s', minHeight: '280px' }}>
                  <div style={{ textAlign: 'center', paddingBottom: '0.5rem', borderBottom: `1px solid ${isToday ? 'rgba(0, 243, 255, 0.15)' : 'rgba(255,255,255,0.04)'}` }}>
                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em', color: isToday ? 'var(--neon-cyan)' : 'var(--text-muted)', textTransform: 'uppercase' }}>{DAYS_SHORT[dayIdx]}</div>
                    {isToday && <div style={{ fontSize: '0.58rem', color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem', opacity: 0.7 }}>HOY</div>}
                  </div>
                  {daySchedules.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>Libre</span>
                    </div>
                  ) : (
                    daySchedules.map(sch => {
                      const isMine = sch.username === username;
                      const accentColor = isMine ? 'var(--neon-magenta)' : 'var(--neon-cyan)';
                      return (
                        <div key={sch.id} style={{ background: isMine ? 'rgba(255, 0, 229, 0.08)' : 'rgba(0, 243, 255, 0.05)', border: `1px solid ${isMine ? 'rgba(255, 0, 229, 0.2)' : 'rgba(0, 243, 255, 0.12)'}`, borderRadius: '8px', padding: '0.5rem', position: 'relative', transition: 'transform 0.2s, box-shadow 0.2s' }}
                          onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = `0 0 12px ${isMine ? 'rgba(255,0,229,0.15)' : 'rgba(0,243,255,0.1)'}` }}
                          onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}>
                          <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: accentColor, fontWeight: 600, marginBottom: '0.25rem' }}>{sch.start_time} - {sch.end_time}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 500, lineHeight: 1.3, wordBreak: 'break-word' }}>{sch.show_name}</div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.3rem', fontFamily: 'var(--font-mono)' }}>{sch.display_name}</div>
                          {isMine && (
                            <button onClick={() => handleDeleteSchedule(sch.id)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                              onMouseOver={e => e.currentTarget.style.color = '#ff4444'}
                              onMouseOut={e => e.currentTarget.style.color = 'var(--text-subtle)'}
                              title="Eliminar turno"><Trash2 size={11} /></button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>

          {schedules.length > 0 && (
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(255, 0, 229, 0.3)', border: '1px solid rgba(255, 0, 229, 0.4)' }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Mis shows</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(0, 243, 255, 0.15)', border: '1px solid rgba(0, 243, 255, 0.25)' }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Otros DJs</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
