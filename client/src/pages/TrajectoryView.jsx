// ============================================================================
// Consultation d'une fiche de trajectoire (lecture seule) — mode d'ouverture
// par défaut d'une fiche.
//   • un onglet par équipe (un seul si une seule équipe a été choisie) ;
//   • Services / Attaque, comme au marquage ;
//   • un terrain par joueur, agrandissable, sans aucun tracé possible ;
//   • un glissement sur un terrain désigne une zone : les flèches traversées
//     passent en violet « flashy » et leur nombre s'affiche ;
//   • un menu « Filtres » choisit les types de flèches affichés.
// Aucun enregistrement : la fiche est seulement lue (le marquage se poursuit
// dans le mode « Annoter »).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import TrajectoryCourt from '../components/TrajectoryCourt';
import TrajectoryFilter from '../components/TrajectoryFilter';
import TrajectoryZoneFilter from '../components/TrajectoryZoneFilter';
import ShortcutSettings from '../components/ShortcutSettings';
import useKindShortcut from '../hooks/useKindShortcut';
import { trajectoryAPI } from '../services/api';
import {
  TRAJECTORY_KINDS,
  countByResult,
  filterShots,
  filterShotsByZone,
  normalizeResultForKind,
  resultsForKind,
  rosterOf,
  shotFromRow,
} from '../utils/trajectory';
import { formatKeyLabel } from '../utils/shortcuts';
import { Eye, House, Keyboard, Pencil, Plane, Users } from '../components/icons';

const TEAM_TABS = [
  { side: 'home', label: 'Équipe 1', icon: House },
  { side: 'away', label: 'Équipe 2', icon: Plane },
];

/** Libellé d'un type de frappe : « Services » / « Attaque ». */
const kindLabelOf = (k) => TRAJECTORY_KINDS.find((x) => x.id === k)?.label || k;

export default function TrajectoryView({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [side, setSide] = useState('home');
  const [kind, setKind] = useState('serve');
  const [hidden, setHidden] = useState([]); // issues masquées par le filtre
  const [zone, setZone] = useState('all'); // poste de départ des attaques affichées
  const [flash, setFlash] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Le bouton « Consulter » clignote cinq secondes à l'ouverture : la fiche
  // s'ouvre désormais en consultation, et non plus en marquage.
  const [blink, setBlink] = useState(true);

  const flashTimer = useRef(null);
  const blinkTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trajectoryAPI.getOne(id);
      setMatch(res.data.match);
      setShots(
        (res.data.shots || [])
          .map(shotFromRow)
          // Une feinte (ou une contrée) n'existe qu'à l'attaque : on garde des
          // fiches cohérentes même si les données viennent d'une ancienne saisie.
          .map((shot) => ({ ...shot, result: normalizeResultForKind(shot.result, shot.kind) }))
      );
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Fiche de trajectoire introuvable.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const notify = useCallback((ok, text) => {
    setFlash({ ok, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (blinkTimer.current) clearTimeout(blinkTimer.current);
  }, []);

  // Le clignotement du bouton « Consulter » s'arrête de lui-même au bout de
  // cinq secondes.
  useEffect(() => {
    blinkTimer.current = setTimeout(() => setBlink(false), 5000);
    return () => { if (blinkTimer.current) clearTimeout(blinkTimer.current); };
  }, []);

  // Raccourci configurable : une seule touche bascule Services ↔ Attaque.
  const toggleKind = useCallback(() => {
    setKind((prev) => {
      const next = prev === 'serve' ? 'attack' : 'serve';
      notify(true, `Onglet ${kindLabelOf(next)}.`);
      return next;
    });
  }, [notify]);

  const { shortcuts, setShortcuts } = useKindShortcut({
    onToggle: toggleKind,
    blocked: showShortcuts,
  });

  const toggleResult = (resultId) => {
    setHidden((prev) => (prev.includes(resultId) ? prev.filter((x) => x !== resultId) : [...prev, resultId]));
  };

  // --- Données dérivées -----------------------------------------------------
  const homeTeam = match?.home_team || null;
  const awayTeam = match?.away_team || null;
  const hasAway = !!(awayTeam || match?.away_team_id);
  const teamOf = (s) => (s === 'home' ? homeTeam : awayTeam);
  const teamNameOf = (s) =>
    teamOf(s)?.name ||
    (s === 'home' ? match?.team1_name : match?.team2_name) ||
    (s === 'home' ? 'Équipe 1' : 'Équipe 2');
  const currentName = teamNameOf(side);
  const opponentName = hasAway ? teamNameOf(side === 'home' ? 'away' : 'home') : '';
  const roster = useMemo(() => rosterOf(teamOf(side)), [homeTeam, awayTeam, side]);
  const sideShots = useMemo(
    () => shots.filter((s) => s.team_side === side && s.kind === kind),
    [shots, side, kind]
  );
  // Le filtre ne joue que sur l'affichage : rien n'est modifié dans la fiche.
  // Le tri par poste de départ ne concerne que les attaques (les services
  // restent affichés) : il précède le filtre des issues.
  const zoneShots = useMemo(
    () => filterShotsByZone(sideShots, zone === 'all' ? [] : [zone], side),
    [sideShots, zone, side]
  );
  const shownShots = useMemo(() => filterShots(zoneShots, hidden), [zoneShots, hidden]);
  const recap = useMemo(() => countByResult(shownShots), [shownShots]);
  const filterResults = useMemo(() => resultsForKind(kind), [kind]);
  const kindLabel = kindLabelOf(kind);

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
            <strong>{match.name}</strong>
            <span className="live-status active">Consultation</span>
            <span className="dv-teams">
              <House size={12} /> {teamNameOf('home')}
              {hasAway && <>&nbsp;·&nbsp; <Plane size={12} /> {teamNameOf('away')}</>}
            </span>
          </div>
          <div className="video-tabs-group">
            {TEAM_TABS.filter((t) => t.side === 'home' || hasAway).map((t) => {
              const TeamIcon = t.icon;
              return (
                <button
                  key={t.side}
                  className={`video-tab ${side === t.side ? 'active' : ''}`}
                  onClick={() => setSide(t.side)}
                  title={teamNameOf(t.side)}
                >
                  <TeamIcon size={13} /> {t.label} · {teamNameOf(t.side)}
                </button>
              );
            })}
          </div>
          <span
            className={`btn btn-primary btn-sm tj-mode-active${blink ? ' tj-mode-blink' : ''}`}
            title="Mode consultation (lecture seule) : c'est le mode d'ouverture par défaut d'une fiche"
          >
            <Eye size={14} /> Consulter
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/trajectories/${id}`)}
            title="Revenir au marquage pour ajouter des flèches"
          >
            <Pencil size={14} /> Annoter
          </button>
        </nav>

        <div className="vd-main">
          <motion.div className="dv-panel tj-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className={`tj-toolbar tj-kind-${kind}`}>
              <div className="dv-stat-tabs">
                {TRAJECTORY_KINDS.map((k) => (
                  <button
                    key={k.id}
                    className={`video-tab ${kind === k.id ? 'active' : ''}`}
                    onClick={() => setKind(k.id)}
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
              {kind === 'attack' && (
                <TrajectoryZoneFilter value={zone} onChange={setZone} />
              )}
              <TrajectoryFilter
                results={filterResults}
                hidden={hidden}
                onToggle={toggleResult}
                onSetAll={setHidden}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowShortcuts(true)}
                title="Changer la touche qui bascule Services ↔ Attaque"
              >
                <Keyboard size={14} /> Raccourcis
              </button>
            </div>

            {flash && <div className={`live-msg ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>}

            <p className="dv-hint">
              Lecture seule : aucune flèche ne peut être ajoutée ni modifiée ici. Glissez sur un terrain pour désigner une
              zone : les flèches concernées passent en violet et leur nombre s’affiche. Cliquez sur un terrain pour
              l’agrandir, utilisez « Filtres » pour n’afficher que certains types de flèches et « Poste de départ » pour
              trier les attaques selon la zone d’où part la flèche (4, 3, 2 ou arrière).
            </p>

            <div className="tj-recap">
              <span className="tj-recap-label">
                {kindLabel} — {currentName} · {shownShots.length} flèche{shownShots.length > 1 ? 's' : ''} affichée{shownShots.length > 1 ? 's' : ''}
              </span>
              {filterResults.filter((r) => recap[r.id] > 0).map((r) => (
                <span key={r.id} className="tj-chip" style={{ borderColor: r.color, color: r.color }}>
                  {r.label} {recap[r.id]}
                </span>
              ))}
              {shownShots.length === 0 && (
                <span className="dv-hint">
                  {sideShots.length === 0
                    ? 'Aucune flèche marquée pour l’instant.'
                    : 'Toutes les flèches sont masquées par le filtre.'}
                </span>
              )}
            </div>

            {roster.length === 0 ? (
              <div className="tj-empty">
                <p>Aucun joueur dans l’effectif de <strong>{currentName}</strong>.</p>
                <p className="dv-hint">
                  Ajoutez les joueurs (n°, nom, rôle) dans l’onglet Équipes : ils apparaîtront ici, un terrain par joueur.
                </p>
                <button className="btn btn-secondary" onClick={() => navigate('/teams')}>
                  <Users size={14} /> Ouvrir les équipes
                </button>
              </div>
            ) : (
              <div className="tj-grid">
                {roster.map((player) => (
                  <TrajectoryCourt
                    key={`${side}-${kind}-${player.number}`}
                    player={player}
                    kind={kind}
                    teams={{ left: currentName, right: opponentName }}
                    shots={shownShots.filter((s) => Number(s.player_number) === player.number)}
                    readOnly
                  />
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

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
