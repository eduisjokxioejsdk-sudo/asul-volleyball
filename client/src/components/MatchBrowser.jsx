// ============================================================================
// Parcours d'un match dans le mode « Playlists » : on choisit un match codé,
// on le relit point par point (ou par joueur et par poste de départ) et on
// ajoute les actions voulues à la playlist en cours — chaque action, ou le
// point entier. Le tri par poste reprend le vocabulaire des fiches de
// trajectoire : 4 (aile gauche), 3 (centre), 2 (aile droite), arrière.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, Loader, Plus, Target, Users } from './icons';
import { datavolleyAPI } from '../services/api';
import { DV_ACTIONS, formatTimecode, rallyWinMethod } from '../utils/datavolley.js';
import { PLAYER_ROLES } from '../utils/lineup.js';
import { parseSavedLineup } from '../utils/lineup.js';
import {
  EMPTY_PLAYLIST_FILTERS,
  PLAYLIST_POSTES,
  buildPlayerPlaylists,
  filterRalliesByActions,
  itemsFromMatches,
  matchingActions,
  posteOfAction,
  posteLabel,
  rallyPlaylist,
  selectMatches,
} from '../utils/playlists.js';

const roleLabelOf = (role) => PLAYER_ROLES.find((r) => r.id === role)?.label || 'Polyvalent';

/** Libellé court d'un poste pour les boutons d'ajout. */
const posteShortLabel = (id) => (id === 'arriere' ? 'Arrière' : `Poste ${id}`);

/**
 * @param {Object} props
 * @param {Array} props.sources matchs proposés ({ id, filename, team1_name… })
 * @param {number|null} props.activeSourceId match en cours de parcours
 * @param {(id:number|null)=>void} props.onSelectSource
 * @param {(items:Array)=>void} props.onAddItems entrées à ajouter à la playlist
 * @param {(ok:boolean, text:string)=>void} [props.onNotify]
 */
export default function MatchBrowser({ sources, activeSourceId, onSelectSource, onAddItems, onNotify }) {
  const [actions, setActions] = useState([]);
  const [sync, setSync] = useState({ sync_offset: 0, lead_in: 4, lead_out: 3 });
  const [configs, setConfigs] = useState({ home: { roster: [] }, away: { roster: [] } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('points');
  const [addScope, setAddScope] = useState('action');
  const [filters, setFilters] = useState(EMPTY_PLAYLIST_FILTERS);

  const source = useMemo(
    () => (sources || []).find((s) => Number(s.id) === Number(activeSourceId)) || null,
    [sources, activeSourceId]
  );

  // Chargement du match choisi : codage + synchronisation + fiches d'équipe.
  useEffect(() => {
    let cancelled = false;
    if (!activeSourceId) {
      setActions([]);
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [actRes, syncRes, setupsRes] = await Promise.all([
          datavolleyAPI.getActions(activeSourceId),
          datavolleyAPI.getSync(activeSourceId).catch(() => ({ data: {} })),
          datavolleyAPI.getSetups(activeSourceId).catch(() => ({ data: { setups: {} } })),
        ]);
        if (cancelled) return;
        setActions(actRes.data?.actions || []);
        setSync(syncRes.data?.sync || { sync_offset: 0, lead_in: 4, lead_out: 3 });
        const setups = setupsRes.data?.setups || {};
        const firstSet = Object.values(setups)[0] || {};
        setConfigs({
          home: parseSavedLineup(firstSet.home_lineup).config,
          away: parseSavedLineup(firstSet.away_lineup).config,
        });
        setFilters(EMPTY_PLAYLIST_FILTERS);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || 'Codage de ce match indisponible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSourceId]);

  const rallies = useMemo(() => rallyPlaylist(actions, sync), [actions, sync]);
  const sets = useMemo(
    () => [...new Set(actions.map((a) => Number(a.set_number) || 1))].sort((a, b) => a - b),
    [actions]
  );
  const filtered = useMemo(() => filterRalliesByActions(rallies, filters), [rallies, filters]);
  const matrixTeam = filters.team === 'away' ? 'away' : 'home';
  const players = useMemo(
    () => buildPlayerPlaylists(filtered, { team: matrixTeam, roster: configs[matrixTeam]?.roster || [] }),
    [filtered, matrixTeam, configs]
  );

  const teamLabelOf = useCallback(
    (team) => (team === 'away' ? source?.team2_name : source?.team1_name) || '',
    [source]
  );
  const nameOf = useCallback(
    (team, number) =>
      (configs[team]?.roster || []).find((p) => Number(p.number) === Number(number))?.name || '',
    [configs]
  );

  /** Ajoute des entrées (issues du parcours) à la playlist en cours. */
  const addEntries = useCallback(
    (entries, opts = {}) => {
      if (!source || !entries || entries.length === 0) return;
      const team = opts.team || entries[0]?.action?.team || 'home';
      const items = itemsFromMatches(entries, {
        video: source,
        sync,
        scope: opts.scope || 'action',
        poste: opts.poste || null,
        teamLabel: teamLabelOf(team),
        playerName: opts.playerName ?? nameOf(team, entries[0]?.action?.player_number),
      });
      if (items.length === 0) {
        if (onNotify) onNotify(false, 'Action sans timecode : ajout impossible (synchronisez la vidéo).');
        return;
      }
      onAddItems(items);
    },
    [source, sync, teamLabelOf, nameOf, onAddItems, onNotify]
  );

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  /** Joueurs présents dans le codage du match (pour le sélecteur). */
  const playerNumbers = useMemo(() => {
    const numbers = new Set();
    for (const a of actions) {
      if (filters.team !== 'all' && a.team !== filters.team) continue;
      const n = Number(a.player_number) || 0;
      if (n) numbers.add(n);
    }
    return [...numbers].sort((a, b) => a - b);
  }, [actions, filters.team]);

  const nameForNumber = (number) =>
    nameOf('home', number) || nameOf('away', number) || '';

  /** Liste « point par point » : chaque action s'ajoute d'un clic. */
  const renderPoints = () => (
    <div className="dv-actions-list">
      {filtered.length === 0 && <p className="dv-empty">Aucun point ne correspond aux filtres.</p>}
      {filtered.map((rally) => {
        const matched = new Set(matchingActions(rally, filters).map((a) => a.action_index));
        return (
          <div key={rally.pointNumber} className="dv-rally">
            <div className="dv-rally-head">
              <span>
                Point {rally.pointNumber} · {rallyWinMethod(rally).label}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dv-rally-time">
                  {formatTimecode(rally.segmentStart)} → {formatTimecode(rally.segmentEnd)}
                </span>
                <button
                  type="button"
                  className="plp-add-btn"
                  title="Ajouter tout le point à la playlist"
                  onClick={() =>
                    addEntries([{ rally, action: rally.actions[0], poste: posteOfAction(rally.actions[0]) }], {
                      scope: 'rally',
                      team: rally.actions[0]?.team,
                    })
                  }
                >
                  <Plus size={11} /> Point
                </button>
              </span>
            </div>
            <div className="dv-rally-codes">
              {rally.actions.map((a) => (
                <button
                  key={a.action_index}
                  type="button"
                  className={`dv-chip plp-chip${matched.has(a.action_index) ? ' matched' : ''}`}
                  title={`Ajouter ${a.code}${addScope === 'rally' ? ' (point entier)' : ' (action seule)'}`}
                  onClick={() =>
                    addEntries([{ rally, action: a, poste: posteOfAction(a) }], {
                      scope: addScope,
                      team: a.team,
                      playerName: nameOf(a.team, a.player_number),
                    })
                  }
                >
                  {a.code}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  /** Liste « par joueur » : une carte par joueur, un bouton par poste. */
  const renderPlayers = () => (
    <div className="plp-players">
      {players.length === 0 && <p className="dv-empty">Aucun joueur pour ces filtres.</p>}
      {players.map((player) => {
        const attacks = selectMatches(player.matches, { action: 'A' });
        const serves = selectMatches(player.matches, { action: 'S' });
        const ctx = { team: matrixTeam, playerName: player.name, scope: addScope };
        return (
          <div key={player.number} className="plp-player-card">
            <div className="plp-player-head">
              <strong>
                n°{String(player.number).padStart(2, '0')}
                {player.name ? ` ${player.name}` : ''}
              </strong>
              <span className="plp-player-role">{roleLabelOf(player.role)}</span>
              <span className="plp-player-total">{player.total} action(s)</span>
            </div>
            <div className="plp-player-buttons">
              {PLAYLIST_POSTES.map((poste) => {
                const count = player.postes[poste.id] || 0;
                if (!count) return null;
                return (
                  <button
                    key={poste.id}
                    type="button"
                    className="plp-add-btn"
                    title={`Ajouter ses attaques ${posteLabel(poste.id)}`}
                    onClick={() =>
                      addEntries(selectMatches(player.matches, { action: 'A', poste: poste.id }), {
                        ...ctx,
                        poste: poste.id,
                      })
                    }
                  >
                    <Target size={11} /> {posteShortLabel(poste.id)} · {count}
                  </button>
                );
              })}
              {serves.length > 0 && (
                <button type="button" className="plp-add-btn" onClick={() => addEntries(serves, ctx)}>
                  <Plus size={11} /> Services · {serves.length}
                </button>
              )}
              {attacks.length > 0 && (
                <button type="button" className="plp-add-btn" onClick={() => addEntries(attacks, ctx)}>
                  <Plus size={11} /> Attaques (tous postes) · {attacks.length}
                </button>
              )}
              <button type="button" className="plp-add-btn ghost" onClick={() => addEntries(player.matches, ctx)}>
                <Plus size={11} /> Tout · {player.total}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="plp-browser">
      <label className="pl-filter">
        Match parcouru
        <select
          value={activeSourceId ? String(activeSourceId) : ''}
          onChange={(event) => onSelectSource(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">Choisir un match…</option>
          {(sources || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name || s.original_name || `Match ${s.id}`} · {s.action_count} action(s)
            </option>
          ))}
        </select>
      </label>

      {!activeSourceId && (
        <p className="dv-hint">
          Choisissez un match codé : ses points s’affichent ci-dessous, avec un bouton « + » sur chaque
          action pour l’ajouter à la playlist en cours.
        </p>
      )}

      {activeSourceId && loading && (
        <p className="dv-hint">
          <Loader size={13} /> Chargement du codage…
        </p>
      )}

      {activeSourceId && !loading && error && (
        <div className="dv-flash err">
          <CircleAlert size={13} /> {error}
        </div>
      )}

      {activeSourceId && !loading && !error && (
        <>
          <div className="plp-mode-tabs">
            <button type="button" className={mode === 'points' ? 'active' : ''} onClick={() => setMode('points')}>
              Point par point
            </button>
            <button type="button" className={mode === 'players' ? 'active' : ''} onClick={() => setMode('players')}>
              <Users size={13} /> Par joueur
            </button>
          </div>

          <div className="plp-add-scope">
            <span>Ajouter :</span>
            <label>
              <input type="radio" checked={addScope === 'action'} onChange={() => setAddScope('action')} />{' '}
              l’action
            </label>
            <label>
              <input type="radio" checked={addScope === 'rally'} onChange={() => setAddScope('rally')} /> le
              point entier
            </label>
          </div>

          <div className="pl-filters">
            <label className="pl-filter">
              Équipe
              <select value={filters.team} onChange={(event) => setFilter('team', event.target.value)}>
                <option value="all">Toutes</option>
                <option value="home">{source?.team1_name || 'Équipe 1'}</option>
                <option value="away">{source?.team2_name || 'Équipe 2'}</option>
              </select>
            </label>
            <label className="pl-filter">
              Joueur
              <select
                value={String(filters.playerNumber)}
                onChange={(event) =>
                  setFilter('playerNumber', event.target.value === 'all' ? 'all' : Number(event.target.value))
                }
              >
                <option value="all">Tous</option>
                {playerNumbers.map((n) => (
                  <option key={n} value={n}>
                    n°{String(n).padStart(2, '0')}
                    {nameForNumber(n) ? ` ${nameForNumber(n)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-filter">
              Action
              <select value={filters.action} onChange={(event) => setFilter('action', event.target.value)}>
                <option value="all">Toutes</option>
                {DV_ACTIONS.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-filter" title="Tri des attaques selon l’endroit d’où part la frappe">
              Poste de départ
              <select value={filters.poste} onChange={(event) => setFilter('poste', event.target.value)}>
                <option value="all">Tous</option>
                {PLAYLIST_POSTES.map((poste) => (
                  <option key={poste.id} value={poste.id}>
                    {poste.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-filter">
              Set
              <select
                value={String(filters.setNumber)}
                onChange={(event) =>
                  setFilter('setNumber', event.target.value === 'all' ? 'all' : Number(event.target.value))
                }
              >
                <option value="all">Tous</option>
                {sets.map((n) => (
                  <option key={n} value={n}>
                    Set {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pl-summary">
            {mode === 'points'
              ? `${filtered.length} point(s) sur ${rallies.length}`
              : `${players.length} joueur(s) · ${players.reduce((sum, p) => sum + p.total, 0)} action(s)`}
          </div>

          {mode === 'points' ? renderPoints() : renderPlayers()}

        </>
      )}
    </div>
  );
}
