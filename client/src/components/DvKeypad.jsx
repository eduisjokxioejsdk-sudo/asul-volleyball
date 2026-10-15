// ============================================================================
// Saisie DataVolley partagée : clavier virtuel + aide-mémoire des formules.
// Utilisé par le codage vidéo (DataVolleyDashboard) et le codage live.
// ============================================================================

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
  attackComboInfo,
  setterCallInfo,
  currentInputBlock,
  expectedForBuffer,
  dvTypeKeys,
  zoneLabel,
} from '../utils/datavolley';
import { X, Zap } from './icons';

/** Clavier virtuel : les touches attendues sont mises en évidence. */
export function DvKeyPad({ buffer, onKey, onBackspace, onClear, onCommit, disabled }) {
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
    const m = /^[a*]\d{1,2}([SRABDEF])/.exec(text);
    return m ? m[1] : null;
  })();
  const types = action ? dvTypeKeys(action) : [];
  // Combinaisons d'attaque : proposées juste après une action « A » seule.
  const combos = (() => {
    const { text } = currentInputBlock(buffer || '');
    return /^[a*]\d{1,2}A$/.test(text) ? DV_ATTACK_COMBO_KEYS : [];
  })();
  // Appels passeur : proposés juste après une action « E » seule.
  const calls = (() => {
    const { text } = currentInputBlock(buffer || '');
    return /^[a*]\d{1,2}E$/.test(text) ? DV_SETTER_CALL_KEYS : [];
  })();

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
      </div>
      <div className="dv-key-pad">
        {DV_EVAL_KEYS.map((e) => {
          const info = action ? (DV_EVALUATIONS[action] || []).find((x) => x.sym === e) : null;
          return (
            <button key={`ev-${e}`} {...keyProps(e, e, info ? `${e} — ${info.label} : ${info.desc}` : `Évaluation ${e}`)} />
          );
        })}
        <button {...keyProps('.', '.', 'Combiner service . réception — ex. a04SM.06#')} />
      </div>
      {types.length > 0 && (
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
                {...keyProps(c, c, info ? `${c} — ${info.label} : ${info.desc}` : `Combinaison ${c}`)}
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
                {...keyProps(k, k, info ? `${k} — ${info.label} : ${info.desc}` : `Appel ${k}`)}
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

