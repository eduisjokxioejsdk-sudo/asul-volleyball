// ============================================================================
// MULTI-MATCH ANALYSIS PAGE (Points 5 & 7 DataVolley 4 Parity)
//
// Permet de sélectionner N matches pour une analyse cumulative :
//   • Normalisation automatique Domicile/Extérieur pour l'équipe cible choisie
//   • Bilan statistique complet (14 onglets MatchReportFull + Distribution)
//   • Plan de Jeu Tactique & Scouting Adverse (OpponentScoutingView)
//   • Export CSV cumulé & Impression Game Plan
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import MatchReportFull, { REPORT_TABS } from '../components/MatchReportFull';
import OpponentScoutingView from '../components/OpponentScoutingView';
import { DistributionCourt } from '../components/AttackCourt';
import { videosAPI, datavolleyAPI } from '../services/api';
import { computeScouting } from '../utils/scouting';
import { computeSetterDistributionByRotation } from '../utils/distribution';
import { downloadTextFile, rowsToCsv } from '../utils/download';
import { reportToRows, computeMatchReport } from '../utils/matchReport';
import { groupActionsIntoRallies } from '../utils/datavolley';
import { computeMatchState } from '../utils/rotation';
import {
  ChartColumn,
  Check,
  ChevronLeft,
  FileDown,
  House,
  ListChecks,
  Plane,
  RotateCcw,
  Table,
  Target,
  Trophy,
  Users,
  Volleyball,
} from '../components/icons';

export default function MultiMatchAnalysisPage({ user, onLogout }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);
  const [matchActionsMap, setMatchActionsMap] = useState({}); // { [videoId]: actions[] }
  const [targetTeam, setTargetTeam] = useState('');
  const [activeView, setActiveView] = useState('gameplan'); // 'gameplan' | 'fullreport' | 'distribution'
  const [reportTab, setReportTab] = useState('synthese');
  const [loadingActions, setLoadingActions] = useState(false);

  // Charger la liste des vidéos
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await videosAPI.getAll();
        if (cancelled) return;
        const list = res.data?.videos || [];
        setVideos(list);

        // Sélectionner par défaut les 3 premiers matches
        if (list.length > 0) {
          const firstThree = list.slice(0, 3).map((v) => v.id);
          setSelectedVideoIds(firstThree);
          const defaultTeam = list[0].team1_name || 'ASUL Lyon';
          setTargetTeam(defaultTeam);
        }
      } catch (err) {
        console.error('Erreur chargement vidéos pour multi-matchs:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Charger les actions des matches sélectionnés au fur et à mesure
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missingIds = selectedVideoIds.filter((vid) => !matchActionsMap[vid]);
      if (missingIds.length === 0) return;

      setLoadingActions(true);
      try {
        const newMap = { ...matchActionsMap };
        await Promise.all(
          missingIds.map(async (vid) => {
            try {
              const res = await datavolleyAPI.getActions(vid);
              newMap[vid] = res.data?.actions || [];
            } catch {
              newMap[vid] = [];
            }
          })
        );
        if (!cancelled) {
          setMatchActionsMap(newMap);
        }
      } finally {
        if (!cancelled) setLoadingActions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVideoIds, matchActionsMap]);

  // Liste de toutes les équipes distinctes présentes dans les matches sélectionnés
  const availableTeams = useMemo(() => {
    const set = new Set();
    for (const vid of selectedVideoIds) {
      const v = videos.find((x) => x.id === vid);
      if (v?.team1_name) set.add(v.team1_name.trim());
      if (v?.team2_name) set.add(v.team2_name.trim());
    }
    return [...set].sort();
  }, [selectedVideoIds, videos]);

  // Si l'équipe cible n'est plus dans la liste, on bascule sur la première
  useEffect(() => {
    if (availableTeams.length > 0 && !availableTeams.includes(targetTeam)) {
      setTargetTeam(availableTeams[0]);
    }
  }, [availableTeams, targetTeam]);

  // Toggle sélection d'un match
  const toggleVideo = (id) => {
    setSelectedVideoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllVideos = () => setSelectedVideoIds(videos.map((v) => v.id));
  const deselectAllVideos = () => setSelectedVideoIds([]);

  // Normalisation des actions : l'équipe cible devient TOUJOURS 'home'
  const normalizedActions = useMemo(() => {
    if (!targetTeam || selectedVideoIds.length === 0) return [];

    const result = [];
    let globalIndex = 0;

    for (const vid of selectedVideoIds) {
      const v = videos.find((x) => x.id === vid);
      if (!v) continue;
      const rawList = matchActionsMap[vid] || [];

      const isTeam1 = (v.team1_name || '').trim().toLowerCase() === targetTeam.trim().toLowerCase();
      const isTeam2 = (v.team2_name || '').trim().toLowerCase() === targetTeam.trim().toLowerCase();

      for (const a of rawList) {
        if (!a) continue;

        let normalizedSide = a.team;
        if (isTeam1) {
          // Si l'équipe cible était l'équipe 1 (domicile d'origine) : 'home' reste 'home', 'away' reste 'away'
          normalizedSide = a.team === 'away' ? 'away' : 'home';
        } else if (isTeam2) {
          // Si l'équipe cible était l'équipe 2 (extérieur d'origine) : on inverse
          normalizedSide = a.team === 'away' ? 'home' : 'away';
        }

        result.push({
          ...a,
          uid: `multi-${vid}-${a.uid || a.action_index || globalIndex}`,
          action_index: globalIndex++,
          team: normalizedSide,
          match_video_id: vid,
          match_label: `${v.team1_name || 'Dom'} vs ${v.team2_name || 'Ext'}`,
        });
      }
    }

    return result;
  }, [targetTeam, selectedVideoIds, videos, matchActionsMap]);

  // Rallies groupés sur l'ensemble cumulé
  const cumulativeRallies = useMemo(() => {
    return groupActionsIntoRallies(normalizedActions);
  }, [normalizedActions]);

  // État du match / Sets virtuels
  const cumulativeState = useMemo(() => {
    return computeMatchState(cumulativeRallies, {}, {}, []);
  }, [cumulativeRallies]);

  // Scouting complet (14 onglets)
  const cumulativeScouting = useMemo(() => {
    const scoredActions = normalizedActions.filter((a) => a && a.evaluation);
    const scoredRallies = groupActionsIntoRallies(scoredActions);

    return computeScouting({
      actions: scoredActions,
      rallies: scoredRallies,
      homeConfig: { roster: [] },
      awayConfig: { roster: [] },
      homeName: targetTeam || 'Équipe Cible',
      awayName: 'Adversaires Cumulés',
      sets: [],
      setMap: new Map(),
      setups: {},
      setterNumbers: { home: null, away: null },
    });
  }, [normalizedActions, targetTeam]);

  // Distribution du passeur cumulée
  const cumulativeDist = useMemo(() => {
    const scoredActions = normalizedActions.filter((a) => a && a.evaluation);
    const scoredRallies = groupActionsIntoRallies(scoredActions);
    return computeSetterDistributionByRotation(
      scoredActions,
      scoredRallies,
      {},
      { home: null, away: null },
      { phase: 'K1', passZone: 'ALL', setterCall: 'ALL', defenderRole: 'ALL' }
    );
  }, [normalizedActions]);

  // Export CSV Cumulé
  const exportCumulativeCsv = () => {
    const scoredActions = normalizedActions.filter((a) => a && a.evaluation);
    const report = computeMatchReport(scoredActions, {
      homeConfig: { roster: [] },
      awayConfig: { roster: [] },
      setMap: new Map(),
      sets: [],
      homeName: targetTeam,
      awayName: 'Adversaires',
    });
    const rows = reportToRows(report);
    const slug = (targetTeam || 'equipe').replace(/\s+/g, '_');
    downloadTextFile(`analyse_cumulee_${slug}_${selectedVideoIds.length}matchs.csv`, rowsToCsv(rows), 'text/csv;charset=utf-8');
  };

  return (
    <div className="multi-match-page app-shell-dark">
      <AppNavigation user={user} onLogout={onLogout} />

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 20px' }}>
        {/* En-tête */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            padding: '16px 20px',
            background: '#141418',
            border: '1px solid #27272a',
            borderLeft: '4px solid #10b981',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <PancakeLogo size={52} />
            <div>
              <h1 style={{ margin: 0, fontSize: 20, color: '#f4f4f5' }}>
                Analyse Multi-Matchs &amp; Plan de Jeu Cumulé (DataVolley 4)
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#a1a1aa' }}>
                Cumulez les données de N rencontres pour préparer vos plans de jeu adverses et analyser vos tendances sur la durée.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={exportCumulativeCsv}
              disabled={normalizedActions.length === 0}
              title="Exporter le bilan statistique cumulé au format CSV"
            >
              <FileDown size={13} /> Exporter Synthèse CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => window.print()}
              title="Imprimer cette analyse"
            >
              🖨️ Imprimer
            </button>
          </div>
        </header>

        {/* Panneau de Sélection des Matches & Équipe Cible */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 14,
            padding: 16,
            background: '#141418',
            border: '1px solid #27272a',
            marginBottom: 18,
          }}
        >
          {/* 1. Sélection de l'Équipe Cible */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa', display: 'block', marginBottom: 6 }}>
              1. Équipe Cible à analyser ({availableTeams.length}) :
            </label>
            <select
              value={targetTeam}
              onChange={(e) => setTargetTeam(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 700, background: '#09090b', border: '1px solid #3f3f46', color: '#f4f4f5' }}
            >
              {availableTeams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <p style={{ margin: '6px 0 0 0', fontSize: 11, color: '#71717a' }}>
              Les statistiques de cette équipe sont automatiquement normalisées (Domicile/Extérieur) quel que soit le côté joué.
            </p>
          </div>

          {/* 2. Sélection des Matches */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
                2. Matches sélectionnés ({selectedVideoIds.length} / {videos.length}) :
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-xs btn-secondary" onClick={selectAllVideos}>Tous</button>
                <button type="button" className="btn btn-xs btn-secondary" onClick={deselectAllVideos}>Aucun</button>
              </div>
            </div>

            <div style={{ maxHeight: 130, overflowY: 'auto', background: '#09090b', border: '1px solid #27272a', padding: 6 }}>
              {videos.map((v) => {
                const isSelected = selectedVideoIds.includes(v.id);
                return (
                  <label
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 6px',
                      cursor: 'pointer',
                      fontSize: 12,
                      background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleVideo(v.id)}
                    />
                    <span style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? '#10b981' : '#d4d4d8' }}>
                      {v.team1_name || 'Dom'} vs {v.team2_name || 'Ext'}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#71717a', marginLeft: 'auto' }}>
                      ({v.display_name || v.original_name})
                    </span>
                  </label>
                );
              })}
              {videos.length === 0 && (
                <div style={{ padding: 8, color: '#71717a', fontSize: 11 }}>Aucune vidéo disponible.</div>
              )}
            </div>
          </div>

          {/* 3. Résumé Cumulé */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#09090b', border: '1px solid #27272a', padding: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#a1a1aa', marginBottom: 2 }}>
              Volume de Données Cumulées
            </div>
            <strong style={{ fontSize: 20, color: '#38bdf8' }}>
              {normalizedActions.length} action(s) codée(s)
            </strong>
            <span style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>
              sur {selectedVideoIds.length} match(es) sélectionnés · {cumulativeRallies.length} points
            </span>
            {loadingActions && (
              <span style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                Chargement des actions en cours…
              </span>
            )}
          </div>
        </section>

        {/* Barre de Bascule des Modes d'Analyse */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={`btn ${activeView === 'gameplan' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('gameplan')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Target size={14} /> Plan de Jeu Tactique (Game Plan)
          </button>
          <button
            type="button"
            className={`btn ${activeView === 'fullreport' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('fullreport')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Table size={14} /> Bilan Cumulé Complet (14 Onglets DV4)
          </button>
          <button
            type="button"
            className={`btn ${activeView === 'distribution' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('distribution')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Users size={14} /> Distribution Passeur Cumulée
          </button>
        </div>

        {/* Contenu selon la vue active */}
        {activeView === 'gameplan' && (
          <OpponentScoutingView
            actions={normalizedActions}
            rallies={cumulativeRallies}
            teamName={targetTeam}
            opponentName="Adversaires Cumulés"
            matchesCount={selectedVideoIds.length}
            onPrint={() => window.print()}
          />
        )}

        {activeView === 'fullreport' && (
          <div style={{ background: '#141418', border: '1px solid #27272a', padding: 14 }}>
            <MatchReportFull
              report={cumulativeScouting}
              context="coding"
              sets={[]}
              activeSets={[]}
              onToggleSet={() => {}}
              rawActions={normalizedActions}
              events={[]}
              tab={reportTab}
              onTab={setReportTab}
            />
          </div>
        )}

        {activeView === 'distribution' && (
          <div style={{ background: '#141418', border: '1px solid #27272a', padding: 16 }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 16 }}>
              Distribution Cumulative du Passeur — {targetTeam} ({selectedVideoIds.length} matches)
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: 12, color: '#a1a1aa' }}>
              Répartition spatiale cumulée de toutes les attaques pour l'ensemble des rencontres analysées.
            </p>
            <DistributionCourt distribution={cumulativeDist.home?.Total} showAllZones />
          </div>
        )}
      </main>
    </div>
  );
}
