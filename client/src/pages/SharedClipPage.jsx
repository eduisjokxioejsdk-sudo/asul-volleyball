import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { montageAPI } from '../services/api';
import { formatTimecode } from '../utils/datavolley';

export default function SharedClipPage() {
  const { token } = useParams();
  const videoRef = useRef(null);
  const [share, setShare] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    montageAPI.getShare(token)
      .then((response) => { if (active) setShare(response.data?.share || null); })
      .catch((err) => { if (active) setError(err?.response?.data?.error || 'Ce lien de partage est indisponible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  if (loading) return <main style={pageStyle}><p>Chargement du partage…</p></main>;
  if (error || !share) return <main style={pageStyle}><h1>Partage indisponible</h1><p>{error || 'Lien invalide.'}</p></main>;

  const seekToClip = (index) => {
    const offset = (share.clips || []).slice(0, index).reduce((sum, clip) => {
      const start = Number(clip.startTime) || 0;
      const end = Number(clip.endTime) || start + 3;
      return sum + Math.max(0.5, end - start);
    }, 0);
    if (videoRef.current) {
      videoRef.current.currentTime = offset;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: 18 }}>
        <p style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 6 }}>ASUL · CLIPS DE MATCH</p>
        <h1 style={{ margin: '0 0 6px' }}>{share.title}</h1>
        <p style={{ color: '#a1a1aa', margin: 0 }}>{share.teams?.join(' — ')}{share.description ? ` · ${share.description}` : ''}</p>
      </header>
      <video ref={videoRef} controls playsInline preload="metadata" src={share.streamUrl} style={{ width: '100%', maxHeight: '72vh', background: '#000', borderRadius: 8 }} />
      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18 }}>Actions et annotations · {share.clips?.length || 0}</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(share.clips || []).map((clip, index) => (
            <article key={`${clip.actionId || clip.actionIndex}-${index}`} onClick={() => seekToClip(index)} title="Lire ce clip" style={{ display: 'grid', gridTemplateColumns: '70px 65px 1fr', gap: 10, alignItems: 'start', padding: 12, background: '#18181b', border: '1px solid #303036', borderRadius: 7, cursor: 'pointer' }}>
              <strong style={{ color: '#fbbf24' }}>{formatTimecode(clip.timecode || clip.startTime || 0)}</strong>
              <strong>{clip.evaluation || '—'}</strong>
              <div>
                <div style={{ fontWeight: 700 }}>{clip.code || 'Action'} · {clip.team === 'away' ? share.teams?.[1] : share.teams?.[0]}{clip.playerNumber != null ? ` · n°${clip.playerNumber}` : ''}</div>
                <div style={{ color: '#a1a1aa', fontSize: 12 }}>Set {clip.setNumber || 1}{clip.action ? ` · Action ${clip.action}` : ''}</div>
                {clip.note && <p style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap' }}>{clip.note}</p>}
                {!!clip.qualityFlags?.length && (
                  <p style={{ margin: '7px 0 0', color: '#fbbf24', fontSize: 12 }}>
                    À vérifier : {clip.qualityFlags.join(' · ')}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <p style={{ marginTop: 20, color: '#71717a', fontSize: 12 }}>Ce lien donne accès au montage et aux métadonnées de ces clips uniquement.</p>
    </main>
  );
}

const pageStyle = {
  minHeight: '100vh',
  maxWidth: 1120,
  margin: '0 auto',
  padding: '28px 20px 60px',
  background: '#09090b',
  color: '#f4f4f5',
  boxSizing: 'border-box',
};
