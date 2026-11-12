import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { teamsAPI } from '../services/api';
import { PLAYER_ROLES, roleColor, roleLabel, roleShort } from '../utils/lineup';
import { parseFfvbMatchSheet, extractTextFromUploadedSheet } from '../utils/ffvbSheetParser';
import { Check, CircleAlert, Pencil, Plus, RefreshCw, Share2, Trash, Upload, Users, X } from '../components/icons';
import useTeamsSync from '../hooks/useTeamsSync';

const SAMPLE_FFVB_SHEET = `Compétition : NATIONALE 2 MASCULINE - POULE B
Salle : Gymnase tête d'or - Lyon
Date : 21/10/2026
Équipe A : ASUL LYON VOLLEY
01 MARTIN Lucas 1984512 Passeur C
04 DUPONT Théo 2049182 Réceptionneur
07 BERNARD Hugo 1872310 Pointu
09 PETIT Maxime 1930144 Central
11 ROBERT Nathan 2019483 Réceptionneur
12 MOREAU Enzo 1894021 L
15 RICHARD Antoine 1954012 Central

Équipe B : GRENOBLE VUC
02 SIMON Paul 1902381 Passeur
05 LAURENT Alexis 1849201 Réceptionneur C
08 MICHEL Baptiste 2010394 Pointu
10 GARCIA Romain 1948271 Central
13 DAVID Clément 1993812 L
17 BERTRAND Julien 1883920 Central`;

function TeamsPage({ user, onLogout }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [activeTab, setActiveTab] = useState('teams'); // 'teams' | 'directory'
  const [playerSearch, setPlayerSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const [editing, setEditing] = useState(null); // 'new' ou id
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([]);
  const [libero, setLibero] = useState('');
  const [liberoFor, setLiberoFor] = useState('');

  // Modale d'import Feuille de Match FFVB / .dvw / CSV
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRawText, setImportRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Équipes supprimées conservant des matchs / fiches à réaffecter.
  const [deletedTeams, setDeletedTeams] = useState([]);
  // Assistant de réaffectation : { teamId, preview, targetId, mappings, creates, ... }
  const [replacement, setReplacement] = useState(null);

  const loadDeletedTeams = async () => {
    try {
      const res = await teamsAPI.getDeleted();
      setDeletedTeams(res.data.teams || []);
    } catch (err) {
      console.error('Failed to load deleted teams:', err);
    }
  };

  const loadTeams = async () => {
    try {
      const res = await teamsAPI.getAll();
      setTeams(res.data.teams || []);
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
    loadDeletedTeams();
  }, []);

  // Ouverture directe de l'assistant depuis un match marqué « Équipe à définir ».
  const [searchParams, setSearchParams] = useSearchParams();
  const handledReassignRef = useRef(null);
  useEffect(() => {
    const param = searchParams.get('reassign');
    if (!param || loading || handledReassignRef.current === param) return;
    handledReassignRef.current = param;
    openReplacement(param);
    const next = new URLSearchParams(searchParams);
    next.delete('reassign');
    setSearchParams(next, { replace: true });
  }, [searchParams, loading]);

  const { status: syncStatus, syncing, error: syncError, syncNow, saveConfig } = useTeamsSync(loadTeams);
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ url: '', key: '', enabled: true });
  const [configMsg, setConfigMsg] = useState(null);

  useEffect(() => {
    if (!syncStatus) return;
    setConfigForm((prev) =>
      prev.url || prev.key ? prev : { url: syncStatus.url || '', key: '', enabled: syncStatus.enabled !== false }
    );
  }, [syncStatus]);

  const submitConfig = async () => {
    setConfigMsg(null);
    const res = await saveConfig({
      enabled: configForm.enabled,
      url: configForm.url.trim(),
      key: configForm.key.trim() || null,
    });
    if (!res) {
      setConfigMsg({ ok: false, text: 'Configuration non enregistrée.' });
      return;
    }
    setConfigForm((prev) => ({ ...prev, key: '' }));
    if (res.check?.ok) {
      setConfigMsg({ ok: true, text: 'Configuration enregistrée, connexion au cloud vérifiée.' });
    } else if (res.check?.error) {
      setConfigMsg({ ok: false, text: `Configuration enregistrée, mais connexion impossible : ${res.check.error}` });
    } else {
      setConfigMsg({ ok: true, text: 'Configuration enregistrée (partage désactivé).' });
    }
    if (configForm.enabled) await syncNow();
  };

  const syncLabel = (() => {
    if (!syncStatus) return 'État du partage indisponible (serveur en cours de démarrage ?).';
    if (!syncStatus.configured) {
      return 'Non configuré : les équipes ne sortent pas de cet appareil (sauf réseau local).';
    }
    if (!syncStatus.enabled) return 'Désactivé : toutes les équipes restent sur ce poste.';
    const when = syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString('fr-FR') : 'jamais';
    const pending = syncStatus.pending ? ` · ${syncStatus.pending} en attente d’envoi` : '';
    if (syncStatus.lastError) return `Dernier essai (${when}) : ${syncStatus.lastError}${pending}`;
    return `${syncStatus.teams} équipe(s) partagée(s) via ${syncStatus.url} · dernier passage : ${when}${pending}`;
  })();

  const startNew = () => {
    setEditing('new');
    setName('');
    setPlayers([]);
    setLibero('');
    setLiberoFor('');
    setFlash(null);
  };

  const startEdit = (t) => {
    setEditing(t.id);
    setName(t.name);
    setPlayers(
      (t.players || []).map((p) => ({
        number: String(p.number ?? ''),
        name: p.name || '',
        role: p.role || 'universal',
        secondary_role: p.secondary_role || '',
        license_number: p.license_number || '',
        height_cm: p.height_cm ? String(p.height_cm) : '',
        birth_year: p.birth_year ? String(p.birth_year) : '',
        handedness: p.handedness || 'R',
        is_captain: Boolean(p.is_captain),
        is_libero: Boolean(p.is_libero || p.role === 'libero'),
      }))
    );
    setLibero(t.libero ? String(t.libero) : '');
    setLiberoFor(t.libero_for ? String(t.libero_for) : '');
    setFlash(null);
  };

  const cancel = () => setEditing(null);

  const updatePlayer = (i, field, value) => {
    setPlayers((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        if (field === 'number' || field === 'height_cm' || field === 'birth_year') {
          return { ...p, [field]: String(value).replace(/\D/g, '') };
        }
        if (field === 'role') {
          return { ...p, role: value, is_libero: value === 'libero' ? true : p.is_libero };
        }
        return { ...p, [field]: value };
      })
    );
  };

  const addPlayerRow = () =>
    setPlayers((prev) => [
      ...prev,
      {
        number: '',
        name: '',
        role: 'universal',
        secondary_role: '',
        license_number: '',
        height_cm: '',
        handedness: 'R',
        is_captain: false,
        is_libero: false,
      },
    ]);

  const removePlayerRow = (i) => setPlayers((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) {
      setFlash({ ok: false, text: 'Le nom de l’équipe est requis.' });
      return;
    }
    const cleanPlayers = players
      .filter((p) => (p.name || '').trim() !== '' || (p.number || '').trim() !== '')
      .map((p) => ({
        number: Number(p.number) || 0,
        name: (p.name || '').trim() || `N°${p.number}`,
        role: p.role || 'universal',
        secondary_role: p.secondary_role || null,
        license_number: (p.license_number || '').trim() || null,
        height_cm: p.height_cm ? Number(p.height_cm) : null,
        birth_year: p.birth_year ? Number(p.birth_year) : null,
        handedness: p.handedness || 'R',
        is_captain: p.is_captain ? 1 : 0,
        is_libero: p.is_libero || p.role === 'libero' ? 1 : 0,
      }));
    const autoLib = cleanPlayers.find((p) => p.is_libero)?.number || null;
    const settings = { libero: libero || autoLib || null, liberoFor: liberoFor || null };
    try {
      if (editing === 'new') await teamsAPI.create(name.trim(), cleanPlayers, settings);
      else await teamsAPI.update(editing, name.trim(), cleanPlayers, settings);
      setEditing(null);
      await loadTeams();
      setFlash({ ok: true, text: 'Équipe enregistrée avec ses attributs joueurs.' });
    } catch (err) {
      console.error('Failed to save team:', err);
      setFlash({ ok: false, text: 'Erreur lors de la sauvegarde.' });
    }
  };

  // Correspondance par défaut : même numéro si l'équipe cible le possède,
  // sinon création du joueur (le numéro des actions reste inchangé).
  const buildMappings = (preview, targetId) => {
    const target = teams.find((t) => Number(t.id) === Number(targetId));
    const targetNumbers = new Set((target?.players || []).map((p) => Number(p.number)));
    const mappings = {};
    (preview?.numbers || []).forEach((row) => {
      mappings[row.number] = targetNumbers.has(Number(row.number)) ? String(row.number) : 'create';
    });
    return mappings;
  };

  const initialCreates = (preview) => {
    const creates = {};
    (preview?.numbers || []).forEach((row) => {
      creates[row.number] = { number: String(row.number), name: row.name || `N°${row.number}` };
    });
    return creates;
  };

  const openReplacement = async (teamId) => {
    setReplacement({
      loading: true,
      teamId: Number(teamId),
      preview: null,
      targetId: '',
      mappings: {},
      creates: {},
      error: null,
      applying: false,
    });
    try {
      const res = await teamsAPI.getReplacementPreview(teamId);
      const preview = res.data;
      const candidates = teams.filter((t) => Number(t.id) !== Number(teamId));
      const targetId = candidates.length === 1 ? String(candidates[0].id) : '';
      setReplacement({
        loading: false,
        teamId: Number(teamId),
        preview,
        targetId,
        mappings: buildMappings(preview, targetId),
        creates: initialCreates(preview),
        error: null,
        applying: false,
      });
    } catch (err) {
      setReplacement((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              error: err.response?.data?.error || 'Impossible de charger les rencontres concernées.',
            }
          : prev
      );
    }
  };

  const changeReplacementTarget = (value) => {
    setReplacement((prev) => {
      if (!prev?.preview) return prev;
      return {
        ...prev,
        targetId: value,
        mappings: buildMappings(prev.preview, value),
        error: null,
      };
    });
  };

  const setReplacementMapping = (oldNumber, value) => {
    setReplacement((prev) =>
      prev ? { ...prev, mappings: { ...prev.mappings, [oldNumber]: value }, error: null } : prev
    );
  };

  const setReplacementCreateField = (oldNumber, field, value) => {
    setReplacement((prev) => {
      if (!prev) return prev;
      const current = prev.creates?.[oldNumber] || { number: String(oldNumber), name: '' };
      return {
        ...prev,
        creates: { ...prev.creates, [oldNumber]: { ...current, [field]: value } },
        error: null,
      };
    });
  };

  const applyReplacement = async () => {
    if (!replacement?.preview || !replacement.targetId) return;
    const numberMap = {};
    const createPlayers = [];
    for (const row of replacement.preview.numbers || []) {
      const choice = replacement.mappings[row.number];
      if (choice === 'create') {
        const created = replacement.creates?.[row.number] || {};
        const number = Number(created.number) || Number(row.number);
        numberMap[row.number] = number;
        createPlayers.push({
          number,
          name: (created.name || row.name || `N°${number}`).trim(),
          role: row.role || 'universal',
        });
      } else {
        numberMap[row.number] = Number(choice) || Number(row.number);
      }
    }
    setReplacement((prev) => (prev ? { ...prev, applying: true, error: null } : prev));
    try {
      const res = await teamsAPI.replace(replacement.preview.team.id, {
        target_team_id: Number(replacement.targetId),
        number_map: numberMap,
        create_players: createPlayers,
      });
      setReplacement(null);
      await loadTeams();
      await loadDeletedTeams();
      setFlash({
        ok: true,
        text: res.data?.message || 'Équipe réaffectée, données conservées.',
      });
    } catch (err) {
      const payload = err.response?.data || {};
      let message = payload.error || 'Erreur lors de la réaffectation.';
      if (Array.isArray(payload.conflicts) && payload.conflicts.length) {
        message += ` Rencontres concernées : ${payload.conflicts.map((c) => c.label).join(' · ')}.`;
      }
      if (Array.isArray(payload.missing) && payload.missing.length) {
        message += ` Numéros sans correspondance : ${payload.missing
          .map((m) => `${m.number} → ${m.target}`)
          .join(', ')}.`;
      }
      setReplacement((prev) => (prev ? { ...prev, applying: false, error: message } : prev));
    }
  };

  const remove = async (id) => {
    const team = teams.find((t) => Number(t.id) === Number(id));
    if (
      !window.confirm(
        `Supprimer « ${team?.name || 'cette équipe'} » ?\n\nLes matchs et fiches de trajectoire qui l'utilisent passeront en « Équipe à définir ». Aucune action ni trajectoire ne sera perdue : vous pourrez choisir une autre équipe pour les réaffecter.`
      )
    ) {
      return;
    }
    try {
      const res = await teamsAPI.delete(id);
      await loadTeams();
      await loadDeletedTeams();
      const affected = res.data?.affected || {};
      const total = Number(affected.videos || 0) + Number(affected.trajectories || 0);
      setFlash({
        ok: true,
        text: total
          ? `Équipe supprimée. ${total} rencontre(s) à réaffecter.`
          : 'Équipe supprimée.',
      });
      if (total > 0) await openReplacement(id);
    } catch (err) {
      console.error('Failed to delete team:', err);
      setFlash({ ok: false, text: err.response?.data?.error || 'Erreur lors de la suppression.' });
    }
  };

  // Aperçu temps réel du parseur FFVB / .dvw / CSV
  const parsedPreview = useMemo(() => parseFfvbMatchSheet(importRawText), [importRawText]);

  const handleUploadSheetFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await extractTextFromUploadedSheet(file);
      setImportRawText(text);
    } catch (err) {
      alert(`Impossible de lire le fichier : ${err.message}`);
    }
  };

  const confirmBatchImport = async () => {
    if (!parsedPreview.teams.length) return;
    setImporting(true);
    try {
      const res = await teamsAPI.importBatch(parsedPreview.teams);
      setTeams(res.data?.teams || []);
      setShowImportModal(false);
      setImportRawText('');
      setFlash({
        ok: true,
        text: `${parsedPreview.teams.length} équipe(s) importée(s) / mise(s) à jour depuis la feuille de match.`,
      });
    } catch (err) {
      setFlash({ ok: false, text: err.response?.data?.error || 'Erreur lors de l’importation.' });
    } finally {
      setImporting(false);
    }
  };

  // Annuaire global dédoublonné des joueurs (Point 2)
  const globalDirectory = useMemo(() => {
    const list = [];
    for (const t of teams) {
      for (const p of t.players || []) {
        list.push({
          ...p,
          teamId: t.id,
          teamName: t.name,
        });
      }
    }
    return list.filter((p) => {
      if (roleFilter !== 'ALL' && (p.role || 'universal') !== roleFilter) return false;
      if (!playerSearch.trim()) return true;
      const q = playerSearch.toLowerCase();
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.teamName || '').toLowerCase().includes(q) ||
        String(p.license_number || '').toLowerCase().includes(q) ||
        String(p.number || '').includes(q)
      );
    });
  }, [teams, playerSearch, roleFilter]);

  const deletedTeamsToFix = deletedTeams.filter((t) => Number(t.total_count || 0) > 0);
  const replacementTargets = replacement
    ? teams.filter((t) => Number(t.id) !== Number(replacement.teamId))
    : [];
  const replacementTarget = replacementTargets.find(
    (t) => Number(t.id) === Number(replacement?.targetId)
  );
  const replacementConflicts =
    replacement?.preview && replacement.targetId
      ? [
          ...(replacement.preview.videos || []).map((v) => ({
            key: `v-${v.id}`,
            label: v.display_name || v.original_name || `Vidéo ${v.id}`,
            otherId: Number(v.side === 'home' ? v.away_team_id : v.home_team_id),
          })),
          ...(replacement.preview.trajectories || []).map((m) => ({
            key: `t-${m.id}`,
            label: m.name || `Fiche ${m.id}`,
            otherId: Number(m.side === 'home' ? m.away_team_id : m.home_team_id),
          })),
        ].filter((item) => item.otherId === Number(replacement.targetId))
      : [];
  const replacementAssignments = {};
  if (replacement?.preview) {
    for (const row of replacement.preview.numbers || []) {
      const choice = replacement.mappings?.[row.number];
      const assigned =
        choice === 'create'
          ? Number(replacement.creates?.[row.number]?.number) || Number(row.number)
          : Number(choice) || Number(row.number);
      if (!replacementAssignments[assigned]) replacementAssignments[assigned] = [];
      replacementAssignments[assigned].push(row.number);
    }
  }
  const replacementDuplicates = Object.entries(replacementAssignments).filter(
    ([, oldNumbers]) => oldNumbers.length > 1
  );

  return (
    <div className="dashboard teams-page asul-modern">
      <AppNavigation user={user} onLogout={onLogout} />

      <div className="dashboard-content" style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className="mode-selector" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <PancakeLogo size={24} /> Équipes & Base Joueurs Globale
            </h3>
            <div className="dv-stat-tabs">
              <button
                type="button"
                className={`video-tab ${activeTab === 'teams' ? 'active' : ''}`}
                onClick={() => setActiveTab('teams')}
              >
                Équipes ({teams.length})
              </button>
              <button
                type="button"
                className={`video-tab ${activeTab === 'directory' ? 'active' : ''}`}
                onClick={() => setActiveTab('directory')}
              >
                <Users size={13} /> Annuaire Global Joueurs ({globalDirectory.length})
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowImportModal(true)}
              title="Importer les 2 équipes et licences depuis une Feuille de Match FFVB (PDF / texte), un fichier .dvw ou un CSV"
            >
              <Upload size={14} /> Importer Feuille de Match FFVB / .dvw
            </button>
            <button type="button" className="btn btn-primary" onClick={startNew}>
              <Plus size={14} /> Nouvelle équipe
            </button>
          </div>
        </div>

        {/* Partage à distance */}
        <div className="dv-panel" style={{ margin: '0 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {syncStatus?.lastError ? <CircleAlert size={16} /> : <Share2 size={16} />}
              <div>
                <strong>Partage à distance</strong>
                <p className="dv-hint" style={{ margin: 0 }}>{syncLabel}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={syncNow}
                disabled={syncing || !syncStatus?.enabled}
              >
                <RefreshCw size={14} /> {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowConfig((v) => !v)}>
                {showConfig ? 'Masquer' : 'Configurer…'}
              </button>
            </div>
          </div>

          {showConfig && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
              <div className="form-group">
                <label>URL du projet Supabase</label>
                <input
                  type="text"
                  placeholder="https://xxxxxxxx.supabase.co"
                  value={configForm.url}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, url: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>
                  Clé « anon »{syncStatus?.hasKey ? ' (déjà enregistrée — laisser vide pour la conserver)' : ''}
                </label>
                <input
                  type="password"
                  placeholder={syncStatus?.hasKey ? '••••••••' : 'eyJhbGciOi…'}
                  value={configForm.key}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, key: e.target.value }))}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={configForm.enabled}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                Partager les équipes entre les postes (synchronisation cloud)
              </label>
              {configMsg && <div className={`dv-flash ${configMsg.ok ? 'ok' : 'err'}`}>{configMsg.text}</div>}
              {!configMsg && syncError && <div className="dv-flash err">{syncError}</div>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={submitConfig}>
                  <Check size={14} /> Enregistrer et tester
                </button>
                <button className="btn btn-secondary" onClick={() => setShowConfig(false)}>Fermer</button>
              </div>
            </div>
          )}
        </div>

        {deletedTeamsToFix.length > 0 && (
          <div
            className="dv-panel"
            style={{ margin: '0 0 16px', border: '1px solid rgba(248, 113, 113, 0.45)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <CircleAlert size={16} color="#f87171" />
              <strong style={{ color: '#f87171' }}>Équipes supprimées à réaffecter</strong>
            </div>
            <p className="dv-hint" style={{ marginTop: 0 }}>
              Les matchs et fiches de trajectoire de ces équipes sont marqués « Équipe à définir ». Choisissez
              l'équipe qui les remplace : les actions sont conservées et rattachées aux joueurs par numéro.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {deletedTeamsToFix.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(248, 113, 113, 0.06)',
                    border: '1px solid rgba(248, 113, 113, 0.2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="team-undef">{t.name}</span>
                    <span className="dv-hint" style={{ margin: 0 }}>
                      {Number(t.video_count || 0)} match(s) · {Number(t.trajectory_count || 0)} fiche(s)
                      {Number(t.live_count || 0) ? ` · ${Number(t.live_count)} session(s) live` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => openReplacement(t.id)}
                    disabled={Number(t.total_count || 0) === 0}
                    title={
                      Number(t.total_count || 0) === 0
                        ? 'Aucune rencontre à réaffecter'
                        : 'Choisir l’équipe de remplacement et la correspondance des numéros'
                    }
                  >
                    Réaffecter…
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {flash && <div className={`dv-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>}

        {activeTab === 'directory' ? (
          <div className="dv-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0 }}>Base Joueurs Globale (Suivi inter-matchs & Licences FFVB)</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Rechercher nom, n° licence, équipe…"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  style={{ width: 240 }}
                />
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="ALL">Tous les postes</option>
                  {PLAYER_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <table className="dv-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Joueur</th>
                  <th>Équipe</th>
                  <th>Poste principal</th>
                  <th>Poste sec.</th>
                  <th>Licence FFVB</th>
                  <th>Taille</th>
                  <th>Main</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {globalDirectory.map((p, idx) => (
                  <tr key={`${p.teamId}-${p.number}-${idx}`}>
                    <td className="pk-mono">{String(p.number).padStart(2, '0')}</td>
                    <td>
                      <strong>{p.name}</strong>
                      {p.is_captain ? (
                        <span className="dv-badge-cap" title="Capitaine">C</span>
                      ) : null}
                      {p.is_libero || p.role === 'libero' ? (
                        <span className="dv-badge-lib" title="Libéro">L</span>
                      ) : null}
                    </td>
                    <td>{p.teamName}</td>
                    <td>
                      <span className="report-role" style={{ background: roleColor(p.role || 'universal') }}>
                        {roleShort(p.role || 'universal')}
                      </span>{' '}
                      {roleLabel(p.role || 'universal')}
                    </td>
                    <td>{p.secondary_role ? roleLabel(p.secondary_role) : '—'}</td>
                    <td className="pk-mono">{p.license_number || '—'}</td>
                    <td className="pk-mono">{p.height_cm ? `${p.height_cm} cm` : '—'}</td>
                    <td className="pk-mono">{p.handedness === 'L' ? 'Gaucher' : 'Droitier'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const foundTeam = teams.find((t) => t.id === p.teamId);
                          if (foundTeam) {
                            setActiveTab('teams');
                            startEdit(foundTeam);
                          }
                        }}
                      >
                        Fiche équipe
                      </button>
                    </td>
                  </tr>
                ))}
                {globalDirectory.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                      Aucun joueur trouvé pour ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {editing !== null && (
              <motion.div className="dv-panel" style={{ marginBottom: 20 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h4 style={{ marginTop: 0 }}>{editing === 'new' ? 'Nouvelle équipe' : 'Modifier l’équipe'}</h4>
                <div className="form-group">
                  <label>Nom de l’équipe</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: ASUL Lyon" autoFocus />
                </div>
                <div className="form-group">
                  <label>Effectif complet (N°, Nom, Poste, Licence FFVB, Taille, Main, Capitaine)</label>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="dv-table" style={{ marginBottom: 8 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 64 }}>N°</th>
                          <th>Nom & Prénom</th>
                          <th style={{ width: 145 }}>Poste</th>
                          <th style={{ width: 135 }}>Poste 2</th>
                          <th style={{ width: 120 }}>Licence FFVB</th>
                          <th style={{ width: 85 }}>Taille (cm)</th>
                          <th style={{ width: 90 }}>Main</th>
                          <th style={{ width: 55 }}>Cap.</th>
                          <th style={{ width: 45 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((p, i) => (
                          <tr key={i}>
                            <td>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="N°"
                                value={p.number}
                                onChange={(e) => updatePlayer(i, 'number', e.target.value)}
                                style={{ width: 54 }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                placeholder="DUPONT Jean"
                                value={p.name}
                                onChange={(e) => updatePlayer(i, 'name', e.target.value)}
                                style={{ width: '100%', minWidth: 150 }}
                              />
                            </td>
                            <td>
                              <select
                                value={p.role || 'universal'}
                                onChange={(e) => updatePlayer(i, 'role', e.target.value)}
                                style={{ width: '100%' }}
                              >
                                {PLAYER_ROLES.map((r) => (
                                  <option key={r.id} value={r.id}>{r.label}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                value={p.secondary_role || ''}
                                onChange={(e) => updatePlayer(i, 'secondary_role', e.target.value)}
                                style={{ width: '100%' }}
                              >
                                <option value="">— Aucun —</option>
                                {PLAYER_ROLES.map((r) => (
                                  <option key={r.id} value={r.id}>{r.label}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="text"
                                placeholder="1984512"
                                value={p.license_number || ''}
                                onChange={(e) => updatePlayer(i, 'license_number', e.target.value)}
                                style={{ width: 110 }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="192"
                                value={p.height_cm || ''}
                                onChange={(e) => updatePlayer(i, 'height_cm', e.target.value)}
                                style={{ width: 72 }}
                              />
                            </td>
                            <td>
                              <select
                                value={p.handedness || 'R'}
                                onChange={(e) => updatePlayer(i, 'handedness', e.target.value)}
                              >
                                <option value="R">Droitier</option>
                                <option value="L">Gaucher</option>
                              </select>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={Boolean(p.is_captain)}
                                onChange={(e) => updatePlayer(i, 'is_captain', e.target.checked)}
                                title="Capitaine"
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                title="Retirer ce joueur"
                                onClick={() => removePlayerRow(i)}
                              >
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addPlayerRow}>
                    <Plus size={14} /> Ajouter un joueur
                  </button>
                </div>
                <div className="form-group">
                  <label>Libéro titulaire (optionnel)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="N° du libéro"
                      value={libero}
                      onChange={(e) => setLibero(e.target.value.replace(/\D/g, ''))}
                      style={{ width: 130 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>remplace le n°</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="N° remplacé"
                      value={liberoFor}
                      onChange={(e) => setLiberoFor(e.target.value.replace(/\D/g, ''))}
                      style={{ width: 130 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>sur les postes arrière (P1, P5, P6)</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-primary" onClick={save}>
                    <Check size={14} /> Enregistrer
                  </button>
                  <button className="btn btn-secondary" onClick={cancel}>Annuler</button>
                </div>
              </motion.div>
            )}

            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Chargement…</p>
            ) : teams.length === 0 && editing === null ? (
              <p className="dv-hint">Aucune équipe. Créez une équipe ou importez une Feuille de Match FFVB.</p>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {teams.map((t) => (
                <motion.div key={t.id} className="dv-panel" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0 }}>{t.name}</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" title="Modifier l’équipe" onClick={() => startEdit(t)}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-secondary btn-sm" title="Supprimer l’équipe" onClick={() => remove(t.id)}>
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                  {t.libero ? (
                    <p className="dv-hint" style={{ marginTop: 4 }}>
                      Libéro n°{t.libero}
                      {t.libero_for ? ` (remplace le n°${t.libero_for} au poste arrière)` : ''}
                    </p>
                  ) : null}
                  <table className="dv-table" style={{ marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Joueur</th>
                        <th>Licence</th>
                        <th>Rôle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(t.players || []).map((p) => (
                        <tr key={p.id ?? `${p.number}:${p.name}`}>
                          <td className="pk-mono">{String(p.number).padStart(2, '0')}</td>
                          <td>
                            {p.name}
                            {p.is_captain ? <span className="dv-badge-cap" title="Capitaine">C</span> : null}
                            {p.is_libero || p.role === 'libero' ? <span className="dv-badge-lib" title="Libéro">L</span> : null}
                          </td>
                          <td className="pk-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {p.license_number || '—'}
                          </td>
                          <td>
                            <span className="report-role" style={{ background: roleColor(p.role || 'universal') }}>
                              {roleShort(p.role || 'universal')}
                            </span>{' '}
                            {roleLabel(p.role || 'universal')}
                          </td>
                        </tr>
                      ))}
                      {(t.players || []).length === 0 && (
                        <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>Aucun joueur</td></tr>
                      )}
                    </tbody>
                  </table>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Assistant de réaffectation d'une équipe supprimée */}
      {replacement && (
        <div className="modal-backdrop" onClick={() => setReplacement(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 900, width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} /> Réaffecter
                {replacement.preview?.team?.name ? ` « ${replacement.preview.team.name} »` : ' l’équipe supprimée'}
              </h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReplacement(null)}>
                <X size={14} />
              </button>
            </div>

            {replacement.loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Chargement des rencontres concernées…</p>
            ) : replacement.preview ? (
              <>
                <p className="dv-hint">
                  Les actions et trajectoires sont conservées. Chaque numéro de l’ancienne équipe est rattaché
                  automatiquement au même numéro de la nouvelle équipe. Si un numéro n’existe pas, choisissez un
                  autre joueur ou créez-le dans l’équipe de remplacement.
                </p>

                <div className="form-group">
                  <label>Équipe de remplacement</label>
                  <select
                    value={replacement.targetId}
                    onChange={(e) => changeReplacementTarget(e.target.value)}
                  >
                    <option value="">— Choisir une équipe —</option>
                    {replacementTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({(t.players || []).length} joueur(s))
                      </option>
                    ))}
                  </select>
                </div>

                {replacementTargets.length === 0 && (
                  <div className="dv-flash err">
                    Aucune autre équipe disponible. Créez d’abord l’équipe de remplacement, puis revenez ici.
                  </div>
                )}

                <div className="dv-panel" style={{ margin: '10px 0', padding: 12 }}>
                  <strong style={{ fontSize: 13 }}>
                    {replacement.preview.videos.length} match(s) ·{' '}
                    {replacement.preview.trajectories.length} fiche(s) de trajectoire
                  </strong>
                  <div className="dv-hint" style={{ marginTop: 4 }}>
                    Ancienne équipe : <span className="team-undef">{replacement.preview.team.name}</span>
                  </div>
                </div>

                {replacementConflicts.length > 0 && (
                  <div className="dv-flash err">
                    « {replacementTarget?.name || 'Cette équipe'} » est déjà l’adversaire dans{' '}
                    {replacementConflicts.length} rencontre(s) :{' '}
                    {replacementConflicts.map((c) => c.label).join(' · ')}. Choisissez une autre équipe de
                    remplacement.
                  </div>
                )}

                {(replacement.preview.numbers || []).length === 0 ? (
                  <div className="dv-flash ok">
                    Aucune action ni trajectoire à remapper : seule l’étiquette des rencontres sera mise à jour.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="dv-table" style={{ marginTop: 10 }}>
                      <thead>
                        <tr>
                          <th>Ancien joueur</th>
                          <th>Données</th>
                          <th>Nouveau joueur / action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(replacement.preview.numbers || []).map((row) => {
                          const choice = replacement.mappings?.[row.number] || 'create';
                          const created = replacement.creates?.[row.number] || {};
                          return (
                            <tr key={row.number}>
                              <td>
                                <strong className="pk-mono">N°{String(row.number).padStart(2, '0')}</strong>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.name}</div>
                              </td>
                              <td className="pk-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                {row.actions} action(s)
                                <br />
                                {row.shots} tir(s)
                                {row.lineups ? ` · ${row.lineups} six` : ''}
                              </td>
                              <td>
                                <select
                                  value={choice}
                                  onChange={(e) => setReplacementMapping(row.number, e.target.value)}
                                  style={{ width: '100%', minWidth: 220 }}
                                >
                                  <optgroup label="Assigner à un joueur de l’équipe cible">
                                    {(replacementTarget?.players || []).map((p) => (
                                      <option key={p.number} value={String(p.number)}>
                                        N°{String(p.number).padStart(2, '0')} — {p.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Créer un joueur dans l’équipe cible">
                                    <option value="create">
                                      Créer le joueur n°
                                      {created.number || row.number}
                                    </option>
                                  </optgroup>
                                </select>
                                {choice === 'create' && (
                                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      title="Numéro du nouveau joueur"
                                      value={created.number || ''}
                                      onChange={(e) =>
                                        setReplacementCreateField(
                                          row.number,
                                          'number',
                                          String(e.target.value).replace(/\D/g, '').slice(0, 2)
                                        )
                                      }
                                      style={{ width: 60 }}
                                      placeholder="N°"
                                    />
                                    <input
                                      type="text"
                                      title="Nom du nouveau joueur"
                                      value={created.name || ''}
                                      onChange={(e) =>
                                        setReplacementCreateField(row.number, 'name', e.target.value)
                                      }
                                      style={{ flex: 1, minWidth: 150 }}
                                      placeholder="Nom du joueur"
                                    />
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {replacementDuplicates.length > 0 && (
                  <div className="dv-flash err" style={{ marginTop: 10 }}>
                    Plusieurs anciens numéros arrivent sur le même nouveau numéro :{' '}
                    {replacementDuplicates
                      .map(([target, olds]) => `${olds.join(', ')} → ${target}`)
                      .join(' · ')}
                    . Leurs statistiques seront cumulées sur ce joueur.
                  </div>
                )}

                {replacement.error && <div className="dv-flash err">{replacement.error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setReplacement(null)}>
                    Plus tard
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={applyReplacement}
                    disabled={
                      !replacement.targetId ||
                      replacement.applying ||
                      replacementConflicts.length > 0
                    }
                  >
                    <Check size={14} />{' '}
                    {replacement.applying ? 'Réaffectation…' : 'Réaffecter les données'}
                  </button>
                </div>
              </>
            ) : (
              <div className="dv-flash err">{replacement.error || 'Aperçu indisponible.'}</div>
            )}
          </div>
        </div>
      )}


      {/* Modale d'importation Feuille de Match FFVB / .dvw / CSV */}
      {showImportModal && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 820, width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={18} /> Importer depuis une Feuille de Match FFVB / .dvw / CSV
              </h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowImportModal(false)}>
                <X size={14} />
              </button>
            </div>

            <p className="dv-hint">
              Chargez un fichier (<strong>.pdf FDME FFVB</strong>, <strong>.dvw DataVolley</strong>, <strong>.csv</strong>) ou collez directement le texte des équipes depuis la feuille de match électronique FFVB. Les numéros de maillot, noms, licences FFVB, capitaines (<code>C</code>) et libéros (<code>L</code>) sont détectés automatiquement.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} /> Choisir un fichier (.pdf, .dvw, .csv, .txt)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.dvw,.csv,.txt"
                style={{ display: 'none' }}
                onChange={handleUploadSheetFile}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setImportRawText(SAMPLE_FFVB_SHEET)}
              >
                Charger un exemple de Feuille FFVB
              </button>
              {importRawText && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setImportRawText('')}
                >
                  Vider
                </button>
              )}
            </div>

            <textarea
              rows={7}
              value={importRawText}
              onChange={(e) => setImportRawText(e.target.value)}
              placeholder={"Collez ici le texte de la feuille de match FFVB ou CSV :\nÉquipe A : ASUL LYON\n01 MARTIN Lucas 1984512 Passeur C\n12 MOREAU Enzo 1894021 L\n..."}
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}
            />

            {parsedPreview.teams.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#fbbf24' }}>
                  Prévisualisation : {parsedPreview.teams.length} équipe(s) détectée(s)
                  {parsedPreview.metadata?.competition ? ` · ${parsedPreview.metadata.competition}` : ''}
                  {parsedPreview.metadata?.date ? ` (${parsedPreview.metadata.date})` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                  {parsedPreview.teams.map((t, idx) => (
                    <div key={idx} className="dv-panel" style={{ margin: 0, padding: 10 }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        {t.name} ({t.players.length} joueurs{t.libero ? ` · Libéro N°${t.libero}` : ''})
                      </div>
                      <table className="dv-table">
                        <thead>
                          <tr>
                            <th>N°</th>
                            <th>Nom</th>
                            <th>Licence</th>
                            <th>Rôle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.players.map((p) => (
                            <tr key={p.number}>
                              <td className="pk-mono">{String(p.number).padStart(2, '0')}</td>
                              <td>
                                {p.name}
                                {p.is_captain ? <span className="dv-badge-cap">C</span> : null}
                                {p.is_libero ? <span className="dv-badge-lib">L</span> : null}
                              </td>
                              <td className="pk-mono">{p.license_number || '—'}</td>
                              <td>{roleLabel(p.role)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={importing || parsedPreview.teams.length === 0}
                onClick={confirmBatchImport}
              >
                <Check size={14} /> {importing ? 'Importation…' : `Importer ${parsedPreview.teams.length} équipe(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamsPage;
