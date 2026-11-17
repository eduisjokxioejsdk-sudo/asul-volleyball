import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Database, Eye, Link2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { liveAPI } from '../services/api';
import '../features/fast-direct/fast-direct.css';

const ROLES = {
  distribution: {
    label: 'Prise de distribution',
    description: 'Vous allez saisir et corriger la distribution.',
    icon: Database,
    tone: 'text-emerald-300',
  },
  viewer: {
    label: 'Banc / Coach',
    description: 'Vous allez consulter la session en lecture seule.',
    icon: Eye,
    tone: 'text-amber-300',
  },
  camera: {
    label: 'Caméra',
    description: 'Cet appareil va filmer le terrain.',
    icon: Camera,
    tone: 'text-rose-300',
  },
};

/** Ouvre une invitation Fast Direct et rejoint directement le rôle contenu dans le lien. */
export default function FastDirectJoinPage({ user }) {
  const { joinCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'joining', error: '' });

  const role = ROLES[searchParams.get('role')] ? searchParams.get('role') : 'viewer';
  const code = String(joinCode || '').trim().toUpperCase();
  const invitePath = `/fast-direct/join/${encodeURIComponent(code)}?role=${role}`;
  const roleInfo = ROLES[role];
  const RoleIcon = roleInfo.icon;

  useEffect(() => {
    if (!user || !code) return undefined;
    let cancelled = false;

    liveAPI
      .join({ join_code: code, role })
      .then((res) => {
        if (cancelled) return;
        const sessionId = res.data?.sessionId;
        if (!sessionId) throw new Error('Session introuvable.');
        if (res.data?.session_kind && res.data.session_kind !== 'fast_direct') {
          throw new Error('Ce lien correspond à un direct DataVolley, pas à Fast Direct.');
        }
        navigate(`/fast-direct/${sessionId}`, { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error:
            err?.response?.data?.error ||
            err?.message ||
            'Impossible de rejoindre cette session. Vérifiez que le PC hôte est toujours ouvert.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, code, navigate, role, user]);

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(invitePath)}`} replace />;
  }

  return (
    <div className="fast-direct-root min-h-screen bg-slate-950 text-slate-100">
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-300">
                Invitation Fast Direct
              </div>
              <h1 className="text-xl font-black text-white">
                Rejoindre la session {code || '—'}
              </h1>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
            <RoleIcon className={`h-5 w-5 ${roleInfo.tone}`} />
            <div>
              <div className="text-sm font-black text-white">{roleInfo.label}</div>
              <div className="text-[11px] font-semibold text-slate-400">{roleInfo.description}</div>
            </div>
          </div>

          {state.status === 'joining' ? (
            <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-3 text-xs font-bold text-sky-200">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Connexion automatique à la session…
            </div>
          ) : (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs font-semibold text-rose-200">
              <div className="mb-1 flex items-center gap-1.5 font-black">
                <TriangleAlert className="h-4 w-4" /> Jonction impossible
              </div>
              {state.error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/fast-direct')}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"
            >
              Retour à Fast Direct
            </button>
            {state.status === 'error' && (
              <button
                type="button"
                onClick={() => {
                  setState({ status: 'joining', error: '' });
                  setAttempt((value) => value + 1);
                }}
                className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white"
              >
                Réessayer
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
