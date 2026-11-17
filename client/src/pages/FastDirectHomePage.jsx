import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  Database,
  Eye,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import AppNavigation from '../components/AppNavigation';
import { liveAPI, teamsAPI } from '../services/api';
import useCollectionChanged from '../hooks/useCollectionChanged';
import '../features/fast-direct/fast-direct.css';

const JOIN_ROLES = [
  {
    id: 'distribution',
    title: 'Prise de distribution',
    text: 'Saisit et corrige les actions du match.',
    icon: Database,
  },
  {
    id: 'viewer',
    title: 'Banc / Coach',
    text: 'Consulte toute la distribution, sans modification.',
    icon: Eye,
  },
  {
    id: 'camera',
    title: 'Caméra',
    text: 'Filme le terrain et diffuse la vidéo aux autres appareils.',
    icon: Camera,
  },
];

/** Accueil du mode Fast Direct : création, reprise et jonction par code. */
export default function FastDirectHomePage({ user, onLogout }) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState('distribution');

  const load = useCallback(async () => {
    try {
      const [teamsRes, liveRes] = await Promise.all([teamsAPI.getAll(), liveAPI.mine()]);
      setTeams(teamsRes.data?.teams || []);
      setSessions(
        (liveRes.data?.sessions || []).filter((session) => session.session_kind === 'fast_direct')
      );
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de charger les sessions Fast Direct.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useCollectionChanged('live', load);

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status !== 'finished'),
    [sessions]
  );

  const createSession = async (event) => {
    event.preventDefault();
    const main = teams.find((team) => String(team.id) === String(team1));
    if (!main && !name.trim()) {
      setError('Choisissez une équipe ou saisissez le nom de la session.');
      return;
    }
    const opponent = teams.find((team) => String(team.id) === String(team2));
    const mainName = main?.name || name.trim() || 'Équipe';
    setCreating(true);
    setError('');
    try {
      const res = await liveAPI.create({
        mode: 'fast_direct',
        name: name.trim() || `Fast Direct · ${mainName}`,
        team1_name: mainName,
        team2_name: opponent?.name || 'Adversaire',
        home_team_id: main?.id || null,
        away_team_id: opponent?.id || null,
      });
      const sessionId = res.data?.id || res.data?.session?.id;
      if (!sessionId) throw new Error('Identifiant de session manquant.');
      navigate(`/fast-direct/${sessionId}`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const joinSession = async (event) => {
    event.preventDefault();
    if (!code.trim()) return;
    setJoining(true);
    setError('');
    try {
      const res = await liveAPI.join({
        join_code: code.trim().toUpperCase(),
        role,
      });
      const sessionId = res.data?.sessionId;
      if (!sessionId) throw new Error('Session introuvable.');
      if (res.data?.session_kind && res.data.session_kind !== 'fast_direct') {
        throw new Error('Ce code correspond à un direct DataVolley, pas à Fast Direct.');
      }
      navigate(`/fast-direct/${sessionId}`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Code introuvable.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fast-direct-root min-h-screen bg-slate-950 text-slate-100">
      <AppNavigation user={user} onLogout={onLogout} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-rose-300">
              <Radio className="h-3.5 w-3.5" /> Session multi-appareils
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">Fast Direct</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Prise de distribution au bord du terrain, banc en lecture seule et caméra sur le même
              code de session, indépendamment du codage DataVolley.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-black text-white hover:bg-rose-500"
          >
            {showCreate ? <ArrowRight className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? 'Masquer la création' : 'Créer un Fast Direct'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2.5 text-xs font-bold text-rose-200">
            {error}
          </div>
        )}

        <div className={`grid gap-4 ${showCreate ? 'lg:grid-cols-2' : ''}`}>
          {showCreate && (
            <form
              onSubmit={createSession}
              className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4"
            >
              <h2 className="text-sm font-black text-white">Héberger sur ce PC</h2>
              <p className="mb-3 text-[11px] text-slate-500">
                Le PC conserve la session et fournit le code aux autres appareils du réseau.
              </p>
              <Field label="Nom de la session">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex. ASUL — match du 17/11"
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-white outline-none focus:border-rose-400"
                />
              </Field>
              <Field label="Équipe analysée (optionnelle)">
                <select
                  value={team1}
                  onChange={(e) => setTeam1(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-white"
                >
                  <option value="">— Sans fiche d’équipe —</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Adversaire (optionnel)">
                <select
                  value={team2}
                  onChange={(e) => setTeam2(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-white"
                >
                  <option value="">— Aucun adversaire précis —</option>
                  {teams
                    .filter((team) => String(team.id) !== String(team1))
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
              </Field>
              <button
                type="submit"
                disabled={creating}
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-xs font-black text-white disabled:opacity-40"
              >
                <Users className="h-4 w-4" />
                {creating ? 'Création…' : 'Démarrer et afficher le code'}
              </button>
              {!teams.length && (
                <p className="mt-2 text-[11px] text-amber-300">
                  Aucune fiche équipe : la session utilisera le nom saisi et les joueurs pourront
                  être renseignés directement dans la prise de distribution.
                </p>
              )}
            </form>
          )}


          <form
            onSubmit={joinSession}
            className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4"
          >
            <h2 className="text-sm font-black text-white">Rejoindre depuis cet appareil</h2>
            <p className="mb-3 text-[11px] text-slate-500">
              Choisissez le rôle exact de l’appareil avant de saisir le code.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {JOIN_ROLES.map((item) => {
                const Icon = item.icon;
                const selected = role === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRole(item.id)}
                    className={`rounded-xl border p-3 text-left ${
                      selected
                        ? 'border-amber-300 bg-amber-400 text-slate-950'
                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    <Icon className="mb-2 h-5 w-5" />
                    <div className="text-xs font-black">{item.title}</div>
                    <div
                      className={`mt-1 text-[10px] font-semibold ${
                        selected ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      {item.text}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                maxLength={8}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-center font-mono text-lg font-black tracking-[0.2em] text-white outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={joining || !code.trim()}
                className="h-11 rounded-xl bg-emerald-500 px-4 text-xs font-black text-slate-950 disabled:opacity-40"
              >
                {joining ? 'Connexion…' : 'Rejoindre'}
              </button>
            </div>
          </form>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-black text-white">Sessions Fast Direct</h2>
            <button
              type="button"
              onClick={load}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-[11px] font-bold text-slate-300"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Actualiser
            </button>
          </div>
          {loading ? (
            <p className="py-6 text-center text-xs text-slate-500">Chargement…</p>
          ) : activeSessions.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Aucune session Fast Direct. Créez la première ou rejoignez-la par son code.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {activeSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => navigate(`/fast-direct/${session.id}`)}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left hover:border-slate-600"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
                    <Radio className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-white">{session.name}</div>
                    <div className="truncate text-[11px] text-slate-400">
                      {session.team1_name} · {session.team2_name}
                    </div>
                  </div>
                  <span className="rounded-lg bg-slate-800 px-2 py-1 font-mono text-xs font-black text-amber-200">
                    {session.join_code}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="mb-2.5 block">
      <span className="mb-1 block text-[11px] font-black text-slate-400">{label}</span>
      {children}
    </label>
  );
}
