import React, { useRef, useState } from 'react';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  ShieldCheck,
  Download,
  Upload,
  RotateCcw,
  Copy,
  Check,
  X,
  Smartphone,
  Clock,
  HardDrive,
  Save,
} from 'lucide-react';

function formatFrDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const REASON_BADGE = {
  manual: { text: 'Manuelle', cls: 'bg-sky-500/20 text-sky-200 border-sky-400/40' },
  safety: { text: 'Sécurité', cls: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  auto: { text: 'Auto', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' },
  init: { text: 'Initialisation', cls: 'bg-slate-700 text-slate-200 border-slate-500/40' },
};

export default function CloudBackupModal({
  isOpen,
  onClose,
  cloudStatus, // 'synced' | 'syncing' | 'offline' | 'error'
  cloudMeta, // { revision, updatedAt, updatedByName, lastActionLabel, errorMsg, hasPending }
  stats, // { actions, matches, setters, sheets }
  deviceName,
  onRenameDevice,
  onSyncNow,
  onCreateBackup,
  onRestoreBackup,
  onExportJson,
  onImportJsonFile,
  cloudBackups = [],
  localBackups = [],
}) {
  const [backupLabel, setBackupLabel] = useState('');
  const [deviceDraft, setDeviceDraft] = useState(deviceName || '');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const jsonInputRef = useRef(null);

  if (!isOpen) return null;

  const shareUrl =
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'https://pancake-distribution.vercel.app'
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'https://pancake-distribution.vercel.app';

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSubmitCreateBackup = async (e) => {
    e.preventDefault();
    setIsWorking(true);
    try {
      await onCreateBackup(backupLabel.trim());
      setBackupLabel('');
    } finally {
      setIsWorking(false);
    }
  };

  const handleConfirmRestore = async (bkp) => {
    setIsWorking(true);
    try {
      await onRestoreBackup(bkp);
      setConfirmRestoreId(null);
    } finally {
      setIsWorking(false);
    }
  };

  const renderBackupRow = (bkp, isLocal) => {
    const badge = REASON_BADGE[bkp.reason] || REASON_BADGE.auto;
    const confirming = confirmRestoreId === bkp.id;
    return (
      <div
        key={bkp.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2.5"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-black ${badge.cls}`}
            >
              {badge.text}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                isLocal ? 'bg-slate-800 text-slate-300' : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {isLocal ? (
                <>
                  <HardDrive className="h-2.5 w-2.5" />
                  Local
                </>
              ) : (
                <>
                  <Cloud className="h-2.5 w-2.5" />
                  Cloud
                </>
              )}
            </span>
            <span className="truncate text-xs font-black text-white">{bkp.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatFrDateTime(bkp.createdAt)}
            </span>
            <span>•</span>
            <span>Par {bkp.createdBy || 'Appareil'}</span>
            <span>•</span>
            <span className="font-bold text-slate-200">
              {bkp.actionCount ?? 0} act. / {bkp.matchCount ?? 0} matchs / {bkp.sheetCount ?? 0} feuilles
            </span>
          </div>
        </div>

        <div className="shrink-0">
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-amber-300">Restaurer ?</span>
              <button
                type="button"
                disabled={isWorking}
                onClick={() => handleConfirmRestore(bkp)}
                className="h-8 rounded-lg bg-amber-400 px-2.5 text-[11px] font-black text-slate-950 hover:bg-amber-300 disabled:opacity-50"
              >
                Confirmer
              </button>
              <button
                type="button"
                disabled={isWorking}
                onClick={() => setConfirmRestoreId(null)}
                className="h-8 rounded-lg bg-slate-700 px-2.5 text-[11px] font-bold text-slate-200 hover:bg-slate-600"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isWorking}
              onClick={() => setConfirmRestoreId(bkp.id)}
              className="flex h-8 items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurer
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                Cloud, Collaboration & Sauvegardes Anti-Perte
              </h3>
              <p className="text-xs text-slate-400">
                Stockage en ligne multi-appareils + points de restauration automatiques avant chaque action sensible.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* SECTION 1 : STATUT CLOUD & COLLABORATION */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {cloudStatus === 'offline' || cloudStatus === 'error' ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-xs font-black text-amber-200">
                  <CloudOff className="h-4 w-4" />
                  Hors-ligne — Données protégées localement
                </span>
              ) : cloudStatus === 'syncing' ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/15 px-2.5 py-1 text-xs font-black text-sky-200">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Synchronisation en cours...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-200">
                  <Cloud className="h-4 w-4" />
                  Cloud en ligne synchronisé (v{cloudMeta.revision || 1})
                </span>
              )}

              {cloudMeta.hasPending && (
                <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                  En attente d'envoi
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={isWorking}
              onClick={async () => {
                setIsWorking(true);
                try {
                  await onSyncNow();
                } finally {
                  setIsWorking(false);
                }
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Synchroniser maintenant
            </button>
          </div>

          {cloudMeta.errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {cloudMeta.errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-[11px] text-slate-400">Dernière synchronisation Cloud</div>
              <div className="mt-0.5 font-bold text-white">
                {formatFrDateTime(cloudMeta.updatedAt)}
              </div>
              <div className="text-[11px] text-emerald-300">
                {cloudMeta.updatedByName ? `Par ${cloudMeta.updatedByName}` : ''}
                {cloudMeta.lastActionLabel ? ` • ${cloudMeta.lastActionLabel}` : ''}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="text-[11px] text-slate-400">État actuel protégé</div>
              <div className="mt-0.5 font-black text-white">
                {stats.actions} actions • {stats.matches} matchs
              </div>
              <div className="text-[11px] text-slate-300">
                {stats.setters} passeurs • {stats.sheets} feuilles d'analyse
              </div>
            </div>
          </div>

          {/* Nom d'appareil + Lien multi-appareils */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 pt-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onRenameDevice(deviceDraft);
              }}
              className="flex items-center gap-1.5"
            >
              <Smartphone className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="text"
                value={deviceDraft}
                onChange={(e) => setDeviceDraft(e.target.value)}
                placeholder="Nom de cet appareil..."
                className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-white outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                OK
              </button>
            </form>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={shareUrl}
                aria-label="Lien de collaboration multi-appareils"
                className="h-9 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-xs text-slate-300 outline-none"
              />
              <button
                type="button"
                onClick={handleCopyShareUrl}
                className="flex h-9 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
              >
                {copiedUrl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedUrl ? 'Copié' : 'Copier lien'}
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 2 : CRÉER UNE SAUVEGARDE IMMÉDIATE + EXPORT JSON */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="text-xs font-black uppercase tracking-wide text-emerald-300">
            Créer un point de sauvegarde immédiat
          </div>

          <form onSubmit={handleSubmitCreateBackup} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              placeholder="Nom de la sauvegarde (ex: Fin Set 2 vs SUC, Avant tournoi...)"
              className="h-10 flex-1 min-w-[220px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-white outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              disabled={isWorking}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Sauvegarder maintenant
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onExportJson}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              Télécharger sauvegarde fichier (.json)
            </button>

            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportJsonFile(file);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => jsonInputRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              <Upload className="h-3.5 w-3.5 text-sky-400" />
              Restaurer depuis fichier (.json)
            </button>
          </div>
        </div>

        {/* SECTION 3 : HISTORIQUE DES SAUVEGARDES CLOUD */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-slate-200">
              Historique des sauvegardes Cloud ({cloudBackups.length})
            </span>
            <span className="text-[11px] text-slate-400">
              30 derniers snapshots en ligne conservés
            </span>
          </div>

          {cloudBackups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
              Aucune sauvegarde Cloud enregistrée pour le moment.
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {cloudBackups.map((bkp) => renderBackupRow(bkp, false))}
            </div>
          )}
        </div>

        {/* SECTION 4 : SAUVEGARDES LOCALES DE SECOURS */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-slate-300">
              Sauvegardes locales de secours sur cet appareil ({localBackups.length})
            </span>
            <span className="text-[11px] text-slate-400">
              Utilisable même sans internet
            </span>
          </div>

          {localBackups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
              Aucune sauvegarde locale enregistrée.
            </div>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {localBackups.map((bkp) => renderBackupRow(bkp, true))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-bold text-slate-300 hover:bg-slate-700"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
