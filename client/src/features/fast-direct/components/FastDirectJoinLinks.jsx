import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Eye,
  Link2,
  X,
} from 'lucide-react';
import { systemAPI } from '../../../services/api';

const ROLE_LINKS = [
  {
    id: 'distribution',
    label: 'Prise de distribution',
    description: 'Saisie et correction',
    icon: Database,
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  },
  {
    id: 'viewer',
    label: 'Banc / Coach',
    description: 'Consultation seule',
    icon: Eye,
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  },
  {
    id: 'camera',
    label: 'Caméra',
    description: 'Filmer le terrain',
    icon: Camera,
    tone: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  },
];

function isLoopback(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

/** Choisit l'adresse que les autres appareils du réseau peuvent réellement ouvrir. */
export function resolveInviteBase(currentOrigin, networkUrl) {
  try {
    const current = new URL(currentOrigin);
    if (isLoopback(current.hostname) && networkUrl) {
      const lan = new URL(networkUrl);
      if (lan.hostname && !isLoopback(lan.hostname)) return lan.origin;
    }
    return current.origin;
  } catch {
    return String(networkUrl || currentOrigin || '').replace(/\/+$/, '');
  }
}

export function buildFastDirectInviteUrl(base, joinCode, role) {
  const cleanBase = String(base || 'http://localhost').replace(/\/+$/, '');
  const code = encodeURIComponent(String(joinCode || '').trim().toUpperCase());
  const cleanRole = ['distribution', 'viewer', 'camera'].includes(role) ? role : 'viewer';
  return `${cleanBase}/fast-direct/join/${code}?role=${cleanRole}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Code de session + liens d'invitation par rôle. Le lien contient le code et le
 * rôle : l'appareil n'a donc plus à saisir quoi que ce soit dans l'application.
 */
export default function FastDirectJoinLinks({ session }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let cancelled = false;
    systemAPI
      .getNetworkInfo()
      .then((res) => {
        if (cancelled || typeof window === 'undefined') return;
        setBase(resolveInviteBase(window.location.origin, res.data?.url));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (key, text) => {
    if (await copyToClipboard(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1800);
    }
  };

  const code = String(session?.join_code || '').toUpperCase();
  const links = ROLE_LINKS.map((role) => ({
    ...role,
    url: buildFastDirectInviteUrl(base, code, role.id),
  }));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-3 text-xs font-black text-emerald-100 hover:bg-emerald-500/25"
        title="Afficher le code et les liens pour les autres appareils"
      >
        <Code2 className="h-4 w-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
          Code
        </span>
        <span className="font-mono text-base tracking-[0.16em] text-white">{code || '—'}</span>
        <Link2 className="ml-1 h-3.5 w-3.5 text-emerald-300" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[120] mt-2 w-[min(94vw,640px)] rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
          <div className="mb-2 flex items-center gap-2">
            <div>
              <div className="text-xs font-black text-white">Inviter les autres appareils</div>
              <div className="text-[10px] font-semibold text-slate-400">
                Envoyez le lien correspondant au rôle. Il ouvre et rejoint la session
                automatiquement.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <Code2 className="h-4 w-4 text-emerald-300" />
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
              Code de secours
            </span>
            <strong className="font-mono text-lg tracking-[0.2em] text-white">{code}</strong>
            <button
              type="button"
              onClick={() => copy('code', code)}
              className="ml-auto flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200"
            >
              {copied === 'code' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied === 'code' ? 'Copié' : 'Copier'}
            </button>
          </div>

          <div className="space-y-1.5">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <div
                  key={link.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2 ${link.tone}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="min-w-[120px] flex-1">
                    <div className="text-[11px] font-black">{link.label}</div>
                    <div className="text-[9px] font-semibold opacity-70">{link.description}</div>
                  </div>
                  <input
                    readOnly
                    value={link.url}
                    onFocus={(event) => event.target.select()}
                    className="h-8 min-w-[180px] flex-[2] rounded-lg border border-white/10 bg-slate-950/70 px-2 font-mono text-[9px] text-slate-200 outline-none"
                    aria-label={`Lien ${link.label}`}
                  />
                  <button
                    type="button"
                    onClick={() => copy(link.id, link.url)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-slate-800 px-2 text-[10px] font-black text-white"
                  >
                    {copied === link.id ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copied === link.id ? 'Copié' : 'Copier'}
                  </button>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-8 items-center rounded-lg bg-slate-800 px-2 text-slate-200"
                    title="Ouvrir le lien"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-[9px] font-semibold text-slate-500">
            Adresse utilisée : {base || 'indisponible'} · si le lien ne répond pas, vérifiez que le
            PC hôte et l’appareil sont sur le même réseau Wi‑Fi.
          </p>
        </div>
      )}
    </div>
  );
}
