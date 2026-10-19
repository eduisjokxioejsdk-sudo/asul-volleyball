// ============================================================================
// Accueil du mode « Relecture » : les matchs codés, prêts à être relus point
// par point, sans les temps morts. On choisit un match et il s'ouvre dans
// l'espace de relecture (voir MatchReviewDashboard).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playlistAPI } from '../services/api';
import { CirclePlay, Keyboard, Video } from '../components/icons';

/** Durée lisible (12 min 30 s). */
function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes === 0 ? `${rest} s` : `${minutes} min ${String(rest).padStart(2, '0')} s`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MatchReviewHome() {
  const navigate = useNavigate();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await playlistAPI.sources();
      setSources(res.data?.sources || []);
    } catch (err) {
      console.error('Failed to load review sources:', err);
      setMsg({ ok: false, text: err.response?.data?.error || 'Matchs codés indisponibles.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="plp-home mrv-home">
      <div className="live-section-head">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CirclePlay size={18} /> Relecture des matchs
        </h3>
      </div>

      <p className="dv-hint">
        Relisez un match en enchaînant les points, sans les temps morts : la vidéo saute directement
        d’un point au suivant, avec à droite la liste des points (filtres action, qualité et position)
        et les actions du point en cours, prêtes à rejoindre une playlist.
      </p>

      {msg && <div className={`live-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      {loading ? (
        <p className="dv-hint">Chargement des matchs codés…</p>
      ) : sources.length === 0 ? (
        <p className="dv-empty">
          Aucun match codé pour l’instant : codez un match dans l’onglet « Codage DataVolley », il
          apparaîtra ici pour être relu.
        </p>
      ) : (
        <div className="live-list">
          {sources.map((source) => (
            <div key={source.id} className="live-card mrv-card">
              <div className="live-card-name">{source.display_name || source.original_name || `Match ${source.id}`}</div>
              <div className="live-card-teams">
                {source.team1_name || 'Équipe 1'} vs {source.team2_name || 'Équipe 2'}
              </div>
              <div className="mrv-card-meta">
                {source.action_count} action(s)
                {source.duration ? ` · ${formatDuration(source.duration)}` : ''}
                {source.created_at ? ` · ${formatDate(source.created_at)}` : ''}
                {!source.filename ? ' · vidéo absente sur ce poste' : ''}
              </div>
              <div className="mrv-card-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/relecture/${source.id}`)}
                  disabled={!source.filename}
                  title={source.filename ? 'Relire ce match point par point, sans les temps morts' : 'Fichier vidéo absent sur ce poste'}
                >
                  <CirclePlay size={13} /> Relire
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/datavolley/${source.id}`)}
                  title="Ouvrir ce match dans le codage DataVolley"
                >
                  <Keyboard size={13} /> Codage
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <p className="dv-hint">
          <Video size={13} /> Les matchs listés sont les matchs codés : sans codage, il n’y a rien à
          enchaîner — et sans vidéo présente sur ce poste, rien à lire.
        </p>
      )}
    </div>
  );
}
