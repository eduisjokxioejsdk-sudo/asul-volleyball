import React, { useRef, useState } from 'react';
import { Database, FileJson, HardDriveDownload, Upload, X } from 'lucide-react';
import { SectionCard } from './Ui.jsx';

export default function DataSourcePanel({
  sessions = [],
  dataset = null,
  onImportFile,
  onPickSession,
  onClear,
  error = '',
  busy = false,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    const file = files && files[0];
    if (file) onImportFile(file);
  };

  return (
    <SectionCard
      title="Source des données"
      subtitle="Sauvegarde .json exportée depuis le mode Fast Direct, ou session enregistrée dans ce navigateur."
      right={
        dataset ? (
          <button
            type="button"
            onClick={onClear}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-bold text-rose-200 hover:bg-rose-500/20"
          >
            <X className="h-4 w-4" />
            Fermer les données
          </button>
        ) : null
      }
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragging
              ? 'border-emerald-400 bg-emerald-500/10'
              : 'border-slate-700 bg-slate-950/50 hover:border-emerald-500/60 hover:bg-slate-900'
          }`}
        >
          <FileJson className="h-7 w-7 text-emerald-300" />
          <p className="text-sm font-black text-slate-100">
            Déposer la sauvegarde .json
          </p>
          <p className="text-[11px] text-slate-400">
            ou toucher pour choisir un fichier — Fast Direct → « Sauvegarde JSON »
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <span className="mt-1 flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200">
            <Upload className="h-3.5 w-3.5" />
            Importer un fichier
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Database className="h-4 w-4 text-sky-300" />
            <p className="text-xs font-black uppercase tracking-wider text-slate-300">
              Sessions détectées dans ce navigateur
            </p>
          </div>
          {sessions.length === 0 ? (
            <p className="rounded-xl bg-slate-900 px-3 py-3 text-xs text-slate-500">
              Aucune session Fast Direct dans le stockage local. Sur un autre poste, utilisez la
              sauvegarde .json.
            </p>
          ) : (
            <ul className="flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-1">
              {sessions.map((session) => (
                <li key={session.prefix}>
                  <button
                    type="button"
                    onClick={() => onPickSession(session.prefix)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-2 text-left text-xs hover:border-sky-500/60 hover:bg-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-slate-200">
                        {session.label}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {session.rowCount} action(s)
                        {session.matchCount ? ` • ${session.matchCount} match(s)` : ''}
                      </span>
                    </span>
                    <HardDriveDownload className="h-4 w-4 shrink-0 text-sky-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">
          {error}
        </p>
      )}

      {busy && <p className="mt-3 text-xs text-slate-400">Lecture des données…</p>}

      {dataset && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          <span className="font-black uppercase tracking-wider">Données chargées</span>
          <span className="font-bold">{dataset.meta.label}</span>
          <span className="text-emerald-200/80">
            {dataset.meta.rowCount} action(s) • {dataset.meta.matchCount} match(s)
          </span>
          {dataset.meta.exportedAt && (
            <span className="text-emerald-200/70">
              export du {new Date(dataset.meta.exportedAt).toLocaleString('fr-FR')}
            </span>
          )}
          {dataset.meta.deviceName && (
            <span className="text-emerald-200/70">appareil : {dataset.meta.deviceName}</span>
          )}
        </div>
      )}
    </SectionCard>
  );
}
