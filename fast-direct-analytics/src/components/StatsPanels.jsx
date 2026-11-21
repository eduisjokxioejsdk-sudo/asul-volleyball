import React from 'react';
import { BarList, SectionCard, StatCard, Table } from './Ui.jsx';
import {
  QUALITE_R_OPTIONS,
  ZONE_R_LAYOUT,
  formatInt,
  formatPct,
} from '../utils/statsEngine.js';

export function OverviewPanel({ stats }) {
  const { overview, distribution, reception, attackResults } = stats;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Actions" value={formatInt(overview.totalActions)} hint="saisies filtrées" />
        <StatCard label="Matchs" value={formatInt(overview.matchCount)} tone="sky" />
        <StatCard
          label="Récep. positives"
          value={formatPct(overview.receptionPositiveRate)}
          hint="% # et +"
          tone="teal"
        />
        <StatCard
          label="Distribution dominante"
          value={overview.topZone ? overview.topZone.label : '—'}
          hint={overview.topZone ? `${overview.topZone.count} ballons` : 'aucune donnée'}
          tone="purple"
        />
        <StatCard
          label="Attaquant le + utilisé"
          value={overview.topPlayer ? `#${overview.topPlayer.player}` : '—'}
          hint={overview.topPlayer ? `${overview.topPlayer.actions} ballons` : 'aucune donnée'}
          tone="amber"
        />
        <StatCard
          label="Points (#)"
          value={formatInt(overview.points)}
          hint={`${formatPct(overview.attackRate)} des actions`}
          tone="orange"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Distribution par zone cible"
          subtitle="Q = ballons distribués, Dis = part du total (mêmes définitions que la feuille passeur)."
        >
          <BarList
            items={distribution.zones
              .filter((zone) => zone.count > 0)
              .map((zone) => ({
                key: zone.key,
                label: zone.label,
                value: formatInt(zone.count),
                share: zone.share,
                tone: 'emerald',
                hint: zone.efficiency !== null ? `Eff. ${formatPct(zone.efficiency)}` : undefined,
              }))}
            emptyLabel="Aucune distribution enregistrée"
          />
        </SectionCard>

        <SectionCard
          title="Qualité de réception"
          subtitle="Répartition des réceptions sur les actions filtrées."
        >
          <BarList
            items={reception.quality
              .filter((quality) => quality.count > 0)
              .map((quality) => ({
                key: quality.code,
                label: `${quality.code} — ${quality.label}`,
                value: formatInt(quality.count),
                share: quality.share,
                tone: quality.tone,
              }))}
            emptyLabel="Aucune réception enregistrée"
          />
        </SectionCard>

        <SectionCard
          title="Annonces du central (BASE OFF)"
          subtitle="Fixation annoncée avant la distribution."
        >
          <BarList
            items={distribution.baseOff.map((base) => ({
              key: base.code,
              label: base.label,
              value: formatInt(base.count),
              share: base.share,
              tone: 'sky',
            }))}
            emptyLabel="Aucune annonce enregistrée"
          />
        </SectionCard>

        <SectionCard
          title="Résultats d'attaque enregistrés"
          subtitle="Le mode Fast Direct enregistre automatiquement « - » ; les anciennes données restent analysables."
        >
          <BarList
            items={attackResults.map((result) => ({
              key: result.code,
              label: `Résultat « ${result.code || '—'} »`,
              value: formatInt(result.count),
              share: result.share,
              tone: result.code === '#' ? 'emerald' : result.code === 'Err' ? 'red' : 'slate',
            }))}
            emptyLabel="Aucun résultat d'attaque"
          />
        </SectionCard>
      </div>
    </div>
  );
}

export function ReceptionPanel({ reception }) {
  const total = reception.total;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="Réceptions" value={formatInt(total)} />
        <StatCard label="Parfaites (#)" value={formatPct(reception.perfectRate)} tone="emerald" />
        <StatCard label="Positives (+ et #)" value={formatPct(reception.positiveRate)} tone="teal" />
        <StatCard label="Erreurs (Err)" value={formatPct(reception.errorRate)} tone="red" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Zones de réception"
          subtitle="Camp vu depuis notre côté : haut = filet. Taille = volume reçu."
        >
          <div className="mx-auto flex w-full max-w-sm flex-col gap-1.5">
            <p className="text-center text-[10px] font-black uppercase tracking-wider text-slate-500">
              Filet
            </p>
            {ZONE_R_LAYOUT.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-3 gap-1.5">
                {row.map((code) => {
                  const zone = reception.zones.find((item) => item.code === code);
                  const share = zone?.share ?? 0;
                  const alpha = Math.min(0.9, 0.12 + share * 2.2);
                  return (
                    <div
                      key={code}
                      className="rounded-xl border border-emerald-500/30 px-1 py-2 text-center"
                      style={{ backgroundColor: `rgba(16, 185, 129, ${alpha})` }}
                    >
                      <p className="text-[11px] font-black text-emerald-50">Zone {code}</p>
                      <p className="text-lg font-black leading-tight text-white">
                        {formatInt(zone?.count ?? 0)}
                      </p>
                      <p className="text-[10px] font-bold text-emerald-50/80">
                        {(share * 100).toFixed(1)} %
                      </p>
                      {zone && zone.count > 0 && (
                        <p className="text-[9px] text-emerald-50/70">
                          + {formatPct(zone.goodRate, 0)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <p className="mt-1 text-center text-[10px] text-slate-500">
              Haut : avant (4 • 3 • 2) — milieu : 3 mètres (7 • 8 • 9) — bas : fond (5 • 6 • 1)
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Qualité de réception" subtitle="Détail des codes saisis.">
          <BarList
            items={reception.quality
              .filter((quality) => quality.count > 0)
              .map((quality) => ({
                key: quality.code,
                label: `${quality.code} — ${quality.label}`,
                value: formatInt(quality.count),
                share: quality.share,
                tone: quality.tone,
              }))}
            emptyLabel="Aucune réception enregistrée"
          />
        </SectionCard>

        <SectionCard title="Zones de passe" subtitle="① réception → ② zone où le passeur joue le ballon.">
          <BarList
            items={reception.passeZones.map((zone) => ({
              key: zone.code,
              label: `Zone ${zone.code}`,
              value: formatInt(zone.count),
              share: zone.share,
              tone: 'sky',
            }))}
            emptyLabel="Aucune zone de passe enregistrée"
          />
        </SectionCard>

        <SectionCard title="Réception par passeur" subtitle="Qualité des réceptions par rotation de passeur.">
          <Table head={['Passeur', 'Réceptions', 'Positives', 'Parfaites']}>
            {reception.bySetter.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2.5 py-3 text-center text-slate-500">
                  Aucune donnée
                </td>
              </tr>
            )}
            {reception.bySetter.map((row) => (
              <tr key={row.setter} className="text-slate-200">
                <td className="px-2.5 py-1.5 font-black">#{row.setter}</td>
                <td className="px-2.5 py-1.5">{formatInt(row.receptions)}</td>
                <td className="px-2.5 py-1.5 font-bold text-teal-300">
                  {formatPct(row.positiveRate)}
                </td>
                <td className="px-2.5 py-1.5 font-bold text-emerald-300">
                  {formatPct(row.perfectRate)}
                </td>
              </tr>
            ))}
          </Table>
        </SectionCard>
      </div>

      <SectionCard
        title="Matrice zones × qualité"
        subtitle="Nombre de réceptions par zone et par code de qualité."
      >
        <Table head={['Zone', ...QUALITE_R_OPTIONS.map((q) => q.label), 'Total']}>
          {ZONE_R_LAYOUT.flat().map((code) => {
            const quality = reception.matrix[code] || {};
            const totalZone = Object.values(quality).reduce((sum, value) => sum + value, 0);
            return (
              <tr key={code} className="text-slate-200">
                <td className="px-2.5 py-1.5 font-black">Zone {code}</td>
                {QUALITE_R_OPTIONS.map((q) => (
                  <td key={q.code} className="px-2.5 py-1.5">
                    {quality[q.code] || <span className="text-slate-600">0</span>}
                  </td>
                ))}
                <td className="px-2.5 py-1.5 font-black text-emerald-300">{totalZone}</td>
              </tr>
            );
          })}
        </Table>
      </SectionCard>
    </div>
  );
}


export function DistributionPanel({ distribution }) {
  const topZone = distribution.zones.slice().sort((a, b) => b.count - a.count)[0];
  const points = distribution.zones.reduce((sum, zone) => sum + zone.points, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="Distributions" value={formatInt(distribution.total)} />
        <StatCard
          label="Zone dominante"
          value={topZone && topZone.count > 0 ? topZone.label : '—'}
          hint={topZone && topZone.count > 0 ? formatPct(topZone.share) : 'aucune donnée'}
          tone="purple"
        />
        <StatCard label="Codes utilisés" value={formatInt(distribution.codes.length)} tone="sky" />
        <StatCard
          label="Points (#)"
          value={formatInt(points)}
          hint={formatPct(distribution.total > 0 ? points / distribution.total : null)}
          tone="emerald"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Répartition par zone cible"
          subtitle="8 zones des tableaux d'analyse (mêmes clés que la feuille passeur)."
        >
          <BarList
            items={distribution.zones.map((zone) => ({
              key: zone.key,
              label: zone.label,
              value: formatInt(zone.count),
              share: zone.share,
              tone: 'emerald',
              hint:
                zone.count > 0
                  ? `${zone.points} point(s) — eff. ${formatPct(zone.efficiency)}`
                  : undefined,
            }))}
            emptyLabel="Aucune distribution enregistrée"
          />
        </SectionCard>

        <SectionCard title="Détail par code de distribution" subtitle="5, 9, 4, 7, 1, 1C, 3, 2, 6, 8, 10, PM.">
          <Table head={['Code', 'Cible', 'Ballons', 'Part', 'Points']}>
            {distribution.codes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2.5 py-3 text-center text-slate-500">
                  Aucune donnée
                </td>
              </tr>
            )}
            {distribution.codes.map((row) => (
              <tr key={row.code} className="text-slate-200">
                <td className="px-2.5 py-1.5 font-black text-emerald-300">{row.code}</td>
                <td className="px-2.5 py-1.5">{row.label}</td>
                <td className="px-2.5 py-1.5">{formatInt(row.count)}</td>
                <td className="px-2.5 py-1.5 font-bold">{formatPct(row.share)}</td>
                <td className="px-2.5 py-1.5">{row.points}</td>
              </tr>
            ))}
          </Table>
        </SectionCard>

        <SectionCard title="Distribution par rotation" subtitle="Rotation = zone du passeur (P1 → P2).">
          <Table head={['Rotation', 'Ballons', 'Zone dominante', 'Part']}>
            {distribution.rotations.map((row) => (
              <tr key={row.rotation} className="text-slate-200">
                <td className="px-2.5 py-1.5 font-black text-sky-300">P{row.rotation}</td>
                <td className="px-2.5 py-1.5">{formatInt(row.actions)}</td>
                <td className="px-2.5 py-1.5 font-bold">{row.topZoneLabel}</td>
                <td className="px-2.5 py-1.5">{formatPct(row.topShare)}</td>
              </tr>
            ))}
          </Table>
        </SectionCard>

        <SectionCard title="Distribution par passeur" subtitle="Volume et cible préférentielle de chaque passeur.">
          <Table head={['Passeur', 'Ballons', 'Zone dominante', 'Part']}>
            {distribution.bySetter.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2.5 py-3 text-center text-slate-500">
                  Aucune donnée
                </td>
              </tr>
            )}
            {distribution.bySetter.map((row) => (
              <tr key={row.setter} className="text-slate-200">
                <td className="px-2.5 py-1.5 font-black">#{row.setter}</td>
                <td className="px-2.5 py-1.5">{formatInt(row.actions)}</td>
                <td className="px-2.5 py-1.5 font-bold">{row.topZoneLabel}</td>
                <td className="px-2.5 py-1.5">{formatPct(row.topShare)}</td>
              </tr>
            ))}
          </Table>
        </SectionCard>
      </div>

      <SectionCard
        title="Annonces du central (BASE OFF)"
        subtitle="Répartition des fixations annoncées avant le choix de distribution."
      >
        <BarList
          items={distribution.baseOff.map((base) => ({
            key: base.code,
            label: base.label,
            value: formatInt(base.count),
            share: base.share,
            tone: 'sky',
          }))}
          emptyLabel="Aucune annonce enregistrée"
        />
      </SectionCard>
    </div>
  );
}


export function PlayersPanel({ players, distribution }) {
  const points = players.reduce((sum, player) => sum + player.points, 0);
  const totalActions = players.reduce((sum, player) => sum + player.actions, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="Attaquants utilisés" value={formatInt(players.length)} tone="purple" />
        <StatCard
          label="Plus sollicité"
          value={players[0] ? `#${players[0].player}` : '—'}
          hint={players[0] ? `${players[0].actions} ballons` : 'aucune donnée'}
          tone="amber"
        />
        <StatCard
          label="Points (#)"
          value={formatInt(points)}
          hint={formatPct(totalActions > 0 ? points / totalActions : null)}
          tone="emerald"
        />
        <StatCard label="Zones cibles utilisées" value={formatInt(distribution.codes.length)} tone="sky" />
      </div>

      <SectionCard
        title="Utilisation des attaquants"
        subtitle="Le numéro est déterminé automatiquement par la rotation et la zone de distribution."
      >
        <Table head={['Joueur', 'Ballons', 'Part', 'Zone forte', 'Part zone', 'Points', 'Eff.']}>
          {players.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2.5 py-3 text-center text-slate-500">
                Aucune donnée
              </td>
            </tr>
          )}
          {players.map((player) => (
            <tr key={player.player} className="text-slate-200">
              <td className="px-2.5 py-1.5 font-black text-purple-200">#{player.player}</td>
              <td className="px-2.5 py-1.5">{formatInt(player.actions)}</td>
              <td className="px-2.5 py-1.5">{formatPct(player.share)}</td>
              <td className="px-2.5 py-1.5 font-bold">{player.topZoneLabel}</td>
              <td className="px-2.5 py-1.5">{formatPct(player.topShare)}</td>
              <td className="px-2.5 py-1.5">{formatInt(player.points)}</td>
              <td className="px-2.5 py-1.5 font-bold text-emerald-300">
                {formatPct(player.efficiency)}
              </td>
            </tr>
          ))}
        </Table>
      </SectionCard>

      <SectionCard
        title="Détail par attaquant et zone cible"
        subtitle="Nombre de ballons reçus par joueur dans chaque zone de distribution."
      >
        <Table head={['Joueur', ...distribution.zones.map((zone) => zone.label), 'Total']}>
          {players.length === 0 && (
            <tr>
              <td colSpan={distribution.zones.length + 2} className="px-2.5 py-3 text-center text-slate-500">
                Aucune donnée
              </td>
            </tr>
          )}
          {players.map((player) => (
            <tr key={player.player} className="text-slate-200">
              <td className="px-2.5 py-1.5 font-black text-purple-200">#{player.player}</td>
              {distribution.zones.map((zone) => (
                <td key={zone.key} className="px-2.5 py-1.5">
                  {player.byZone[zone.key] || <span className="text-slate-600">0</span>}
                </td>
              ))}
              <td className="px-2.5 py-1.5 font-black text-emerald-300">{player.actions}</td>
            </tr>
          ))}
        </Table>
      </SectionCard>
    </div>
  );
}


export function MatchesPanel({ matches }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <StatCard label="Matchs" value={formatInt(matches.length)} tone="sky" />
        <StatCard label="Actions cumulées" value={formatInt(matches.reduce((s, m) => s + m.actions, 0))} />
        <StatCard
          label="Meilleure réception"
          value={
            matches.length > 0
              ? matches
                  .slice()
                  .sort((a, b) => (b.positiveRate ?? -1) - (a.positiveRate ?? -1))[0].match
              : '—'
          }
          hint={
            matches.length > 0
              ? formatPct(
                  matches.slice().sort((a, b) => (b.positiveRate ?? -1) - (a.positiveRate ?? -1))[0]
                    .positiveRate
                )
              : undefined
          }
          tone="teal"
        />
      </div>

      <SectionCard title="Synthèse par match" subtitle="Volume, rotations, passeurs et cible dominante.">
        <Table head={['Match', 'Actions', 'Rotations', 'Passeurs', 'Récep. +', 'Zone dominante', 'Part']}>
          {matches.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2.5 py-3 text-center text-slate-500">
                Aucune donnée
              </td>
            </tr>
          )}
          {matches.map((row) => (
            <tr key={row.match} className="text-slate-200">
              <td className="px-2.5 py-1.5 font-black text-slate-100">{row.match}</td>
              <td className="px-2.5 py-1.5">{formatInt(row.actions)}</td>
              <td className="px-2.5 py-1.5">{row.rotations}</td>
              <td className="px-2.5 py-1.5">{row.setters || '—'}</td>
              <td className="px-2.5 py-1.5 font-bold text-teal-300">{formatPct(row.positiveRate)}</td>
              <td className="px-2.5 py-1.5 font-bold">{row.topZoneLabel}</td>
              <td className="px-2.5 py-1.5">{formatPct(row.topShare)}</td>
            </tr>
          ))}
        </Table>
      </SectionCard>

      {matches.length > 1 && (
        <SectionCard
          title="Comparaison des matchs"
          subtitle="Part de chaque match dans le volume total d'actions."
        >
          <BarList
            items={matches.map((row) => {
              const total = matches.reduce((sum, match) => sum + match.actions, 0);
              return {
                key: row.match,
                label: row.match,
                value: formatInt(row.actions),
                share: total > 0 ? row.actions / total : 0,
                tone: 'sky',
                hint: `${row.rotations} rotation(s) • ${row.setters || 'passeur non renseigné'}`,
              };
            })}
          />
        </SectionCard>
      )}
    </div>
  );
}

export function CombosPanel({ combos }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionCard
        title="Combinaisons les plus utilisées"
        subtitle="Réception (zone + qualité) → zone de passe → cible de distribution."
      >
        <BarList
          items={combos.map((combo) => ({
            key: combo.label,
            label: combo.label,
            value: formatInt(combo.count),
            share: combo.share,
            tone: 'purple',
          }))}
          emptyLabel="Aucune combinaison enregistrée"
        />
      </SectionCard>

      <SectionCard title="Détail des combinaisons" subtitle="Top 15 des enchaînements observés.">
        <Table head={['Réception → Passe → Distribution', 'Occurrences', 'Part']}>
          {combos.length === 0 && (
            <tr>
              <td colSpan={3} className="px-2.5 py-3 text-center text-slate-500">
                Aucune donnée
              </td>
            </tr>
          )}
          {combos.map((combo) => (
            <tr key={combo.label} className="text-slate-200">
              <td className="px-2.5 py-1.5 font-bold">{combo.label}</td>
              <td className="px-2.5 py-1.5">{formatInt(combo.count)}</td>
              <td className="px-2.5 py-1.5">{formatPct(combo.share)}</td>
            </tr>
          ))}
        </Table>
      </SectionCard>
    </div>
  );
}
