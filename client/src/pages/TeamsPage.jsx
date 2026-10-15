import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { teamsAPI } from '../services/api';
import { PLAYER_ROLES, roleColor, roleLabel, roleShort } from '../utils/lineup';
import { ArrowLeft, Check, CircleAlert, Pencil, Plus, RefreshCw, Share2, Trash, Users, X } from '../components/icons';
import useTeamsSync from '../hooks/useTeamsSync';

function TeamsPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const [editing, setEditing] = useState(null); // 'new' ou id
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([]); // [{number, name, role}]
  const [libero, setLibero] = useState('');
  const [liberoFor, setLiberoFor] = useState('');

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

  useEffect(() => { loadTeams(); }, []);

  // ---------------------------------------------------------------------------
  // Partage à distance (synchronisation cloud) : état, envoi manuel, réglages.
  // Le hook recharge aussi la liste quand un autre poste modifie une équipe.
  // ---------------------------------------------------------------------------
  const { status: syncStatus, syncing, error: syncError, syncNow, saveConfig } = useTeamsSync(loadTeams);
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ url: '', key: '', enabled: true });
  const [configMsg, setConfigMsg] = useState(null);

  // Pré-remplit l'URL déjà connue du serveur (la clé n'est jamais renvoyée).
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

  // Résumé lisible de l'état du partage.
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
      }))
    );
    setLibero(t.libero ? String(t.libero) : '');
    setLiberoFor(t.libero_for ? String(t.libero_for) : '');
    setFlash(null);
  };

  const cancel = () => setEditing(null);

  const updatePlayer = (i, field, value) => {
    setPlayers((prev) => prev.map((p, idx) => {
      if (idx !== i) return p;
      if (field === 'number') return { ...p, number: value.replace(/\D/g, '') };
      return { ...p, [field]: value };
    }));
  };

  const addPlayerRow = () => setPlayers((prev) => [...prev, { number: '', name: '', role: 'universal' }]);
  const removePlayerRow = (i) => setPlayers((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { setFlash({ ok: false, text: 'Le nom de l’équipe est requis.' }); return; }
    const cleanPlayers = players
      .filter((p) => (p.name || '').trim() !== '' || (p.number || '').trim() !== '')
      .map((p) => ({
        number: Number(p.number) || 0,
        name: (p.name || '').trim() || `N°${p.number}`,
        role: p.role || 'universal',
      }));
    const settings = { libero: libero || null, liberoFor: liberoFor || null };
    try {
      if (editing === 'new') await teamsAPI.create(name.trim(), cleanPlayers, settings);
      else await teamsAPI.update(editing, name.trim(), cleanPlayers, settings);
      setEditing(null);
      await loadTeams();
      setFlash({ ok: true, text: 'Équipe enregistrée.' });
    } catch (err) {
      console.error('Failed to save team:', err);
      setFlash({ ok: false, text: 'Erreur lors de la sauvegarde.' });
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette équipe ?')) return;
    try {
      await teamsAPI.delete(id);
      await loadTeams();
    } catch (err) {
      console.error('Failed to delete team:', err);
    }
  };

  return (
    <div className="dashboard asul-modern">
      <nav className="navbar">
        <div className="navbar-brand" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => navigate('/dashboard')}>
          <Users size={20} /> Équipes <span>• Analyse Volleyball</span>
        </div>
        <div className="navbar-user">
          <span className="user-info"><span className="user-name">{user?.name}</span></span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={14} /> Retour
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>Déconnexion</button>
        </div>
      </nav>

      <div className="dashboard-content" style={{ maxWidth: 920, margin: '0 auto' }}>
        <div className="mode-selector" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Équipes partagées</h3>
          <button className="btn btn-primary" onClick={startNew}>
            <Plus size={14} /> Nouvelle équipe
          </button>
        </div>

        {/* Partage à distance : état de la synchronisation cloud + réglages */}
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
                title={syncStatus?.enabled ? 'Envoyer et recevoir les équipes maintenant' : 'Activez d’abord le partage'}
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
              <p className="dv-hint" style={{ marginTop: 0 }}>
                Collez l’URL du projet Supabase et sa clé « anon », puis créez la table{' '}
                <code>asul_teams</code> avec le script SQL de <code>SYNC.md</code>. La clé reste
                enregistrée sur ce poste (dossier de données de l’application), jamais dans le
                navigateur.
              </p>
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

        {flash && <div className={`dv-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</div>}

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        ) : teams.length === 0 && editing === null ? (
          <p className="dv-hint">Aucune équipe. Créez une équipe avec sa liste de joueurs (n° + nom).</p>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
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
                <thead><tr><th>N°</th><th>Joueur</th><th>Rôle</th></tr></thead>
                <tbody>
                  {(t.players || []).map((p) => (
                    <tr key={p.id ?? `${p.number}:${p.name}`}>
                      <td>{p.number}</td>
                      <td>{p.name}</td>
                      <td>
                        <span className="report-role" style={{ background: roleColor(p.role || 'universal') }}>
                          {roleShort(p.role || 'universal')}
                        </span>{' '}
                        {roleLabel(p.role || 'universal')}
                      </td>
                    </tr>
                  ))}
                  {(t.players || []).length === 0 && (
                    <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>Aucun joueur</td></tr>
                  )}
                </tbody>
              </table>
            </motion.div>
          ))}
        </div>

        {editing !== null && (
          <motion.div className="dv-panel" style={{ marginTop: 20 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h4 style={{ marginTop: 0 }}>{editing === 'new' ? 'Nouvelle équipe' : 'Modifier l’équipe'}</h4>
            <div className="form-group">
              <label>Nom de l’équipe</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: ASUL Lyon" autoFocus />
            </div>
            <div className="form-group">
              <label>Joueurs (n° + nom + rôle)</label>
              {players.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input type="text" inputMode="numeric" placeholder="N°" value={p.number} onChange={(e) => updatePlayer(i, 'number', e.target.value)} style={{ width: 70 }} />
                  <input type="text" placeholder="Nom" value={p.name} onChange={(e) => updatePlayer(i, 'name', e.target.value)} style={{ flex: 1 }} />
                  <select
                    value={p.role || 'universal'}
                    onChange={(e) => updatePlayer(i, 'role', e.target.value)}
                    style={{ width: 150 }}
                  >
                    {PLAYER_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" title="Retirer ce joueur" onClick={() => removePlayerRow(i)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addPlayerRow}>
                <Plus size={14} /> Ajouter un joueur
              </button>
            </div>
            <div className="form-group">
              <label>Libéro (optionnel)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
      </div>
    </div>
  );
}

export default TeamsPage;
