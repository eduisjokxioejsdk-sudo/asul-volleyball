// ============================================================================
// Fiche de trajectoire d'un match.
//   • équipes partagées avec le reste de l'application (onglet Trajectoires) ;
//   • un onglet par équipe (un seul si une seule équipe a été choisie) ;
//   • dans chaque onglet : Services / Attaque ;
//   • un terrain par joueur, le nom du joueur au-dessus du terrain.
// L'enregistrement est automatique (600 ms après un tracé).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import TrajectoryCourt from '../components/TrajectoryCourt';
import ShortcutSettings from '../components/ShortcutSettings';
import useKindShortcut from '../hooks/useKindShortcut';
import { teamsAPI, trajectoryAPI } from '../services/api';
import {
  TRAJECTORY_KINDS,
  TRAJECTORY_RESULTS,
  countByResult,
  normalizeResultForKind,
  popupResultsFor,
  resultColor,
  resultIsArc,
  resultLabel,
  resultsForKind,
  rosterOf,
  shotFromRow,
  shotToRow,
} from '../utils/trajectory';
import { formatKeyLabel } from '../utils/shortcuts';
import { Check, Eye, House, Keyboard, Pencil, Plane, Save, Trash, Users, X } from '../components/icons';

const TEAM_TABS = [
  { side: 'home', label: 'Équipe 1', icon: House },
  { side: 'away', label: 'Équipe 2', icon: Plane },
];

/** Libellé d'un type de frappe : « Services » / « Attaque ». */
const kindLabelOf = (k) => TRAJECTORY_KINDS.find((x) => x.id === k)?.label || k;

export default function TrajectoryDashboard({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [side, setSide] = useState('home');
  const [kind, setKind] = useState('serve');
  const [pending, setPending] = useState(null); // flèche en attente d'issue
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [editName, setEditName] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);

  const loadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef(null);
  const flashTimer = useRef(null);

  useEffect(() => { loadedRef.current = false; }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trajectoryAPI.getOne(id);
      setMatch(res.data.match);
      setShots(
        (res.data.shots || [])
          .map(shotFromRow)
          // Une feinte n'existe qu'à l'attaque : au service on revient à l'issue simple.
          .map((shot) => ({ ...shot, result: normalizeResultForKind(shot.result, shot.kind) }))
      );
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Fiche de trajectoire introuvable.');
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const notify = useCallback((ok, text) => {
    setFlash({ ok, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
  }, []);

  // Enregistrement automatique des flèches (un seul appel pour plusieurs tracés).
  useEffect(() => {
    if (!loadedRef.current || !dirtyRef.current) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await trajectoryAPI.saveShots(id, shots.map(shotToRow));
        dirtyRef.current = false;
        setSaving(false);
      } catch (err) {
        setSaving(false);
        notify(false, err.response?.data?.error || 'Échec de l’enregistrement.');
      }
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [shots, id, notify]);

  // Les équipes restent celles de l'application : rien à recopier ici.
  useEffect(() => {
    teamsAPI.getAll().catch(() => {});
  }, []);

  const addShot = useCallback((shot) => {
    dirtyRef.current = true;
    setShots((prev) => [...prev, shot]);
  }, []);

  const removeLastForPlayer = (teamSide, shotKind, number) => {
    dirtyRef.current = true;
    setShots((prev) => {
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        const s = prev[i];
        if (s.team_side === teamSide && s.kind === shotKind && Number(s.player_number) === Number(number)) {
          return [...prev.slice(0, i), ...prev.slice(i + 1)];
        }
      }
      return prev;
    });
  };

  const clearKind = () => {
    if (!window.confirm(`Effacer toutes les flèches « ${TRAJECTORY_KINDS.find((k) => k.id === kind)?.label} » de cette équipe ?`)) return;
    dirtyRef.current = true;
    setShots((prev) => prev.filter((s) => !(s.team_side === side && s.kind === kind)));
  };

  // --- Données dérivées -----------------------------------------------------
  const homeTeam = match?.home_team || null;
  const awayTeam = match?.away_team || null;
  const hasAway = !!(awayTeam || match?.away_team_id);
  const teamOf = (s) => (s === 'home' ? homeTeam : awayTeam);
  const teamNameOf = (s) =>
    teamOf(s)?.name || (s === 'home' ? match?.team1_name : match?.team2_name) || (s === 'home' ? 'Équipe 1' : 'Équipe 2');
  const currentName = teamNameOf(side);
  const opponentName = hasAway ? teamNameOf(side === 'home' ? 'away' : 'home') : '';
  const roster = useMemo(() => rosterOf(teamOf(side)), [homeTeam, awayTeam, side]);
  const sideShots = useMemo(() => shots.filter((s) => s.team_side === side && s.kind === kind), [shots, side, kind]);
  const recap = useMemo(() => countByResult(sideShots), [sideShots]);
  // Légende : exactement les issues proposées pour la frappe en cours, plus la
  // sortie de terrain (automatique) — donc ni feinte ni contrée au service.
  const legendResults = useMemo(() => resultsForKind(kind), [kind]);
  const isOwner = !!user && Number(match?.user_id) === Number(user.id);
  const kindLabel = kindLabelOf(kind);

  // --- Interactions ---------------------------------------------------------
  const handleComplete = useCallback(
    (player, from, to, result) => {
      const base = { team_side: side, player_number: player.number, kind, start: from, end: to, set_number: null };
      if (result) {
        // Arrivée hors des lignes : aucune question posée, la flèche est rouge.
        addShot({ ...base, result });
        notify(true, `Hors des lignes (n°${player.number}) : flèche rouge enregistrée.`);
        return;
      }
      setPending({ ...base, player });
    },
    [side, kind, addShot, notify]
  );

  const chooseResult = (result) => {
    if (!pending) return;
    addShot({ ...pending, result });
    notify(true, `${resultLabel(result)} — n°${pending.player_number} (${kindLabel}).`);
    setPending(null);
  };

  const saveName = async () => {
    const name = editName.trim();
    if (!name) {
      setRenaming(false);
      return;
    }
    try {
      const res = await trajectoryAPI.rename(id, name);
      setMatch((prev) => ({ ...prev, ...res.data.match }));
      setRenaming(false);
    } catch (err) {
      notify(false, err.response?.data?.error || 'Renommage impossible.');
    }
  };

  const deleteMatch = async () => {
    if (!window.confirm('Supprimer définitivement cette fiche de trajectoire ?')) return;
    try {
      await trajectoryAPI.delete(id);
      navigate('/dashboard');
    } catch (err) {
      notify(false, err.response?.data?.error || 'Suppression impossible.');
    }
  };

  // Échap ferme la popup des issues sans enregistrer la flèche.
  useEffect(() => {
    if (!pending) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  // Raccourci configurable : une seule touche bascule Services ↔ Attaque.
  const toggleKind = useCallback(() => {
    const next = kind === 'serve' ? 'attack' : 'serve';
    setKind(next);
    setPending(null);
    notify(true, `Onglet ${kindLabelOf(next)}.`);
  }, [kind, notify]);

  // La touche n'agit ni pendant une saisie (nom de la fiche), ni sous la popup
  // d'issue, ni sous la fenêtre des raccourcis : une flèche en cours de saisie
  // ne doit jamais être perdue par une touche.
  const { shortcuts, setShortcuts } = useKindShortcut({
    onToggle: toggleKind,
    blocked: !!pending || renaming || showShortcuts,
  });

  // --- Rendu ----------------------------------------------------------------
  if (loading) {
    return (
      <div className="video-dashboard tj-page">
        <div className="app-loading">
          <div className="spinner"></div>
          <p className="loading-text">Chargement de la fiche…</p>
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="video-dashboard tj-page">
        <div className="vd-workspace">
          <nav className="video-tabs dv-nav">
            <motion.button className="back-btn" onClick={() => navigate('/dashboard')} whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}>←</motion.button>
            <div className="dv-title"><strong>Fiche de trajectoire</strong></div>
          </nav>
          <div className="vd-main">
            <div className="dv-panel">
              <p className="tj-error">{error || 'Fiche introuvable.'}</p>
              <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Retour à l’accueil</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="video-dashboard tj-page">
      <div className="vd-workspace">
        <nav className="video-tabs dv-nav">
          <motion.button className="back-btn" onClick={() => navigate('/dashboard')} whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}>←</motion.button>
          <div className="dv-title">
            {renaming ? (
              <form onSubmit={(event) => { event.preventDefault(); saveName(); }} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="tj-rename-input" value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus />
                <button className="btn btn-primary btn-sm" type="submit" title="Valider"><Check size={13} /></button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setRenaming(false)} title="Annuler"><X size={13} /></button>
              </form>
            ) : (
              <>
                <strong>{match.name}</strong>
                <span className="dv-teams">
                  <House size={12} /> {teamNameOf('home')}
                  {hasAway && <>&nbsp;·&nbsp; <Plane size={12} /> {teamNameOf('away')}</>}
                </span>
              </>
            )}
          </div>
          <div className="video-tabs-group">
            {TEAM_TABS.filter((t) => t.side === 'home' || hasAway).map((t) => {
              const TeamIcon = t.icon;
              return (
                <button
                  key={t.side}
                  className={`video-tab ${side === t.side ? 'active' : ''}`}
                  onClick={() => { setSide(t.side); setPending(null); }}
                  title={teamNameOf(t.side)}
                >
                  <TeamIcon size={13} /> {t.label} · {teamNameOf(t.side)}
                </button>
              );
            })}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setEditName(match.name || ''); setRenaming(true); }}
            title="Renommer la fiche"
          >
            <Pencil size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/teams')} title="Modifier les équipes et leurs joueurs">
            <Users size={14} /> Équipes
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => navigate(`/trajectories/${id}/consult`)}
            title="Ouvrir la fiche en consultation (lecture seule)"
          >
            <Eye size={14} /> Consulter
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowShortcuts(true)}
            title="Choisir la touche qui bascule Services ↔ Attaque"
          >
            <Keyboard size={14} /> Raccourcis
          </button>
          {isOwner && (
            <button className="btn btn-danger btn-sm" onClick={deleteMatch} title="Supprimer cette fiche">
              <Trash size={14} />
            </button>
          )}
          <div className="dv-save-state">
            {saving ? (<><Save size={12} /> Enregistrement…</>) : (<><Check size={12} /> Enregistré</>)}
          </div>
        </nav>

        <div className="vd-main">
          <motion.div className="dv-panel tj-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className={`tj-toolbar tj-kind-${kind}`}>
              <div className="dv-stat-tabs">
                {TRAJECTORY_KINDS.map((k) => (
                  <button
                    key={k.id}
                    className={`video-tab ${kind === k.id ? 'active' : ''}`}
                    onClick={() => { setKind(k.id); setPending(null); }}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <span
                className="tj-toolbar-key"
                title="Touche qui bascule Services ↔ Attaque (modifiable via « Raccourcis »)"
              >
                <Keyboard size={12} /> {formatKeyLabel(shortcuts.toggleKind)}
              </span>
              <span className="tj-toolbar-team">
                {currentName}
                {opponentName ? ` vs ${opponentName}` : ''}
              </span>
              <div className="tj-toolbar-spacer" />
              <div className="tj-legend">
                {legendResults.map((r) => (
                  <span key={r.id} className="tj-legend-item">
                    <svg width="26" height="10" aria-hidden="true">
                      {r.arc
                        ? <path d="M 1 8 Q 13 -2 25 8" fill="none" stroke={r.color} strokeWidth="2" />
                        : <line x1="1" y1="5" x2="25" y2="5" stroke={r.color} strokeWidth="2" />}
                    </svg>
                    {r.label}
                    {r.auto ? ' (auto)' : ''}
                  </span>
                ))}
              </div>
              {sideShots.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={clearKind}
                  title={`Effacer les flèches « ${kindLabel} » de ${currentName}`}
                >
                  <Trash size={13} /> Effacer
                </button>
              )}
            </div>

            {flash && <div className={`live-msg ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>}

            <p className="dv-hint">
              {kindLabel} · 1er clic : point de départ · 2e clic : point d’arrivée. Hors des lignes la flèche passe au rouge
              automatiquement ; dans le terrain, la popup demande l’issue
              {kind === 'serve'
                ? ' (point, continuité ou faute — les feintes et les balles contrées ne concernent que l’attaque).'
                : ' (point, feinte point, feinte continuité, continuité, faute ou contrée — les feintes sont tracées en arc de cercle, la balle contrée en orange).'}
            </p>

            <div className="tj-recap">
              <span className="tj-recap-label">{kindLabel} — {currentName}</span>
              {TRAJECTORY_RESULTS.filter((r) => recap[r.id] > 0).map((r) => (
                <span key={r.id} className="tj-chip" style={{ borderColor: r.color, color: r.color }}>
                  {r.label} {recap[r.id]}
                </span>
              ))}
              {sideShots.length === 0 && <span className="dv-hint">Aucune flèche enregistrée pour l’instant.</span>}
            </div>

            {roster.length === 0 ? (
              <div className="tj-empty">
                <p>Aucun joueur dans l’effectif de <strong>{currentName}</strong>.</p>
                <p className="dv-hint">
                  Ajoutez les joueurs (n°, nom, rôle) dans l’onglet Équipes : ils apparaîtront ici, un terrain par joueur.
                </p>
                <button className="btn btn-primary" onClick={() => navigate('/teams')}>
                  <Users size={14} /> Ouvrir les équipes
                </button>
              </div>
            ) : (
              <div className="tj-grid">
                {roster.map((player) => {
                  const playerShots = sideShots.filter((s) => Number(s.player_number) === player.number);
                  return (
                    <TrajectoryCourt
                      key={`${side}-${kind}-${player.number}`}
                      player={player}
                      kind={kind}
                      teams={{ left: currentName, right: opponentName }}
                      shots={playerShots}
                      onComplete={(from, to, result) => handleComplete(player, from, to, result)}
                      onRemoveLast={() => removeLastForPlayer(side, kind, player.number)}
                    />
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Popup des issues : uniquement quand la flèche retombe dans le terrain */}
      <AnimatePresence>
        {pending && (
          <motion.div
            className="modal-overlay"
            onClick={() => setPending(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal tj-result-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <h2>Issue de la frappe</h2>
              <p className="tj-result-context">
                n°{pending.player_number}
                {pending.player?.name ? ` · ${pending.player.name}` : ''} · {kindLabelOf(pending.kind)} · {currentName}
              </p>
              <div className="tj-result-grid">
                {popupResultsFor(pending.kind).map((rid) => (
                  <button
                    key={rid}
                    type="button"
                    className="tj-result-btn"
                    style={{ borderColor: resultColor(rid), color: resultColor(rid) }}
                    onClick={() => chooseResult(rid)}
                  >
                    <svg width="58" height="16" aria-hidden="true">
                      {resultIsArc(rid)
                        ? <path d="M 2 13 Q 29 -4 56 13" fill="none" stroke={resultColor(rid)} strokeWidth="2.4" />
                        : <line x1="2" y1="8" x2="56" y2="8" stroke={resultColor(rid)} strokeWidth="2.4" />}
                    </svg>
                    {resultLabel(rid)}
                  </button>
                ))}
              </div>
              <p className="dv-hint">
                {pending.kind === 'serve'
                  ? 'Au service : point, continuité ou faute (les feintes et les balles contrées ne sont proposées qu’à l’attaque). Échap ou « Annuler » n’enregistre pas la flèche.'
                  : 'À l’attaque, les feintes gardent le code couleur (vert pour un point, bleu pour une continuité) et sont tracées en arc de cercle ; la balle contrée est en orange. Échap ou « Annuler » n’enregistre pas la flèche.'}
              </p>
              <button className="btn btn-secondary" onClick={() => setPending(null)}>Annuler (Échap)</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Réglage de la touche qui bascule Services ↔ Attaque */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            className="modal-overlay"
            onClick={() => setShowShortcuts(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="modal tj-shortcuts-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <h2>Raccourcis — Trajectoires</h2>
              <ShortcutSettings shortcuts={shortcuts} onChange={setShortcuts} page="trajectory" />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setShowShortcuts(false)}>Fermer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

