import React, { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, CircleDot, Trash2 } from 'lucide-react';
import {
  computeSetterSheetStats,
  formatDisValue,
  formatEffValue,
  formatSetterLabel,
} from '../utils/scoutingEngine';

const EXCEL_GREEN = '#A8D08D';
const EXCEL_GRAY = '#BFBFBF';
const EXCEL_DARK_GRAY = '#A5A5A5';

function MiniMetricBox({
  title,
  zoneData,
  decimalMode,
  highlightRed = false,
  hidden = false,
}) {
  if (hidden) {
    return (
      <div
        className="h-full border border-transparent"
        style={{ backgroundColor: EXCEL_GREEN }}
      />
    );
  }

  const qVal = zoneData?.q ?? 0;
  const hashVal = zoneData?.hash ?? 0;
  const disStr = formatDisValue(zoneData?.dis ?? null, decimalMode);
  const effStr = formatEffValue(zoneData?.eff ?? null, decimalMode);

  return (
    <div
      className={`relative grid grid-cols-3 text-[10px] leading-tight text-black border border-black/80 ${
        highlightRed ? 'ring-2 ring-red-600 ring-offset-0 rounded-sm z-10' : ''
      }`}
    >
      {/* Row 1: Title */}
      <div
        className="col-span-3 border-b border-black/70 px-1 py-0.5 text-center font-bold tracking-tight truncate"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        {title}
      </div>
      {/* Row 2: Q */}
      <div
        className="border-b border-r border-black/60 px-1 py-0.5 font-semibold"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        Q
      </div>
      <div
        className="col-span-2 border-b border-black/60 px-1 py-0.5 text-center font-bold"
        style={{ backgroundColor: EXCEL_DARK_GRAY }}
      >
        {qVal || ''}
      </div>
      {/* Row 3: Dis */}
      <div
        className="border-b border-r border-black/60 px-1 py-0.5 font-semibold"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        Dis
      </div>
      <div
        className="col-span-2 border-b border-black/60 px-1 py-0.5 text-center font-semibold"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        {disStr}
      </div>
      {/* Row 4: Eff */}
      <div
        className="border-r border-black/60 px-1 py-0.5 font-semibold"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        Eff
      </div>
      <div
        className="border-r border-black/60 px-0.5 py-0.5 text-center font-bold"
        style={{ backgroundColor: EXCEL_DARK_GRAY }}
      >
        {qVal > 0 || hashVal > 0 ? hashVal : ''}
      </div>
      <div
        className="px-0.5 py-0.5 text-center font-semibold"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        {effStr}
      </div>
    </div>
  );
}

function DistributionCourtTable({
  headerTitle,
  centerBadge,
  gridData,
  decimalMode,
  showRedHighlights,
  visibleFrontKeys = ['EN2', 'FIX_ARR', 'FIX_AV', 'DECA', 'EN4'],
  setterMarkerPos = null, // e.g. '1','6','5','9','8A','8','8C','7','2','3A','3','3C','4'
}) {
  const z = gridData.zones;
  const maxDis = useMemo(() => {
    if (!showRedHighlights || gridData.totalActions < 3) return 999;
    return Math.max(
      ...Object.values(z).map((item) => (item.dis !== null ? item.dis : 0))
    );
  }, [z, showRedHighlights, gridData.totalActions]);

  const isTopZone = (key) => {
    if (!showRedHighlights || gridData.totalActions < 3) return false;
    const d = z[key]?.dis ?? 0;
    return d >= 0.3 || (d > 0 && d === maxDis && d >= 0.25);
  };

  return (
    <div
      className="flex flex-col border-2 border-black text-black shadow-md select-none shrink-0"
      style={{ backgroundColor: EXCEL_GREEN, width: '360px' }}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between border-b border-black/50">
        <div
          className="px-2 py-0.5 text-[11px] font-bold"
          style={{ backgroundColor: EXCEL_GRAY }}
        >
          {headerTitle}
        </div>
        {centerBadge && (
          <div className="mr-3 rounded border border-black/40 bg-white/75 px-2 py-0.5 text-[11px] font-black text-black">
            {centerBadge}
          </div>
        )}
      </div>

      {/* Back-row court area with optional P marker (Situations Mini: 1, 6, 5) */}
      <div className="relative px-1.5 pt-2 pb-1.5">
        {['1', '6', '5'].includes(setterMarkerPos) && (
          <div className="mb-1 grid grid-cols-3 text-center">
            <div className="flex justify-center">
              {setterMarkerPos === '1' && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow">
                  P
                </span>
              )}
            </div>
            <div className="flex justify-center">
              {setterMarkerPos === '6' && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow">
                  P
                </span>
              )}
            </div>
            <div className="flex justify-center">
              {setterMarkerPos === '5' && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow">
                  P
                </span>
              )}
            </div>
          </div>
        )}

        {/* Row 8..11: EN 1 | PIPE | autres */}
        <div className="grid grid-cols-5 gap-1">
          <MiniMetricBox
            title="EN 1"
            zoneData={z.EN1}
            decimalMode={decimalMode}
            highlightRed={isTopZone('EN1')}
          />
          <div />
          <MiniMetricBox
            title="PIPE"
            zoneData={z.PIPE}
            decimalMode={decimalMode}
            highlightRed={isTopZone('PIPE')}
          />
          <div />
          <MiniMetricBox
            title="autres"
            zoneData={z.autres}
            decimalMode={decimalMode}
            highlightRed={isTopZone('autres')}
          />
        </div>

        {/* Middle court (3m line) with optional P marker (Situations Moyennes: 9, 8A, 8, 8C, 7) */}
        <div className="my-1.5 grid grid-cols-5 items-center text-center min-h-[16px]">
          {['9', '8A', '8', '8C', '7'].map((pos) => (
            <div key={pos} className="flex justify-center">
              {setterMarkerPos === pos && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-black border border-black shadow">
                  P
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Front court P marker (Bonnes situations: 2, 3A, 3, 3C, 4) */}
        {['2', '3A', '3', '3C', '4'].includes(setterMarkerPos) && (
          <div className="mb-1 grid grid-cols-5 text-center">
            {['2', '3A', '3', '3C', '4'].map((pos) => (
              <div key={pos} className="flex justify-center">
                {setterMarkerPos === pos && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white shadow">
                    P
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Row 14..17: EN 2 | FIX ARR | FIX AV | DECA | EN 4 */}
        <div className="grid grid-cols-5 gap-1 border-b-2 border-black/80 pb-1.5">
          <MiniMetricBox
            title="EN 2"
            zoneData={z.EN2}
            decimalMode={decimalMode}
            highlightRed={isTopZone('EN2')}
            hidden={!visibleFrontKeys.includes('EN2')}
          />
          <MiniMetricBox
            title="FIX ARR"
            zoneData={z.FIX_ARR}
            decimalMode={decimalMode}
            highlightRed={isTopZone('FIX_ARR')}
            hidden={!visibleFrontKeys.includes('FIX_ARR')}
          />
          <MiniMetricBox
            title="FIX AV"
            zoneData={z.FIX_AV}
            decimalMode={decimalMode}
            highlightRed={isTopZone('FIX_AV')}
            hidden={!visibleFrontKeys.includes('FIX_AV')}
          />
          <MiniMetricBox
            title="DECA"
            zoneData={z.DECA}
            decimalMode={decimalMode}
            highlightRed={isTopZone('DECA')}
            hidden={!visibleFrontKeys.includes('DECA')}
          />
          <MiniMetricBox
            title="EN 4"
            zoneData={z.EN4}
            decimalMode={decimalMode}
            highlightRed={isTopZone('EN4')}
            hidden={!visibleFrontKeys.includes('EN4')}
          />
        </div>
      </div>

      {/* Footer Row 18: TOTAL ACTIONS | ACTIONS # | EFF */}
      <div
        className="grid grid-cols-12 items-center border-t border-black text-[10px] font-bold"
        style={{ backgroundColor: EXCEL_GREEN }}
      >
        <div className="col-span-3 px-1.5 py-1 truncate">TOTAL ACTIONS</div>
        <div className="col-span-1 border-x border-black/50 bg-white/40 py-1 text-center font-black">
          {gridData.totalActions}
        </div>
        <div className="col-span-3 px-1.5 py-1 text-right truncate">ACTIONS #</div>
        <div className="col-span-1 border-x border-black/50 bg-white/40 py-1 text-center font-black">
          {gridData.actionsHash}
        </div>
        <div className="col-span-2 px-1 py-1 text-right">EFF</div>
        <div className="col-span-2 border-l border-black/50 bg-white/50 py-1 text-center font-black">
          {formatDisValue(gridData.effGlobal, decimalMode)}
        </div>
      </div>
    </div>
  );
}

function OrgaBaseSubTable({ title, baseData, decimalMode, highlightRed = false }) {
  return (
    <div
      className={`border border-black/80 text-[10px] leading-tight text-black ${
        highlightRed ? 'ring-2 ring-red-600 rounded-sm' : ''
      }`}
    >
      {/* Row 1: BASE X | pctBase */}
      <div
        className="grid grid-cols-5 border-b border-black/70 font-bold"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        <div className="col-span-3 border-r border-black/60 px-1 py-0.5 truncate">{title}</div>
        <div
          className="col-span-2 px-1 py-0.5 text-center"
          style={{ backgroundColor: EXCEL_GREEN }}
        >
          {formatEffValue(baseData.pctBase, decimalMode)}
        </div>
      </div>
      {/* Row 2: Q | q | % # | pctHash */}
      <div
        className="grid grid-cols-5 border-b border-black/70 font-semibold"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        <div className="border-r border-black/60 px-0.5 py-0.5 text-center">Q</div>
        <div
          className="border-r border-black/60 px-0.5 py-0.5 text-center font-bold"
          style={{ backgroundColor: EXCEL_GREEN }}
        >
          {baseData.q}
        </div>
        <div className="col-span-2 border-r border-black/60 px-0.5 py-0.5 text-center">% #</div>
        <div
          className="px-0.5 py-0.5 text-center font-bold"
          style={{ backgroundColor: EXCEL_GREEN }}
        >
          {formatEffValue(baseData.pctHash, decimalMode)}
        </div>
      </div>
      {/* Row 3: 2/1 | C | 4 | PIPE | DIV */}
      <div
        className="grid grid-cols-5 border-b border-black/70 font-bold text-center"
        style={{ backgroundColor: EXCEL_GRAY }}
      >
        {baseData.cols.map((col, idx) => (
          <div
            key={col.key}
            className={`py-0.5 ${idx < 4 ? 'border-r border-black/60' : ''}`}
          >
            {col.label}
          </div>
        ))}
      </div>
      {/* Row 4: Q counts */}
      <div
        className="grid grid-cols-5 border-b border-black/60 text-center font-bold"
        style={{ backgroundColor: EXCEL_DARK_GRAY }}
      >
        {baseData.cols.map((col, idx) => (
          <div
            key={col.key}
            className={`py-0.5 ${idx < 4 ? 'border-r border-black/50' : ''}`}
          >
            {col.q || ''}
          </div>
        ))}
      </div>
      {/* Row 5: # counts */}
      <div
        className="grid grid-cols-5 text-center font-bold"
        style={{ backgroundColor: EXCEL_DARK_GRAY }}
      >
        {baseData.cols.map((col, idx) => (
          <div
            key={col.key}
            className={`py-0.5 ${idx < 4 ? 'border-r border-black/50' : ''}`}
          >
            {col.q > 0 || col.hash > 0 ? col.hash : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgaCourtTable({ rotLabel, orgaData, decimalMode, showRedHighlights }) {
  return (
    <div
      className="flex flex-col border-2 border-black text-black shadow-md select-none shrink-0"
      style={{ backgroundColor: EXCEL_GREEN, width: '360px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/50">
        <div
          className="px-2 py-0.5 text-[11px] font-bold"
          style={{ backgroundColor: EXCEL_GRAY }}
        >
          Organisation offensive
        </div>
        <div className="mr-3 rounded border border-black/40 bg-white/75 px-2 py-0.5 text-[11px] font-black text-black">
          {rotLabel}
        </div>
      </div>

      {/* BASE 0 centered */}
      <div className="px-1.5 pt-2 pb-1">
        <div className="grid grid-cols-3 gap-1 items-end">
          <div className="flex flex-col items-end justify-end pr-1 text-[10px] font-bold leading-tight pb-0.5">
            <span>Q</span>
            <span>#</span>
          </div>
          <OrgaBaseSubTable
            title="BASE 0"
            baseData={orgaData.base0}
            decimalMode={decimalMode}
            highlightRed={showRedHighlights && (orgaData.base0.pctBase ?? 0) >= 0.35}
          />
          <div />
        </div>
      </div>

      {/* BASE 2 | BASE 1 | BASE 7 */}
      <div className="px-1.5 pt-1 pb-1.5 border-b-2 border-black/80">
        <div className="grid grid-cols-3 gap-1">
          <OrgaBaseSubTable
            title="BASE 2"
            baseData={orgaData.base2}
            decimalMode={decimalMode}
            highlightRed={showRedHighlights && (orgaData.base2.pctBase ?? 0) >= 0.35}
          />
          <OrgaBaseSubTable
            title="BASE 1"
            baseData={orgaData.base1}
            decimalMode={decimalMode}
            highlightRed={showRedHighlights && (orgaData.base1.pctBase ?? 0) >= 0.35}
          />
          <OrgaBaseSubTable
            title="BASE 7"
            baseData={orgaData.base7}
            decimalMode={decimalMode}
            highlightRed={showRedHighlights && (orgaData.base7.pctBase ?? 0) >= 0.35}
          />
        </div>
      </div>

      {/* Footer */}
      <div
        className="grid grid-cols-12 items-center border-t border-black text-[10px] font-bold"
        style={{ backgroundColor: EXCEL_GREEN }}
      >
        <div className="col-span-3 px-1.5 py-1 truncate">TOTAL ACTIONS</div>
        <div className="col-span-1 border-x border-black/50 bg-white/40 py-1 text-center font-black">
          {orgaData.totalActions}
        </div>
        <div className="col-span-3 px-1.5 py-1 text-right truncate">ACTIONS #</div>
        <div className="col-span-1 border-x border-black/50 bg-white/40 py-1 text-center font-black">
          {orgaData.actionsHash}
        </div>
        <div className="col-span-2 px-1 py-1 text-right">EFF</div>
        <div className="col-span-2 border-l border-black/50 bg-white/50 py-1 text-center font-black">
          {formatDisValue(orgaData.effGlobal, decimalMode)}
        </div>
      </div>
    </div>
  );
}

export default function SetterAnalysisSheetView({
  sheetConfig,
  filteredRows,
  allMatches,
  allSetters = [],
  onChangeSheetFilter,
  onDeleteSheet,
}) {
  const [decimalMode, setDecimalMode] = useState(false);
  const [showRedHighlights, setShowRedHighlights] = useState(true);
  const [scale, setScale] = useState(0.85);

  const stats = useMemo(() => computeSetterSheetStats(filteredRows), [filteredRows]);

  const rotationKeys = ['P1', 'P6', 'P5', 'P4', 'P3', 'P2'];
  const assignedMatches = sheetConfig.matches || [];
  const includeAll = Boolean(sheetConfig.includeAllMatches);

  const setterBadgeText = useMemo(() => {
    const code = String(sheetConfig.setter || '').trim().toUpperCase();
    if (!code || code === 'ALL') return 'Tous';
    const found = allSetters.find((s) => s.code.toUpperCase() === code);
    return found ? formatSetterLabel(found) : `N° ${code}`;
  }, [sheetConfig.setter, allSetters]);

  const toggleMatchInSheet = (matchName) => {
    if (!onChangeSheetFilter) return;
    const up = matchName.toUpperCase();
    const exists = assignedMatches.some((m) => m.toUpperCase() === up);
    const nextMatches = exists
      ? assignedMatches.filter((m) => m.toUpperCase() !== up)
      : [...assignedMatches, matchName];
    onChangeSheetFilter({ includeAllMatches: false, matches: nextMatches });
  };

  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Barre de contrôle de la feuille */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-black text-emerald-300 border border-emerald-500/40">
              Feuille : {sheetConfig.title}
            </span>
            {sheetConfig.setter && (
              <span className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300">
                Passeur : {setterBadgeText}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-300">
              {stats.totalRows} actions analysées •{' '}
              <strong className="text-white">{stats.band3.GLOBAL.actionsHash}</strong> points (#) •{' '}
              EFF globale :{' '}
              <strong className="text-emerald-300">
                {formatDisValue(stats.band3.GLOBAL.effGlobal, decimalMode)}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Format Excel (% vs Décimal) */}
            <button
              type="button"
              onClick={() => setDecimalMode((d) => !d)}
              className="h-9 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              Format : {decimalMode ? 'Décimal (0.487)' : 'Excel % (48.7%)'}
            </button>

            {/* Toggle Cercles Rouges */}
            <button
              type="button"
              onClick={() => setShowRedHighlights((v) => !v)}
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${
                showRedHighlights
                  ? 'border-red-500/50 bg-red-500/15 text-red-200'
                  : 'border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              <CircleDot className="h-3.5 w-3.5" />
              Repères rouges
            </button>

            {/* Zoom */}
            <div className="flex items-center rounded-xl border border-slate-700 bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.55, Number((s - 0.1).toFixed(2))))}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-700"
                title="Dézoomer"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 text-[11px] font-bold text-slate-300">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(1.15, Number((s + 0.1).toFixed(2))))}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-700"
                title="Zoomer"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>

            {onDeleteSheet && (
              <button
                type="button"
                onClick={() => onDeleteSheet(sheetConfig.id)}
                className="flex h-9 items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-950/40 px-2.5 text-xs font-bold text-rose-300 hover:bg-rose-950/70"
                title="Supprimer cette feuille"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Suppr. feuille
              </button>
            )}
          </div>
        </div>

        {/* Matchs affectés à cette feuille */}
        {onChangeSheetFilter && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-2">
            <span className="text-[11px] font-bold text-slate-400 mr-1">
              Matchs dans cette feuille :
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeSheetFilter({ includeAllMatches: !includeAll })
              }
              className={`h-7 rounded-lg border px-2 text-[11px] font-bold transition ${
                includeAll
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Tous les matchs
            </button>
            {allMatches.map((m) => {
              const selected =
                !includeAll && assignedMatches.some((x) => x.toUpperCase() === m.toUpperCase());
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMatchInSheet(m)}
                  className={`h-7 rounded-lg border px-2 text-[11px] font-bold transition ${
                    selected
                      ? 'border-amber-300 bg-amber-400 text-slate-950'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {m}
                </button>
              );
            })}
            {allMatches.length === 0 && (
              <span className="text-[11px] italic text-slate-500">Aucun match créé pour le moment.</span>
            )}
          </div>
        )}
      </div>

      {/* CONTENEUR EXCEL IDENTIQUE : 7 BANDES HORIZONTALES */}
      <div className="excel-scroll overflow-x-auto rounded-2xl border border-slate-700 bg-white p-4 shadow-xl">
        <div
          className="flex flex-col gap-5 origin-top-left"
          style={{
            transform: `scale(${scale})`,
            width: `${100 / scale}%`,
          }}
        >
          {/* BANDE 1 : Distribution en P1, P6, P5, P4, P3, P2 */}
          <div className="flex gap-3">
            {rotationKeys.map((rot) => (
              <DistributionCourtTable
                key={`b1-${rot}`}
                headerTitle="Distribution en"
                centerBadge={rot}
                gridData={stats.band1[rot]}
                decimalMode={decimalMode}
                showRedHighlights={showRedHighlights}
              />
            ))}
          </div>

          {/* BANDE 2 : Organisation offensive P1, P6, P5, P4, P3, P2 */}
          <div className="flex gap-3">
            {rotationKeys.map((rot) => (
              <OrgaCourtTable
                key={`b2-${rot}`}
                rotLabel={rot}
                orgaData={stats.band2[rot]}
                decimalMode={decimalMode}
                showRedHighlights={showRedHighlights}
              />
            ))}
          </div>

          {/* BANDE 3 : Distribution globale & Annonces du central */}
          <div className="flex gap-3">
            <DistributionCourtTable
              headerTitle="Distribution globale"
              centerBadge="GLOBAL"
              gridData={stats.band3.GLOBAL}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
            />
            <DistributionCourtTable
              headerTitle="annonce du central en fix avant"
              centerBadge="BASE 1"
              gridData={stats.band3.BASE_1}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              visibleFrontKeys={['EN2', 'FIX_AV', 'EN4']}
            />
            <DistributionCourtTable
              headerTitle="annonce du central en fix arrière"
              centerBadge="BASE 2"
              gridData={stats.band3.BASE_2}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              visibleFrontKeys={['EN2', 'FIX_ARR', 'EN4']}
            />
            <DistributionCourtTable
              headerTitle="annonce du central en déca"
              centerBadge="BASE 7"
              gridData={stats.band3.BASE_7}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              visibleFrontKeys={['EN2', 'DECA', 'EN4']}
            />
            <DistributionCourtTable
              headerTitle="pas de fixation possible"
              centerBadge="BASE 0"
              gridData={stats.band3.BASE_0}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              visibleFrontKeys={['EN2', 'EN4']}
            />
          </div>

          {/* BANDE 4 : Zone de réception (Gauche 1 9 2 / Centre 6 8 3 / Droite 5 7 4) */}
          <div className="flex gap-3">
            <DistributionCourtTable
              headerTitle="Distribution quand la réception est à gauche du terrain (1 9 2)"
              gridData={stats.band4.GAUCHE}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
            />
            <DistributionCourtTable
              headerTitle="Distribution quand la réception est faite au centre 6 8 3"
              gridData={stats.band4.CENTRE}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
            />
            <DistributionCourtTable
              headerTitle="Distribution quand la réception est faite depuis la droite 5 7 4"
              gridData={stats.band4.DROITE}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
            />
          </div>

          {/* BANDE 5 : SITUATION MINI Zone de passe en 1, 6, 5 */}
          <div className="flex gap-3">
            <DistributionCourtTable
              headerTitle="SITUATION MINI Zone de passe en 1"
              gridData={stats.band5.Z1}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="1"
            />
            <DistributionCourtTable
              headerTitle="SITUATION MINI Zone de passe en 6"
              gridData={stats.band5.Z6}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="6"
            />
            <DistributionCourtTable
              headerTitle="SITUATION MINI Zone de passe en 5"
              gridData={stats.band5.Z5}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="5"
            />
          </div>

          {/* BANDE 6 : SITUATION MOYENNE Zone de passe en 9, 8 A, 8, 8 C, 7 */}
          <div className="flex gap-3">
            <DistributionCourtTable
              headerTitle="SITUATION MOYENNE Zone de passe en 9"
              gridData={stats.band6.Z9}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="9"
            />
            <DistributionCourtTable
              headerTitle="SITUATION MOYENNE Zone de passe en 8 A"
              gridData={stats.band6.Z8A}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="8A"
            />
            <DistributionCourtTable
              headerTitle="SITUATION MOYENNE Zone de passe en 8"
              gridData={stats.band6.Z8}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="8"
            />
            <DistributionCourtTable
              headerTitle="SITUATION MOYENNE Zone de passe en 8 C"
              gridData={stats.band6.Z8C}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="8C"
            />
            <DistributionCourtTable
              headerTitle="SITUATION MOYENNE Zone de passe en 7"
              gridData={stats.band6.Z7}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="7"
            />
          </div>

          {/* BANDE 7 : BONNE SITUATION Zone de passe en 2, 3A, 3, 3C, 4 */}
          <div className="flex gap-3">
            <DistributionCourtTable
              headerTitle="BONNE SITUATION Zone de passe en 2"
              gridData={stats.band7.Z2}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="2"
            />
            <DistributionCourtTable
              headerTitle="BONNE SITUATION Zone de passe en 3A"
              gridData={stats.band7.Z3A}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="3A"
            />
            <DistributionCourtTable
              headerTitle="BONNE SITUATION Zone de passe en 3"
              gridData={stats.band7.Z3}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="3"
            />
            <DistributionCourtTable
              headerTitle="BONNE SITUATION Zone de passe en 3C"
              gridData={stats.band7.Z3C}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="3C"
            />
            <DistributionCourtTable
              headerTitle="BONNE SITUATION Zone de passe en 4"
              gridData={stats.band7.Z4}
              decimalMode={decimalMode}
              showRedHighlights={showRedHighlights}
              setterMarkerPos="4"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
