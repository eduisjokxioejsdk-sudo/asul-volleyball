// ============================================================================
// DISTRIBUTION MODE PAGE — Nouveau mode « Distribution » (Rapport Passeur)
//
// Permet de :
//   1. Sélectionner une équipe et plusieurs matchs codés en mode DataVolley
//      (avec normalisation automatique Domicile/Extérieur)
//   2. Ou importer un fichier Excel (.xlsx comme DISTRIBUTION_PASSEUR_.xlsx) / CSV
//   3. Choisir le passeur (Tous, Passeur #N, NP) et la période de matchs (ex. J1-3, J4-6)
//   4. Afficher le rapport de distribution complet identique au fichier Excel.
// ============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import ExcelDistributionReport from '../components/ExcelDistributionReport';
import { videosAPI, datavolleyAPI } from '../services/api';
import { sideOfTeamInMatch } from '../utils/multiMatch';
import {
  extractPossessionsFromMatches,
  computeExcelDistributionReport,
  parseSaisieFromFile,
  cleanVal,
  mapDistribToCourtBox,
} from '../utils/excelDistributionEngine';
import {
  Check,
  House,
  ListChecks,
  Plane,
  Table,
  Users,
  Volleyball,
} from '../components/icons';

export default function DistributionModePage({ user, onLogout }) {
  const fileInputRef = useRef(null);

  // Source de données : 'datavolley' | 'excel'
  const [dataSource, setDataSource] = useState('datavolley');

  // État DataVolley
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videos, setVideos] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);
  const [matchDetailsMap, setMatchDetailsMap] = useState({}); // { [videoId]: { actions, setups, events } }
  const [loadingDetails, setLoadingDetails] = useState(false);

  // État Import Excel / CSV
  const [excelPossessions, setExcelPossessions] = useState([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelError, setExcelError] = useState('');
  const [selectedExcelMatches, setSelectedExcelMatches] = useState([]);

  // Filtres du rapport (Passeur, Phase)
  const [selectedSetter, setSelectedSetter] = useState('ALL');
  const [phaseFilter, setPhaseFilter] = useState('ALL'); // 'ALL' | 'K1' | 'K2'
  const [showMatchSelector, setShowMatchSelector] = useState(true);

  // 1. Chargement initial de tous les matchs DataVolley
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingVideos(true);
      try {
        const res = await videosAPI.getAll();
        if (cancelled) return;
        const list = res.data?.videos || [];
        setVideos(list);

        // Détecte l'équipe la plus fréquente par défaut
        const teamCounts = {};
        for (const v of list) {
          const t1 = (v.team1_name || '').trim();
          const t2 = (v.team2_name || '').trim();
          if (t1) teamCounts[t1] = (teamCounts[t1] || 0) + 1;
          if (t2) teamCounts[t2] = (teamCounts[t2] || 0) + 1;
        }
        const sortedTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);
        if (sortedTeams.length > 0) {
          const defaultTeam = sortedTeams[0][0];
          setSelectedTeam(defaultTeam);
          const teamVids = list
            .filter((v) => sideOfTeamInMatch(v, defaultTeam) !== null)
            .map((v) => v.id);
          setSelectedVideoIds(teamVids);
        } else if (list.length > 0) {
          setSelectedVideoIds(list.slice(0, 5).map((v) => v.id));
        }
      } catch (err) {
        console.error('Erreur chargement des matchs pour le mode Distribution:', err);
      } finally {
        if (!cancelled) setLoadingVideos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Liste de toutes les équipes présentes dans la base DataVolley (avec leur nombre de matchs)
  const teamsList = useMemo(() => {
    const map = new Map();
    for (const v of videos) {
      for (const rawName of [v.team1_name, v.team2_name]) {
        const name = (rawName || '').trim();
        if (!name) continue;
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(v.id);
      }
    }
    return [...map.entries()]
      .map(([name, videoIds]) => ({ name, count: videoIds.length, videoIds }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [videos]);

  // Quand l'utilisateur choisit une équipe, sélectionne automatiquement tous ses matchs
  const handleSelectTeam = (teamName) => {
    setSelectedTeam(teamName);
    setSelectedSetter('ALL');
    const teamVids = videos
      .filter((v) => sideOfTeamInMatch(v, teamName) !== null)
      .map((v) => v.id);
    setSelectedVideoIds(teamVids);
  };

  // Matchs disponibles pour l'équipe sélectionnée
  const teamVideos = useMemo(() => {
    if (!selectedTeam) return videos;
    return videos.filter((v) => sideOfTeamInMatch(v, selectedTeam) !== null);
  }, [videos, selectedTeam]);

  // 3. Chargement des actions, setups et events pour chaque match sélectionné
  useEffect(() => {
    if (dataSource !== 'datavolley') return;
    let cancelled = false;
    const missingIds = selectedVideoIds.filter((id) => !matchDetailsMap[id]);
    if (missingIds.length === 0) return;

    (async () => {
      setLoadingDetails(true);
      try {
        const nextEntries = {};
        await Promise.all(
          missingIds.map(async (vid) => {
            try {
              const [actRes, setRes, evRes] = await Promise.all([
                datavolleyAPI.getActions(vid),
                datavolleyAPI.getSetups(vid).catch(() => ({ data: {} })),
                datavolleyAPI.getEvents(vid).catch(() => ({ data: {} })),
              ]);
              nextEntries[vid] = {
                actions: actRes.data?.actions || [],
                setups: setRes.data?.setups || {},
                events: evRes.data?.events || [],
              };
            } catch {
              nextEntries[vid] = { actions: [], setups: {}, events: [] };
            }
          })
        );
        if (!cancelled) {
          setMatchDetailsMap((prev) => ({ ...prev, ...nextEntries }));
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVideoIds, matchDetailsMap, dataSource]);

  // 4. Extraction des possessions depuis les matchs DataVolley sélectionnés
  const dvPossessions = useMemo(() => {
    if (dataSource !== 'datavolley') return [];
    const matchesInput = selectedVideoIds
      .map((vid) => {
        const video = videos.find((v) => v.id === vid);
        const details = matchDetailsMap[vid];
        if (!video || !details) return null;
        return {
          video,
          actions: details.actions,
          setups: details.setups,
          events: details.events,
        };
      })
      .filter(Boolean);

    return extractPossessionsFromMatches(matchesInput, selectedTeam || null);
  }, [dataSource, selectedVideoIds, videos, matchDetailsMap, selectedTeam]);

  // 5. Gestion de l'import d'un fichier Excel (.xlsx) ou CSV (feuille saisie)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelError('');
    try {
      const parsed = await parseSaisieFromFile(file);
      if (!parsed.length) {
        setExcelError('Aucune ligne de possession valide trouvée dans ce fichier.');
        return;
      }
      setExcelPossessions(parsed);
      setExcelFileName(file.name);
      setDataSource('excel');
      setSelectedSetter('ALL');
      const distinctMatches = [...new Set(parsed.map((p) => cleanVal(p.matchLabel)).filter(Boolean))];
      setSelectedExcelMatches(distinctMatches);
    } catch (err) {
      console.error('Erreur import fichier saisie:', err);
      setExcelError(err?.message || 'Impossible de lire ce fichier Excel/CSV.');
    } finally {
      e.target.value = '';
    }
  };

  // Liste des matchs distincts dans le fichier Excel importé
  const excelDistinctMatches = useMemo(() => {
    const counts = new Map();
    for (const p of excelPossessions) {
      if (!mapDistribToCourtBox(p.distribCode || p.distribBox, null)) continue;
      const m = cleanVal(p.matchLabel);
      if (!m) continue;
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [excelPossessions]);

  // Possessions actives selon la source choisie (filtrées par les matchs cochés)
  const activePossessions = useMemo(() => {
    if (dataSource === 'excel') {
      const mSet = new Set(selectedExcelMatches.map((m) => cleanVal(m)));
      return excelPossessions.filter(
        (p) =>
          mapDistribToCourtBox(p.distribCode || p.distribBox, null) &&
          (mSet.size === 0 || mSet.has(cleanVal(p.matchLabel)))
      );
    }
    return dvPossessions.filter((p) => mapDistribToCourtBox(p.distribCode || p.distribBox, null));
  }, [dataSource, excelPossessions, selectedExcelMatches, dvPossessions]);

  // Liste des passeurs détectés dans les possessions actives
  const availableSetters = useMemo(() => {
    const map = new Map();
    let total = 0;
    for (const p of activePossessions) {
      const s = cleanVal(p.setterNumber) || 'NP';
      map.set(s, (map.get(s) || 0) + 1);
      total += 1;
    }
    return [...map.entries()]
      .map(([setter, count]) => ({
        setter,
        label: setter === 'NP' ? 'NP (Non-Passeur)' : `Passeur N°${setter}`,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => {
        if (a.setter === 'NP') return 1;
        if (b.setter === 'NP') return -1;
        return b.count - a.count;
      });
  }, [activePossessions]);

  // Si le passeur sélectionné n'existe plus dans la sélection courante, revient sur 'ALL'
  useEffect(() => {
    if (
      selectedSetter !== 'ALL' &&
      !availableSetters.some((s) => cleanVal(s.setter) === cleanVal(selectedSetter))
    ) {
      setSelectedSetter('ALL');
    }
  }, [availableSetters, selectedSetter]);

  // Calcul du rapport complet pour l'équipe + passeur + matchs + phase sélectionnés
  const report = useMemo(() => {
    return computeExcelDistributionReport(activePossessions, {
      setterFilter: selectedSetter,
      phaseFilter,
    });
  }, [activePossessions, selectedSetter, phaseFilter]);

  const toggleVideoId = (id) => {
    setSelectedVideoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleExcelMatch = (mName) => {
    setSelectedExcelMatches((prev) =>
      prev.includes(mName) ? prev.filter((x) => x !== mName) : [...prev, mName]
    );
  };

  const activeTeamTitle =
    dataSource === 'excel'
      ? excelFileName.replace(/\.(xlsx|csv)$/i, '') || 'Import Excel'
      : selectedTeam || 'Toutes équipes';

  const activeSetterTitle =
    selectedSetter === 'ALL'
      ? 'Tous les passeurs'
      : selectedSetter === 'NP'
      ? 'NP (Non-Passeur)'
      : `Passeur N°${selectedSetter}`;

  return (
    <div className="app-shell-dark" style={{ minHeight: '100vh', background: '#09090b', color: '#f4f4f5' }}>
      <AppNavigation user={user} onLogout={onLogout} />

      <main style={{ maxWidth: 1860, margin: '0 auto', padding: '16px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* En-tête du Mode Distribution */}
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <PancakeLogo size={52} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f4f4f5' }}>
                  Mode Distribution · Rapport Passeur par Équipe
                </h1>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 8px',
                    background: 'rgba(16, 185, 129, 0.14)',
                    color: '#10b981',
                    border: '1px solid #059669',
                  }}
                >
                  MODÈLE OFFICIEL EXCEL
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#a1a1aa' }}>
                Sélectionnez une équipe et plusieurs matchs codés en mode DataVolley (ou importez un fichier Excel <code style={{ color: '#e8c98f' }}>saisie</code>) pour générer le rapport complet de distribution par passeur.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: '#09090b', border: '1px solid #27272a', padding: 2, gap: 2 }}>
              <button
                type="button"
                className={`btn btn-sm ${dataSource === 'datavolley' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDataSource('datavolley')}
              >
                <Volleyball size={13} /> Matchs DataVolley ({videos.length})
              </button>
              {excelPossessions.length > 0 && (
                <button
                  type="button"
                  className={`btn btn-sm ${dataSource === 'excel' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setDataSource('excel')}
                >
                  Fichier : {excelFileName} ({excelPossessions.length})
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.tsv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Table size={13} /> Importer Excel (.xlsx) / CSV
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowMatchSelector((v) => !v)}
            >
              {showMatchSelector ? 'Masquer sélection matchs' : 'Afficher sélection matchs'}
            </button>
          </div>
        </header>

        {excelError && (
          <div className="dv-flash err" style={{ margin: 0 }}>
            {excelError}
          </div>
        )}

        {/* Panneau de Sélection Équipe & Matchs */}
        {showMatchSelector && (
          <section
            style={{
              background: '#141418',
              border: '1px solid #27272a',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {dataSource === 'datavolley' ? (
              <>
                {/* 1. Choix de l'Équipe */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#c8a165',
                      }}
                    >
                      <Users size={14} /> 1. Choisir l'Équipe à analyser (normalisation automatique Domicile / Extérieur)
                    </label>
                    <span style={{ fontSize: 11.5, color: '#a1a1aa' }}>
                      {teamsList.length} équipes détectées dans les matchs codés
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {teamsList.map((t) => {
                      const active = selectedTeam === t.name;
                      return (
                        <button
                          key={t.name}
                          type="button"
                          className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => handleSelectTeam(t.name)}
                        >
                          <span>{t.name}</span>
                          <span
                            style={{
                              marginLeft: 6,
                              padding: '1px 6px',
                              fontSize: 10.5,
                              fontFamily: 'var(--font-mono)',
                              background: active ? 'rgba(0,0,0,0.28)' : '#09090b',
                            }}
                          >
                            {t.count} m.
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Sélection des Matchs de cette équipe */}
                <div style={{ borderTop: '1px solid #27272a', paddingTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#10b981',
                      }}
                    >
                      <ListChecks size={14} /> 2. Sélectionner les Matchs de « {selectedTeam || 'l’équipe'} » ({selectedVideoIds.length} / {teamVideos.length} sélectionnés)
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => setSelectedVideoIds(teamVideos.map((v) => v.id))}
                      >
                        Tout cocher ({teamVideos.length})
                      </button>
                      {teamVideos.length >= 4 && (
                        <>
                          <button
                            type="button"
                            className="btn btn-xs btn-secondary"
                            onClick={() =>
                              setSelectedVideoIds(
                                teamVideos.slice(0, Math.ceil(teamVideos.length / 2)).map((v) => v.id)
                              )
                            }
                          >
                            1re moitié
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-secondary"
                            onClick={() =>
                              setSelectedVideoIds(
                                teamVideos.slice(Math.floor(teamVideos.length / 2)).map((v) => v.id)
                              )
                            }
                          >
                            Derniers matchs
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => setSelectedVideoIds([])}
                      >
                        Aucun
                      </button>
                    </div>
                  </div>

                  {loadingVideos ? (
                    <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: '#a1a1aa' }}>
                      Chargement des matchs...
                    </div>
                  ) : teamVideos.length === 0 ? (
                    <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: '#a1a1aa' }}>
                      Aucun match trouvé pour cette équipe.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: 8,
                      }}
                    >
                      {teamVideos.map((v) => {
                        const checked = selectedVideoIds.includes(v.id);
                        const side = sideOfTeamInMatch(v, selectedTeam);
                        const opponent =
                          side === 'away' ? v.team1_name || 'Domicile' : v.team2_name || 'Extérieur';
                        const actCount = matchDetailsMap[v.id]?.actions?.length ?? null;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => toggleVideoId(v.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              padding: '8px 12px',
                              textAlign: 'left',
                              background: checked ? 'rgba(16, 185, 129, 0.12)' : '#09090b',
                              border: `1px solid ${checked ? '#10b981' : '#27272a'}`,
                              color: checked ? '#f4f4f5' : '#a1a1aa',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5 }}>
                                {side === 'away' ? (
                                  <Plane size={13} style={{ color: '#0ea5e9', flexShrink: 0 }} />
                                ) : (
                                  <House size={13} style={{ color: '#c8a165', flexShrink: 0 }} />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  vs {opponent}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: '#71717a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {v.display_name || v.title || `${v.team1_name} - ${v.team2_name}`}
                                {actCount !== null ? ` · ${actCount} codes` : ''}
                              </div>
                            </div>
                            <div
                              style={{
                                width: 18,
                                height: 18,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: checked ? '#10b981' : '#141418',
                                border: `1px solid ${checked ? '#10b981' : '#3f3f46'}`,
                                color: '#09090b',
                                flexShrink: 0,
                              }}
                            >
                              {checked && <Check size={12} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Sélection des Matchs / Journées quand un fichier Excel a été importé */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#10b981',
                    }}
                  >
                    Matchs / Journées du fichier « {excelFileName} » ({selectedExcelMatches.length} / {excelDistinctMatches.length} sélectionnés)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      onClick={() => setSelectedExcelMatches(excelDistinctMatches.map((m) => m.name))}
                    >
                      Tous les matchs ({excelDistinctMatches.length})
                    </button>
                    {excelDistinctMatches.length >= 7 && (
                      <>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          onClick={() =>
                            setSelectedExcelMatches(excelDistinctMatches.slice(0, 7).map((m) => m.name))
                          }
                        >
                          J1, 2, 3 (7 premiers matchs)
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          onClick={() =>
                            setSelectedExcelMatches(excelDistinctMatches.slice(7).map((m) => m.name))
                          }
                        >
                          J4, 5, 6 (Derniers matchs)
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      onClick={() => setSelectedExcelMatches([])}
                    >
                      Aucun
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {excelDistinctMatches.map((m) => {
                    const checked = selectedExcelMatches.includes(m.name);
                    return (
                      <button
                        key={m.name}
                        type="button"
                        className={`btn btn-sm ${checked ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => toggleExcelMatch(m.name)}
                      >
                        <span>{m.name}</span>
                        <span
                          style={{
                            marginLeft: 6,
                            padding: '1px 5px',
                            fontSize: 10.5,
                            fontFamily: 'var(--font-mono)',
                            background: 'rgba(0,0,0,0.28)',
                          }}
                        >
                          {m.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Barre des Onglets Passeurs (comme les feuilles PAUL / MARCUS dans l'Excel) + Filtre Phase */}
        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            background: '#141418',
            border: '1px solid #27272a',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#a1a1aa',
                marginRight: 4,
              }}
            >
              Passeur :
            </span>
            <button
              type="button"
              className={`btn btn-sm ${selectedSetter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedSetter('ALL')}
            >
              Tous les passeurs ({activePossessions.length})
            </button>
            {availableSetters.map((s) => {
              const active = cleanVal(selectedSetter) === cleanVal(s.setter);
              return (
                <button
                  key={s.setter}
                  type="button"
                  className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedSetter(s.setter)}
                >
                  <span>{s.label}</span>
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      fontSize: 10.5,
                      fontFamily: 'var(--font-mono)',
                      background: active ? 'rgba(0,0,0,0.28)' : '#09090b',
                    }}
                  >
                    {s.count} act. ({s.pct}%)
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, background: '#09090b', border: '1px solid #27272a', padding: 2 }}>
            {[
              { id: 'ALL', label: 'Toutes phases (S+F+T+C · Standard Excel)' },
              { id: 'K1', label: 'Réception / Side-Out (S+F+T)' },
              { id: 'K2', label: 'Contre-Attaque (C)' },
            ].map((ph) => (
              <button
                key={ph.id}
                type="button"
                className={`btn btn-xs ${phaseFilter === ph.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPhaseFilter(ph.id)}
              >
                {ph.label}
              </button>
            ))}
          </div>
        </section>

        {/* Bandeau de synthèse KPI pour l'équipe et le passeur actif */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 10,
          }}
        >
          <div style={{ background: '#141418', border: '1px solid #27272a', padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
              Équipe / Passeur
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f4f4f5', marginTop: 2 }}>{activeTeamTitle}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#c8a165' }}>{activeSetterTitle}</div>
          </div>

          <div style={{ background: '#141418', border: '1px solid #27272a', padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
              Total Actions
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#f4f4f5', marginTop: 2 }}>
              {report.globalCourt.totalActions}
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa' }}>possessions analysées</div>
          </div>

          <div style={{ background: '#141418', border: '1px solid #27272a', padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
              Actions Gagnantes (#)
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981', marginTop: 2 }}>
              {report.globalCourt.totalKills}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#10b981' }}>
              EFF : {report.globalCourt.totalEffPct.toFixed(1).replace('.', ',')}%
            </div>
          </div>

          <div style={{ background: '#141418', border: '1px solid #27272a', padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
              Poste 4 (EN 4)
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f4f4f5', marginTop: 2 }}>
              {report.globalCourt.boxes['EN 4'].disPct.toFixed(1).replace('.', ',')}%
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa' }}>
              Q={report.globalCourt.boxes['EN 4'].q} · {report.globalCourt.boxes['EN 4'].kills}# (
              {Math.round(report.globalCourt.boxes['EN 4'].effPct)}%)
            </div>
          </div>

          <div style={{ background: '#141418', border: '1px solid #27272a', padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
              Poste 2 / 1 (EN 2 + EN 1)
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f4f4f5', marginTop: 2 }}>
              {(
                report.globalCourt.boxes['EN 2'].disPct + report.globalCourt.boxes['EN 1'].disPct
              )
                .toFixed(1)
                .replace('.', ',')}
              %
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa' }}>
              EN 2: {report.globalCourt.boxes['EN 2'].q} · EN 1: {report.globalCourt.boxes['EN 1'].q}
            </div>
          </div>

          <div style={{ background: '#141418', border: '1px solid #27272a', padding: '10px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa' }}>
              Fixations + Pipe
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f4f4f5', marginTop: 2 }}>
              {(
                report.globalCourt.boxes['FIX AV'].disPct +
                report.globalCourt.boxes['FIX ARR'].disPct +
                report.globalCourt.boxes['DECA'].disPct +
                report.globalCourt.boxes['PIPE'].disPct
              )
                .toFixed(1)
                .replace('.', ',')}
              %
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa' }}>
              Fix Av: {report.globalCourt.boxes['FIX AV'].q} · Arr: {report.globalCourt.boxes['FIX ARR'].q} · Pipe:{' '}
              {report.globalCourt.boxes['PIPE'].q}
            </div>
          </div>
        </section>

        {/* Contenu principal : Rapport Excel complet */}
        {loadingDetails ? (
          <div style={{ padding: 48, textAlign: 'center', background: '#141418', border: '1px solid #27272a', color: '#d4d4d8' }}>
            Extraction et calcul de la distribution des passeurs en cours...
          </div>
        ) : report.globalCourt.totalActions === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', background: '#141418', border: '1px solid #27272a' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f4f4f5', marginBottom: 8 }}>
              Aucune possession d'attaque trouvée pour les critères sélectionnés.
            </div>
            <p style={{ fontSize: 12.5, color: '#a1a1aa', maxWidth: 620, margin: '0 auto' }}>
              Cochez un ou plusieurs matchs codés en mode DataVolley ci-dessus, ou cliquez sur <strong>« Importer Excel (.xlsx) / CSV »</strong> pour charger directement votre fichier <code style={{ color: '#e8c98f' }}>DISTRIBUTION_PASSEUR_.xlsx</code>.
            </p>
          </div>
        ) : (
          <ExcelDistributionReport
            report={report}
            teamName={activeTeamTitle}
            setterLabel={activeSetterTitle}
          />
        )}
      </main>
    </div>
  );
}
