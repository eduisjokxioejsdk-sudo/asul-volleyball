// ============================================================================
// Saisie DataVolley partagée : clavier virtuel + aide-mémoire des formules.
// Utilisé par le codage vidéo (DataVolleyDashboard) et le codage live.
// ============================================================================

import { useState } from 'react';
import {
  DV_ACTIONS,
  DV_EVALUATIONS,
  DV_EVAL_KEYS,
  DV_TYPES,
  DV_ZONE_GRID,
  DV_ZONE_KEYS,
  DV_SUBZONE_KEYS,
  DV_SERVE_RECEPTION_PAIR,
  DV_ATTACK_COMBO_KEYS,
  DV_SETTER_CALL_KEYS,
  DV_BLOCKER_COUNTS,
  DV_EXTENDED_HIT_TYPES,
  DV_EXTENDED_SPECIALS,
  attackComboInfo,
  setterCallInfo,
  saveCustomAttackCombo,
  deleteCustomAttackCombo,
  getAttackCombos,
  currentInputBlock,
  expectedForBuffer,
  dvTypeKeys,
  zoneLabel,
} from '../utils/datavolley';
import { X, Zap, Plus, Trash2, Settings } from './icons';

/** Clavier virtuel : les touches attendues sont mises en évidence. */
export function DvKeyPad({ buffer, onKey, onBackspace, onClear, onCommit, disabled }) {
  const [showComboEditor, setShowComboEditor] = useState(false);
  const [, setComboTick] = useState(0);
  const [newCombo, setNewCombo] = useState({
    code: '',
    label: '',
    position: 4,
    tempo: '1st',
    side: 'C',
    color: '#f59e0b',
    desc: '',
  });

  const exp = expectedForBuffer(buffer);
  const allowed = new Set((exp.allowed || []).map((c) => c.toUpperCase()));
  const isNext = (k) => allowed.has(k.toUpperCase());

  const keyProps = (value, label, title) => ({
    type: 'button',
    className: `dv-key${isNext(value) ? ' next' : ''}`,
    title: title || value,
    disabled: !!disabled,
    onClick: () => onKey(value),
    children: label ?? value,
  });

  const action = (() => {
    const { text } = currentInputBlock(buffer || '');
    const m = /^([a*])?\d{1,2}([SRABDEF])/i.exec(text);
    return m ? m[2].toUpperCase() : null;
  })();
  const types = action ? dvTypeKeys(action) : [];
  // Combinaisons d'attaque : proposées juste après une action « A » seule.
  const combos = (() => {
    const { text } = currentInputBlock(buffer || '');
    return /^([a*])?\d{1,2}A$/i.test(text) ? DV_ATTACK_COMBO_KEYS : [];
  })();
  // Appels passeur : proposés juste après une action « E » seule.
  const calls = (() => {
    const { text } = currentInputBlock(buffer || '');
    return /^([a*])?\d{1,2}E$/i.test(text) ? DV_SETTER_CALL_KEYS : [];
  })();

  const handleSaveCustomCombo = (e) => {
    e.preventDefault();
    const code = String(newCombo.code || '').trim().toUpperCase();
    if (code.length !== 2) return;
    saveCustomAttackCombo({ ...newCombo, code });
    setNewCombo({ code: '', label: '', position: 4, tempo: '1st', side: 'C', color: '#f59e0b', desc: '' });
    setComboTick((t) => t + 1);
  };

  const handleDeleteCombo = (code) => {
    deleteCustomAttackCombo(code);
    setComboTick((t) => t + 1);
  };

  const allCombos = getAttackCombos();

  return (
    <div>
      <div className="dv-key-pad">
        <button {...keyProps('*', '*', 'Équipe à domicile')} />
        <button {...keyProps('a', 'a', 'Équipe extérieure')} />
        {Array.from({ length: 10 }, (_, d) => (
          <button key={`d${d}`} {...keyProps(String(d), String(d), `Chiffre ${d}`)} />
        ))}
      </div>
      <div className="dv-key-pad">
        {DV_ACTIONS.map((a) => (
          <button key={`act-${a.code}`} {...keyProps(a.code, a.code, `${a.code} — ${a.label} : ${a.desc}`)} />
        ))}
        <button
          type="button"
          className="dv-key"
          style={{ marginLeft: 'auto', fontSize: 10, padding: '0 8px', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.35)' }}
          onClick={() => setShowComboEditor((v) => !v)}
          title="Personnaliser la table des combinaisons d'attaque DataVolley"
        >
          <Settings size={11} /> Combos ({allCombos.length})
        </button>
      </div>
      <div className="dv-key-pad">
        {DV_EVAL_KEYS.map((e) => {
          const info = action ? (DV_EVALUATIONS[action] || []).find((x) => x.sym === e) : null;
          return (
            <button key={`ev-${e}`} {...keyProps(e, e, info ? `${e} — ${info.label} : ${info.desc}` : `Évaluation ${e}`)} />
          );
        })}
        <button {...keyProps('.', '.', 'Combiner service . réception (a04SM.06#) ou attaque . contre (*05V54.12#)')} />
      </div>

      {/* Codes étendus DataVolley 4 (positions 9-14 : après évaluation d'attaque/contre/service) */}
      {exp.hasEvaluation && (action === 'A' || action === 'B' || action === 'S') && (
        <div
          style={{
            marginTop: 6,
            marginBottom: 6,
            padding: '6px 8px',
            background: 'rgba(245, 158, 11, 0.07)',
            border: '1px solid rgba(245, 158, 11, 0.28)',
            borderRadius: 3,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>
            Codes Étendus DataVolley (Post-Évaluation : Contreurs · Frappe · Spécial)
          </div>
          <div className="dv-key-pad" style={{ gap: 4 }}>
            {DV_BLOCKER_COUNTS.map((b) => (
              <button
                key={`blk-${b.code}`}
                {...keyProps(b.code, `${b.code} (${b.short})`, `${b.code} — ${b.label} : ${b.desc}`)}
              />
            ))}
            {DV_EXTENDED_HIT_TYPES.map((h) => (
              <button
                key={`hit-${h.code}`}
                {...keyProps(h.code, `${h.code}·${h.short}`, `Frappe ${h.code} — ${h.label}`)}
              />
            ))}
            {DV_EXTENDED_SPECIALS.map((sp) => (
              <button
                key={`sp-${sp.code}`}
                {...keyProps(sp.code, `${sp.code}·${sp.short}`, `Spécial ${sp.code} — ${sp.label} : ${sp.desc}`)}
              />
            ))}
          </div>
        </div>
      )}

      {types.length > 0 && !exp.hasEvaluation && (
        <div className="dv-key-pad">
          {types.map((t) => {
            const info = (DV_TYPES[action] || []).find((x) => x.sym === t);
            return (
              <button key={`ty-${t}`} {...keyProps(t, t, info ? `Type ${t} — ${info.label} : ${info.desc}` : `Type ${t}`)} />
            );
          })}
        </div>
      )}
      {combos.length > 0 && (
        <div className="dv-key-pad">
          {combos.map((c) => {
            const info = attackComboInfo(c);
            return (
              <button
                key={`combo-${c}`}
                style={info?.color ? { borderLeft: `3px solid ${info.color}` } : undefined}
                {...keyProps(c, c, info ? `${c} — ${info.label} (Z${info.position}) : ${info.desc}` : `Combinaison ${c}`)}
              />
            );
          })}
        </div>
      )}
      {calls.length > 0 && (
        <div className="dv-key-pad">
          {calls.map((k) => {
            const info = setterCallInfo(k);
            return (
              <button
                key={`call-${k}`}
                style={info?.color ? { borderLeft: `3px solid ${info.color}` } : undefined}
                {...keyProps(k, `${k} (${info?.label?.split(' (')[0] || k})`, info ? `${k} — ${info.label} : ${info.desc}` : `Appel ${k}`)}
              />
            );
          })}
        </div>
      )}
      <div className="dv-key-pad">
        {DV_ZONE_KEYS.map((z) => (
          <button key={`z-${z}`} {...keyProps(z, z, `Zone ${zoneLabel(z)}`)} />
        ))}
        {DV_SUBZONE_KEYS.map((s) => (
          <button key={`sz-${s}`} {...keyProps(s, s, `Sous-zone ${s} (après deux zones)`)} />
        ))}
      </div>

      {/* Éditeur de combinaisons d'attaque personnalisées */}
      {showComboEditor && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            background: '#09090b',
            border: '1px solid #27272a',
            borderRadius: 3,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#f59e0b' }}>
              Table des Combinaisons d’Attaque Personnalisées (2 caractères)
            </span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowComboEditor(false)}>
              <X size={12} />
            </button>
          </div>
          <form onSubmit={handleSaveCustomCombo} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 74px 86px 46px auto', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <input
              className="form-input"
              placeholder="Code (X9)"
              maxLength={2}
              value={newCombo.code}
              onChange={(e) => setNewCombo({ ...newCombo, code: e.target.value.toUpperCase() })}
              style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, textTransform: 'uppercase', padding: '4px 6px', fontSize: 12 }}
            />
            <input
              className="form-input"
              placeholder="Nom (ex: Shoot 4, Croix 2...)"
              value={newCombo.label}
              onChange={(e) => setNewCombo({ ...newCombo, label: e.target.value })}
              style={{ padding: '4px 8px', fontSize: 12 }}
            />
            <select
              className="form-input"
              value={newCombo.position}
              onChange={(e) => setNewCombo({ ...newCombo, position: Number(e.target.value) })}
              style={{ padding: '4px 6px', fontSize: 11 }}
              title="Zone de départ"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => (
                <option key={z} value={z}>Zone {z}</option>
              ))}
            </select>
            <select
              className="form-input"
              value={newCombo.tempo}
              onChange={(e) => setNewCombo({ ...newCombo, tempo: e.target.value })}
              style={{ padding: '4px 6px', fontSize: 11 }}
              title="Tempo"
            >
              <option value="1st">1er Tempo</option>
              <option value="2nd">2e Tempo</option>
              <option value="3rd">Balle Haute</option>
            </select>
            <input
              type="color"
              value={newCombo.color}
              onChange={(e) => setNewCombo({ ...newCombo, color: e.target.value })}
              style={{ width: 38, height: 28, padding: 0, border: '1px solid #3f3f46', background: 'transparent', cursor: 'pointer' }}
              title="Couleur de flèche"
            />
            <button type="submit" className="btn btn-primary btn-xs" disabled={String(newCombo.code || '').trim().length !== 2}>
              <Plus size={12} /> Ajouter
            </button>
          </form>
          <div style={{ maxHeight: 150, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 4 }}>
            {allCombos.map((c) => (
              <div
                key={c.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  padding: '4px 7px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderLeft: `3px solid ${c.color || '#f59e0b'}`,
                  borderRadius: 3,
                  fontSize: 11,
                }}
              >
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{c.code}</strong>{' '}
                  <span style={{ color: '#e4e4e7' }}>{c.label}</span>{' '}
                  <small style={{ color: '#71717a', fontFamily: 'var(--font-mono)' }}>Z{c.position}</small>
                </div>
                {c.isCustom && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCombo(c.code)}
                    style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: 2 }}
                    title="Supprimer cette combinaison personnalisée"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dv-key-pad" style={{ marginTop: 8 }}>
        <button className="dv-key wide" type="button" onClick={onBackspace} disabled={disabled} title="Effacer le dernier caractère">
          ⌫ Retour
        </button>
        <button className="dv-key wide" type="button" onClick={onClear} disabled={disabled} title="Vider le tampon">
          <X size={12} /> Vider
        </button>
        <button className="dv-key wide" type="button" onClick={onCommit} disabled={disabled} title="Valider (Entrée)">
          <Zap size={12} /> Valider
        </button>
      </div>
    </div>
  );
}

/** Aide-mémoire : actions, types, évaluations, zones et formule combinée. */
export function DvSyntaxHelp() {
  return (
    <div className="dv-help">
      <div className="dv-help-formula">
        [équipe][n° joueur][action][type?][zones?][évaluation] — ex. *09A4# · a04SM7- · a04SM.06#
      </div>
      <div className="dv-help-grid">
        <div className="dv-help-card">
          <h5>Actions (S R A B D E F)</h5>
          {DV_ACTIONS.map((a) => (
            <div className="dv-help-row" key={a.code}>
              <code>{a.code}</code>
              <span>
                {a.label}
                <br />
                <small>{a.desc}</small>
              </span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Une faute ne se code pas « F » : on met <strong>=</strong> sur l’action fautive (<code>*08S=</code>,{' '}
            <code>a11A=</code>).
          </p>
        </div>

        <div className="dv-help-card">
          <h5>Types de geste (facultatifs)</h5>
          {Object.keys(DV_TYPES).map((act) => (
            <div key={act} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{act}</div>
              {(DV_TYPES[act] || []).map((t) => (
                <div className="dv-help-row" key={t.sym}>
                  <code>{t.sym}</code>
                  <span>
                    {t.label} <small>— {t.desc}</small>
                  </span>
                </div>
              ))}
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Raccourcis service : <code>F</code> = flottante, <code>S</code> = smashée.
          </p>
        </div>

        <div className="dv-help-card">
          <h5>Combinaisons d’attaque (facultatives)</h5>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            Juste après l’action <code>A</code>, ex. <code>*09AX1#</code>. Le code fixe la position
            de l’attaquant (zone de départ) et le type de geste.
          </p>
          {DV_ATTACK_COMBO_KEYS.map((c) => {
            const info = attackComboInfo(c);
            return (
              <div className="dv-help-row" key={c}>
                <code>{c}</code>
                <span>
                  {info.label} <small>— {info.desc} (poste {info.position})</small>
                </span>
              </div>
            );
          })}
        </div>

        <div className="dv-help-card">
          <h5>Évaluations par action</h5>
          {DV_ACTIONS.map((a) => (
            <div key={`ev-${a.code}`} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>
                {a.code} — {a.label}
              </div>
              {(DV_EVALUATIONS[a.code] || []).map((ev) => (
                <div className="dv-help-row" key={ev.sym}>
                  <code>{ev.sym}</code>
                  <span>
                    {ev.label} <small>— {ev.desc}</small>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="dv-help-card">
          <h5>Zones (1 → 9)</h5>
          {DV_ZONE_GRID.map((row, i) => (
            <div key={`zr-${i}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 4 }}>
              {row.map((z) => (
                <span
                  key={z}
                  title={zoneLabel(z)}
                  style={{
                    textAlign: 'center',
                    padding: '4px 0',
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {z}
                </span>
              ))}
            </div>
          ))}
          <small style={{ color: 'var(--text-muted)' }}>Filet en haut. 7/8/9 = bande médiane (autour des 3 m).</small>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            1 chiffre = zone de départ · 2 chiffres = départ + arrivée · au service, 1 chiffre = zone cible.
          </p>
        </div>

        <div className="dv-help-card">
          <h5>Formule combinée service . réception</h5>
          <div className="dv-help-formula" style={{ marginBottom: 6 }}>a04SM.06#</div>
          <small style={{ color: 'var(--text-muted)' }}>
            Service du n°04 extérieur (type M) puis réception du n°06 à domicile évaluée «&nbsp;#&nbsp;». L’évaluation du
            service est déduite automatiquement :
          </small>
          <div style={{ marginTop: 6 }}>
            {Object.keys(DV_SERVE_RECEPTION_PAIR).map((r) => (
              <div className="dv-help-row" key={r}>
                <code>R{r}</code>
                <span>
                  → service <strong>{DV_SERVE_RECEPTION_PAIR[r]}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

