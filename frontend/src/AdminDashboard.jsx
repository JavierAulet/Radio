import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Music, UserPlus, Trash2, UploadCloud, Users, Server, Radio, ArrowLeft, Search, SkipForward, Headphones, Key, User } from 'lucide-react';

export default function AdminDashboard({ socket }) {
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // DJ Management
  const [djs, setDjs] = useState([]);
  const [newDjUser, setNewDjUser] = useState('');
  const [newDjPass, setNewDjPass] = useState('');
  const [newDjName, setNewDjName] = useState('');

  // Music Management
  const [songs, setSongs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Radio state
  const [radioInfo, setRadioInfo] = useState({ isDjLive: false, djName: null, currentSong: 'Conectando...' });
  const [listenerCount, setListenerCount] = useState(0);

  // Socket events
  useEffect(() => {
    socket.on('radioData', d => setRadioInfo(d));
    socket.on('listenersCount', n => setListenerCount(n));
    return () => { socket.off('radioData'); socket.off('listenersCount'); };
  }, [socket]);

  const authHeaders = () => ({ 'admin-user': adminUser, 'admin-pass': adminPass });

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/admin/djs', { headers: authHeaders() });
      if (res.ok) {
        setIsAuthenticated(true);
        setDjs(await res.json());
        loadMusic();
        socket.emit('join', `Admin_${adminUser}`);
      } else {
        setStatusMsg('Acceso Denegado');
        setTimeout(() => setStatusMsg(''), 3000);
      }
    } catch (err) {
      setStatusMsg('Error de conexión');
    }
  };

  const loadDjs = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/admin/djs', { headers: authHeaders() });
      setDjs(await res.json());
    } catch (err) { console.error(err); }
  };

  const loadMusic = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/admin/music', { headers: authHeaders() });
      setSongs(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleCreateDj = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/admin/djs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ username: newDjUser, password: newDjPass, display_name: newDjName })
      });
      if (res.ok) {
        setNewDjUser(''); setNewDjPass(''); setNewDjName('');
        loadDjs();
      } else {
        alert("Error: usuario duplicado o datos inválidos");
      }
    } catch (e) { alert("Error de conexión"); }
  };

  const handleDeleteDj = async (id) => {
    if (!window.confirm("¿Eliminar este locutor y sus turnos programados?")) return;
    try {
      const res = await fetch(`http://localhost:3000/api/admin/djs/${id}`, {
        method: 'DELETE', headers: authHeaders()
      });
      if (res.ok) loadDjs();
      else alert("No se puede borrar (Admin principal protegido)");
    } catch (e) { alert("Error de red"); }
  };

  const uploadFiles = async (files) => {
    setUploading(true);
    for (const file of files) {
      if (!file.name.endsWith('.mp3')) continue;
      const formData = new FormData();
      formData.append('song', file);
      try {
        await fetch('http://localhost:3000/api/admin/music', {
          method: 'POST', headers: authHeaders(), body: formData
        });
      } catch (e) { console.error('Upload error:', e); }
    }
    setUploading(false);
    loadMusic();
  };

  const handleUploadMusic = async (e) => {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    fileInputRef.current.value = '';
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.mp3'));
    if (files.length > 0) await uploadFiles(files);
  };

  const handleDeleteMusic = async (filename) => {
    if (!window.confirm(`¿Eliminar ${filename} del AutoDJ?`)) return;
    try {
      const res = await fetch(`http://localhost:3000/api/admin/music/${encodeURIComponent(filename)}`, {
        method: 'DELETE', headers: authHeaders()
      });
      if (res.ok) loadMusic();
    } catch (e) { alert("Error de red"); }
  };

  const handleSkip = async () => {
    try {
      await fetch('http://localhost:3000/api/admin/skip', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }
      });
    } catch (e) { alert("Error de red"); }
  };

  const filteredSongs = songs.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

  // ─── LOGIN ───
  if (!isAuthenticated) {
    return (
      <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="dashboard-card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '2.5rem', borderColor: 'rgba(0, 243, 255, 0.15)', boxShadow: '0 0 40px rgba(0, 243, 255, 0.08)' }}>
          <Server size={48} color="var(--neon-cyan)" style={{ marginBottom: '1rem' }} />
          <h2 className="text-gradient" style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Control Maestro</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>Centro de Operaciones de la Emisora</p>
          
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neon-cyan)', opacity: 0.6 }} />
              <input type="text" placeholder="Usuario Admin..." value={adminUser} onChange={e => setAdminUser(e.target.value)} className="chat-input" style={{ paddingLeft: '2.5rem', width: '100%' }} />
            </div>
            <div style={{ position: 'relative' }}>
              <Key size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neon-magenta)', opacity: 0.6 }} />
              <input type="password" placeholder="Contraseña Maestra..." value={adminPass} onChange={e => setAdminPass(e.target.value)} className="chat-input" style={{ paddingLeft: '2.5rem', width: '100%' }} />
            </div>
            <button type="submit" className="button-primary" style={{ marginTop: '0.5rem' }}>Acceder al Servidor</button>
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
          <Server size={24} color="var(--neon-cyan)" />
          <h1 className="text-gradient">Panel de Administración</h1>
        </div>
        <span style={{ backgroundColor: 'rgba(255, 0, 229, 0.12)', color: 'var(--neon-magenta)', padding: '0.35rem 0.85rem', borderRadius: '20px', fontSize: '0.72rem', border: '1px solid rgba(255, 0, 229, 0.25)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}>
          SESIÓN SEGURA
        </span>
      </header>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(0, 243, 255, 0.1)' }}>
            <Radio size={18} color="var(--neon-cyan)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={`status-dot ${radioInfo.isDjLive ? 'live' : 'autodj'}`} />
            <span className="stat-value" style={{ fontSize: '0.95rem', color: radioInfo.isDjLive ? '#ff5555' : 'var(--neon-green)' }}>
              {radioInfo.isDjLive ? `EN VIVO` : 'AutoDJ'}
            </span>
          </div>
          <span className="stat-label">Estado</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(0, 255, 136, 0.1)' }}>
            <Headphones size={18} color="var(--neon-green)" />
          </div>
          <span className="stat-value" style={{ color: 'var(--neon-green)' }}>{listenerCount}</span>
          <span className="stat-label">Oyentes</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(255, 0, 229, 0.1)' }}>
            <Users size={18} color="var(--neon-magenta)" />
          </div>
          <span className="stat-value" style={{ color: 'var(--neon-magenta)' }}>{djs.length}</span>
          <span className="stat-label">Locutores</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(240, 180, 41, 0.1)' }}>
            <Music size={18} color="var(--accent-gold)" />
          </div>
          <span className="stat-value" style={{ color: 'var(--accent-gold)' }}>{songs.length}</span>
          <span className="stat-label">Canciones</span>
        </div>
      </div>

      {/* Now Playing Bar */}
      <div className="dashboard-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
          <Music size={16} color="var(--neon-cyan)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flexShrink: 0 }}>Sonando:</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {radioInfo.currentSong}
          </span>
        </div>
        {!radioInfo.isDjLive && (
          <button onClick={handleSkip} className="button-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.8rem', flexShrink: 0 }}>
            <SkipForward size={14} /> Saltar
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="dashboard-grid">
        {/* DJ Management */}
        <div className="dashboard-card">
          <h3 className="card-title" style={{ color: 'var(--neon-magenta)' }}>
            <Users size={18} />
            Gestión de Locutores
          </h3>
          
          <form onSubmit={handleCreateDj} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" placeholder="Usuario" value={newDjUser} onChange={e => setNewDjUser(e.target.value)} className="chat-input" style={{ flex: 1, minWidth: 0 }} required />
              <input type="password" placeholder="Pass" value={newDjPass} onChange={e => setNewDjPass(e.target.value)} className="chat-input" style={{ flex: 1, minWidth: 0 }} required />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" placeholder="Nombre Artístico" value={newDjName} onChange={e => setNewDjName(e.target.value)} className="chat-input" style={{ flex: 1, minWidth: 0 }} required />
              <button type="submit" className="button-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 1rem', fontSize: '0.82rem', flexShrink: 0 }}>
                <UserPlus size={14} /> Crear
              </button>
            </div>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '280px', overflowY: 'auto' }}>
            {djs.map(dj => (
              <div key={dj.id} className="list-item">
                <div>
                  <strong style={{ fontSize: '0.9rem', display: 'block' }}>{dj.display_name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>@{dj.username}</span>
                </div>
                {dj.username !== 'admin' ? (
                  <button onClick={() => handleDeleteDj(dj.id)} className="delete-btn" title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <Shield size={16} color="var(--neon-cyan)" title="Admin maestro" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Music Management */}
        <div className="dashboard-card">
          <h3 className="card-title" style={{ color: 'var(--neon-cyan)' }}>
            <Music size={18} />
            Música AutoDJ
          </h3>
          
          {/* Drop Zone */}
          <div 
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ marginBottom: '1rem' }}
          >
            <UploadCloud size={28} color="var(--neon-cyan)" style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
              {uploading ? 'Subiendo...' : isDragging ? '¡Suelta los archivos aquí!' : 'Arrastra archivos MP3 o haz clic'}
            </p>
            <p style={{ color: 'var(--text-subtle)', fontSize: '0.72rem' }}>Soporta múltiples archivos</p>
            <input ref={fileInputRef} type="file" accept=".mp3,audio/mpeg" multiple style={{ display: 'none' }} onChange={handleUploadMusic} />
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input type="text" placeholder="Buscar canción..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="search-input" />
          </div>

          {/* Song List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '250px', overflowY: 'auto' }}>
            {filteredSongs.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem', fontSize: '0.82rem' }}>
                {searchQuery ? 'Sin resultados' : 'No hay canciones'}
              </p>
            )}
            {filteredSongs.map((song, idx) => (
              <div key={idx} className="list-item" style={{ padding: '0.55rem 0.85rem' }}>
                <span style={{ fontSize: '0.82rem', wordBreak: 'break-all', paddingRight: '0.5rem', minWidth: 0 }}>
                  🎵 {song.replace('.mp3', '')}
                </span>
                <button onClick={() => handleDeleteMusic(song)} className="delete-btn" title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {searchQuery && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}>
              {filteredSongs.length} de {songs.length} canciones
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
