import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { liveAPI, teamsAPI } from '../services/api';
import FastDirectStatsShell from '../features/fast-direct/FastDirectStatsShell';
import FastDirectBench from '../features/fast-direct/components/FastDirectBench';
import FastDirectCameraBigView from '../features/fast-direct/components/FastDirectCameraBigView';
import FastDirectCameraPage from '../features/fast-direct/components/FastDirectCameraPage';
import { normalizeFastDirectRole } from '../features/fast-direct/components/FastDirectJoinLinks';
import '../features/fast-direct/fast-direct.css';

export function resolveDeviceMode(memberRole, requestedView) {
  const role = String(memberRole || '').trim().toLowerCase();
  if (role === 'camera') return 'camera';
  const isEditor = ['stats', 'statistician', 'distribution'].includes(role);
  if (isEditor) {
    if (requestedView) return normalizeFastDirectRole(requestedView);
    return 'stats';
  }
  return 'bench';
}

function buildInitialData(session, team) {
  if (!session) return null;
  const roster = Array.isArray(team?.players) ? team.players : [];
  const byRole = (role) => roster.find((player) => player.role === role);
  const roleMap = {
    Passeur: byRole('setter') || byRole('Passeur'),
    Pointu: byRole('opposite') || byRole('Pointu'),
    R4: byRole('outside') || byRole('R4'),
    Central: byRole('middle') || byRole('Central'),
  };
  const lineup = {
    1: { num: '', role: 'Passeur' },
    2: { num: '', role: 'R4' },
    3: { num: '', role: 'Central' },
    4: { num: '', role: 'Pointu' },
    5: { num: '', role: 'R4' },
    6: { num: '', role: 'Central' },
  };
  const order = [
    ['1', 'Passeur'],
    ['2', 'R4'],
    ['3', 'Central'],
    ['4', 'Pointu'],
    ['5', 'R4'],
    ['6', 'Central'],
  ];
  order.forEach(([zone, role]) => {
    const player = roleMap[role];
    if (player) {
      lineup[zone] = { num: String(player.number || ''), role };
    }
  });
  const setters = roster
    .filter((player) => player.role === 'setter' || player.role === 'Passeur')
    .map((player) => ({
      code: String(player.number || ''),
      name: String(player.name || '').toUpperCase(),
    }))
    .filter((player) => player.code);

  return {
    rows: [],
    matchList: session.team1_name ? [session.team1_name] : [],
    setterList: setters,
    sheetConfigs: setters.map((setter) => ({
      id: `SETTER_${setter.code}`,
      title: setter.name || `PASSEUR ${setter.code}`,
      setter: setter.code,
      matches: session.team1_name ? [session.team1_name] : [],
      includeAllMatches: false,
    })),
    teamLineup: lineup,
  };
}

export default function FastDirectPage({ user, onLogout }) {
  const { sessionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHomeTeam(null);
    setAwayTeam(null);
    liveAPI
      .get(sessionId)
      .then(async (res) => {
        if (cancelled) return;
        const session = res.data?.session;
        if (!session) throw new Error('Session introuvable.');
        if (session.session_kind !== 'fast_direct') {
          throw new Error('Ce match est un direct DataVolley. Ouvrez-le depuis le Hub.');
        }
        setData(res.data);
        if (session.home_team_id || session.away_team_id) {
          try {
            const teamsRes = await teamsAPI.getAll();
            if (!cancelled) {
              const allTeams = teamsRes.data?.teams || [];
              if (session.home_team_id) {
                setHomeTeam(
                  allTeams.find((item) => Number(item.id) === Number(session.home_team_id)) || null
                );
              }
              if (session.away_team_id) {
                setAwayTeam(
                  allTeams.find((item) => Number(item.id) === Number(session.away_team_id)) || null
                );
              }
            }
          } catch {
            // Le préremplissage est facultatif : la saisie reste disponible.
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.error || err?.message || 'Session inaccessible.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const initialData = useMemo(
    () => buildInitialData(data?.session, homeTeam),
    [data?.session, homeTeam]
  );

  if (loading) {
    return (
      <div className="fast-direct-root flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Chargement de la session Fast Direct…
      </div>
    );
  }

  if (error || !data?.session) {
    return (
      <div className="fast-direct-root flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center">
        <p className="text-sm font-bold text-rose-300">{error || 'Session introuvable.'}</p>
        <button
          type="button"
          onClick={() => navigate('/fast-direct')}
          className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-black text-white"
        >
          Retour à Fast Direct
        </button>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const { session, me } = data;
  const memberRole = me?.role || 'bench';
  const isEditor = ['stats', 'statistician', 'distribution'].includes(memberRole);
  const requestedView = String(searchParams.get('view') || '').trim().toLowerCase();

  // Caméra en grand dans son propre onglet (bouton « Caméra » du Banc).
  if (requestedView === 'camera-live') {
    return <FastDirectCameraBigView session={session} />;
  }

  const deviceMode = resolveDeviceMode(memberRole, searchParams.get('view'));

  if (deviceMode === 'camera') {
    return <FastDirectCameraPage session={session} />;
  }

  if (deviceMode === 'bench') {
    return (
      <FastDirectBench
        session={session}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        canSwitchToStats={isEditor}
        onSwitchToStats={() => setSearchParams({ view: 'stats' })}
      />
    );
  }

  return (
    <FastDirectStatsShell
      session={session}
      user={user}
      initialData={initialData}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      onLogout={onLogout}
    />
  );
}
