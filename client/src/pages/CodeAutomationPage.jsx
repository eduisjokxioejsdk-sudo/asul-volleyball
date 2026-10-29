// ============================================================================
// PAGE SPÉCIALE DE CONFIGURATION & D'EXPLICATION DES CODES AUTOMATIQUES
// ET MACROS CLAVIER (Points 10 & 11 — /datavolley/auto-codes)
// ============================================================================

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getAutoCodesConfig,
  saveAutoCodesConfig,
  resetAutoCodesConfig,
  getKeyboardMacros,
  saveKeyboardMacros,
  simulateCompoundExpansion,
  DEFAULT_KEYBOARD_MACROS,
} from '../utils/compoundCodes';
import { DV_EVAL_KEYS, describeCode } from '../utils/datavolley';
import KeyboardRemapModal from '../components/KeyboardRemapModal';

const SANDBOX_EXAMPLES = [
  {
    label: 'Service Smashé + Réception Parfaite (a04SM5.06#)',
    input: 'a04SM5.06#*09AX14#',
    desc: 'Une seule frappe avec le point « . » génère le service avec évaluation opposée (-), la réception (#), la passe automatique du passeur (*07E#) et l’attaque 1er temps (*09AX14#).',
  },
  {
    label: 'Attaque Contrée Gagnante (*05AV56.12#)',
    input: 'a04SQ6.10+*05AV56.12#',
    desc: 'L’attaque en V5 vers la zone 6 suivie de « .12# » indique que le contreur adverse n°12 réalise un block gagnant (#) : l’attaque reçoit automatiquement « / » (contrée).',
  },
  {
    label: 'Attaque Défendue + Contre-attaque (*11AX61.08D+)',
    input: '*11AX61.08D+a14AV55#',
    desc: 'L’ajout de la lettre « D » après le point (« .08D+ ») génère une Défense positive (+) du n°08 adverse et qualifie automatiquement l’attaque de négative (-).',
  },
];

export default function CodeAutomationPage() {
  const [config, setConfig] = useState(() => getAutoCodesConfig());
  const [macros, setMacros] = useState(() => getKeyboardMacros());
  const [sandboxInput, setSandboxInput] = useState('a04SM5.06#*09AX14#');
  const [homeSetter, setHomeSetter] = useState(7);
  const [awaySetter, setAwaySetter] = useState(2);
  const [savedNotice, setSavedNotice] = useState('');
  const [newMacro, setNewMacro] = useState({ shortcut: '', label: '', snippet: '', category: 'Attaque' });

  const notify = (msg) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(''), 2800);
  };

  const updateConfig = (patch) => {
    const next = saveAutoCodesConfig({ ...config, ...patch });
    setConfig(next);
    notify('Configuration des codes automatiques enregistrée');
  };

  const updateMatrixCell = (tableKey, sourceEval, targetEval) => {
    const updatedTable = { ...(config[tableKey] || {}), [sourceEval]: targetEval };
    updateConfig({ [tableKey]: updatedTable });
  };

  const handleReset = () => {
    const fresh = resetAutoCodesConfig();
    setConfig(fresh);
    const freshMacros = saveKeyboardMacros(DEFAULT_KEYBOARD_MACROS);
    setMacros(freshMacros);
    notify('Paramètres réinitialisés au standard officiel DataVolley 4');
  };

  const handleAddMacro = (e) => {
    e.preventDefault();
    if (!newMacro.shortcut.trim() || !newMacro.snippet.trim()) return;
    const item = {
      id: `m_${Date.now()}`,
      shortcut: newMacro.shortcut.trim(),
      label: newMacro.label.trim() || `Macro ${newMacro.snippet}`,
      snippet: newMacro.snippet.trim(),
      category: newMacro.category || 'Personnalisé',
    };
    const next = saveKeyboardMacros([...macros, item]);
    setMacros(next);
    setNewMacro({ shortcut: '', label: '', snippet: '', category: 'Attaque' });
    notify('Macro clavier ajoutée');
  };

  const handleDeleteMacro = (id) => {
    const next = saveKeyboardMacros(macros.filter((m) => m.id !== id));
    setMacros(next);
    notify('Macro supprimée');
  };

  const simulated = useMemo(
    () => simulateCompoundExpansion(sandboxInput, { homeSetter, awaySetter, config }),
    [sandboxInput, homeSetter, awaySetter, config]
  );

  return (
    <div className="container" style={{ maxWidth: 1240, padding: '24px 20px 64px' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="badge" style={{ background: 'rgba(249,115,22,0.18)', color: '#fb923c', fontWeight: 700 }}>
              DataVolley 4 Pro · Compound Codes & Macros
            </span>
            <Link to="/datavolley" className="btn btn-secondary btn-sm">
              ← Retour au centre DataVolley
            </Link>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>
            Codes Automatiques (« Compound Codes ») & Macros Clavier
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, maxWidth: 820 }}>
            Comprenez en détail comment DataVolley 4 génère automatiquement <strong>2 à 3 actions en une seule frappe</strong>{' '}
            grâce à l’opérateur point (<code>.</code>), aux équivalences miroirs (Service ⇄ Réception, Attaque ⇄ Contre/Défense)
            et à l’insertion automatique de la passe (<code>E</code>).
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {savedNotice && (
            <span style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.18)', color: '#4ade80', fontSize: 13, fontWeight: 600 }}>
              ✓ {savedNotice}
            </span>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleReset}>
            Réinitialiser standard DV4
          </button>
        </div>
      </div>

      {/* SECTION 1 : EXPLICATION VISUELLE ET DÉTAILLÉE DU FONCTIONNEMENT */}
      <div className="card" style={{ padding: 22, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1.25rem' }}>
          1. Comment fonctionnent les Codes Automatiques dans DataVolley 4 ?
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.6 }}>
          Lors d’un match en direct, un ballon voyage en moins d’une seconde entre le serveur et le réceptionneur, ou entre
          l’attaquant et le défenseur. Il est humainement difficile de taper deux codes complets séparés. DataVolley résout ce
          problème grâce à <strong>4 mécanismes automatiques complémentaires</strong> :
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16 }}>
          {/* Pilier 1 */}
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>① Duo Service ⇄ Réception (S.R)</span>
              <input
                type="checkbox"
                checked={!!config.serveToReception}
                onChange={(e) => updateConfig({ serveToReception: e.target.checked })}
              />
            </div>
            <div style={{ fontFamily: 'monospace', background: 'rgba(15,23,42,0.65)', padding: '8px 10px', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
              Frappe : <strong style={{ color: '#fbbf24' }}>a04SM5.06#</strong>
              <br />
              ↳ Génère 1 : <span style={{ color: '#38bdf8' }}>a04SM5-</span> (Service négatif)
              <br />
              ↳ Génère 2 : <span style={{ color: '#4ade80' }}>*06R5#</span> <span className="badge" style={{ fontSize: 10 }}>AUTO</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Vous tapez le serveur (<code>a04SM5</code>), un point (<code>.</code>), puis directement le numéro et la note du
              réceptionneur adverse (<code>06#</code>). Le logiciel crée la réception dans le camp opposé, copie la zone d’arrivée
              du service et attribue l’évaluation inverse au service !
            </p>
          </div>

          {/* Pilier 2 */}
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: '#f97316' }}>② Duo Attaque ⇄ Contre (A.B)</span>
              <input
                type="checkbox"
                checked={!!config.attackToBlock}
                onChange={(e) => updateConfig({ attackToBlock: e.target.checked })}
              />
            </div>
            <div style={{ fontFamily: 'monospace', background: 'rgba(15,23,42,0.65)', padding: '8px 10px', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
              Frappe : <strong style={{ color: '#fbbf24' }}>*09AV56.12#</strong>
              <br />
              ↳ Génère 1 : <span style={{ color: '#f87171' }}>*09AV56/</span> (Attaque contrée)
              <br />
              ↳ Génère 2 : <span style={{ color: '#4ade80' }}>a12B#</span> <span className="badge" style={{ fontSize: 10 }}>AUTO</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Après une attaque sans évaluation (<code>*09AV56</code>), tapez <code>.12#</code> si le n°12 adverse réalise un contre
              gagnant, ou <code>.12+</code> s’il amortit la balle au bloc. L’attaque reçoit automatiquement <code>/</code> ou{' '}
              <code>!</code>.
            </p>
          </div>

          {/* Pilier 3 */}
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: '#a855f7' }}>③ Duo Attaque ⇄ Défense (A.D)</span>
              <input
                type="checkbox"
                checked={!!config.attackToDig}
                onChange={(e) => updateConfig({ attackToDig: e.target.checked })}
              />
            </div>
            <div style={{ fontFamily: 'monospace', background: 'rgba(15,23,42,0.65)', padding: '8px 10px', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
              Frappe : <strong style={{ color: '#fbbf24' }}>*09AV55.08D+</strong>
              <br />
              ↳ Génère 1 : <span style={{ color: '#38bdf8' }}>*09AV55-</span> (Attaque défendue)
              <br />
              ↳ Génère 2 : <span style={{ color: '#4ade80' }}>a08D+</span> <span className="badge" style={{ fontSize: 10 }}>AUTO</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Ajoutez la lettre <code>D</code> après le numéro du défenseur (<code>.08D+</code>) : DataVolley crée une action de
              Défense (<code>D</code>) pour l’adversaire et note l’attaque comme défendue (<code>-</code>).
            </p>
          </div>

          {/* Pilier 4 */}
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: '#10b981' }}>④ Auto-Passeur (E → A)</span>
              <input
                type="checkbox"
                checked={!!config.autoSetterBeforeAttack}
                onChange={(e) => updateConfig({ autoSetterBeforeAttack: e.target.checked })}
              />
            </div>
            <div style={{ fontFamily: 'monospace', background: 'rgba(15,23,42,0.65)', padding: '8px 10px', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
              Frappe : <strong style={{ color: '#fbbf24' }}>*09AX14#</strong>
              <br />
              ↳ Insère 1 : <span style={{ color: '#4ade80' }}>*07E3#</span> <span className="badge" style={{ fontSize: 10 }}>AUTO</span>
              <br />
              ↳ Génère 2 : <span style={{ color: '#38bdf8' }}>*09AX14#</span> (Attaque X1)
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Si vous ne codez pas manuellement la passe (<code>E</code>) mais que le passeur est identifié dans votre six de départ,
              coder l’attaque insère automatiquement la touche de passe du passeur vers la zone de l’attaquant !
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2 : BAC À SABLE INTERACTIF EN DIRECT */}
      <div className="card" style={{ padding: 22, marginBottom: 24, border: '1px solid rgba(56,189,248,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
              2. Simulateur & Bac à Sable Interactif en Direct
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Testez vos formules combinées ci-dessous et observez instantanément les codes générés selon votre matrice.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ fontSize: 13 }}>
              Passeur Domicile (*) n°{' '}
              <input
                type="number"
                min="1"
                max="99"
                value={homeSetter}
                onChange={(e) => setHomeSetter(Number(e.target.value) || 7)}
                style={{ width: 58, padding: '4px 8px', borderRadius: 6 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Passeur Extérieur (a) n°{' '}
              <input
                type="number"
                min="1"
                max="99"
                value={awaySetter}
                onChange={(e) => setAwaySetter(Number(e.target.value) || 2)}
                style={{ width: 58, padding: '4px 8px', borderRadius: 6 }}
              />
            </label>
          </div>
        </div>

        {/* Boutons d'exemples pré-remplis */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {SANDBOX_EXAMPLES.map((ex) => (
            <button
              key={ex.input}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSandboxInput(ex.input)}
            >
              ⚡ {ex.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={sandboxInput}
          onChange={(e) => setSandboxInput(e.target.value)}
          placeholder="Tapez une séquence combinée ex: a04SM5.06#*09AX14#"
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '1.15rem',
            fontFamily: 'monospace',
            borderRadius: 10,
            border: '2px solid #38bdf8',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            marginBottom: 16,
          }}
        />

        <div style={{ overflowX: 'auto' }}>
          <table className="dv-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Ordre</th>
                <th style={{ width: 150 }}>Code généré</th>
                <th style={{ width: 110 }}>Origine</th>
                <th>Traduction en français</th>
                <th>Règle automatique appliquée</th>
              </tr>
            </thead>
            <tbody>
              {simulated.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 16 }}>
                    Saisissez un code ci-dessus pour voir la décomposition automatique.
                  </td>
                </tr>
              ) : (
                simulated.map((row, idx) => (
                  <tr key={`${row.code}-${idx}`}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>#{idx + 1}</td>
                    <td>
                      <code style={{ fontSize: 15, fontWeight: 700, color: row.isAuto ? '#4ade80' : '#38bdf8' }}>
                        {row.code}
                      </code>
                    </td>
                    <td>
                      {row.isAuto ? (
                        <span className="badge" style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80', fontWeight: 700 }}>
                          ⚡ AUTO
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(56,189,248,0.18)', color: '#38bdf8' }}>
                          ⌨️ Saisi
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{describeCode(row.code, { evaluationOptional: true })}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3 : MATRICE D'ÉQUIVALENCE PERSONNALISABLE */}
      <div className="card" style={{ padding: 22, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: '1.25rem' }}>
          3. Matrice d’Équivalence des Évaluations Miroirs (Personnalisable)
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
          Personnalisez l’évaluation attribuée automatiquement à la première action lorsque vous notez l’action en miroir.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
          {/* Table 1 : Réception -> Service */}
          <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 10 }}>
            <h4 style={{ marginTop: 0, marginBottom: 10, color: '#38bdf8' }}>
              Quand la Réception (R) est notée… → Le Service (S) reçoit :
            </h4>
            <table className="dv-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Éval. Réception (R)</th>
                  <th>Éval. Service déduite (S)</th>
                </tr>
              </thead>
              <tbody>
                {DV_EVAL_KEYS.map((sym) => (
                  <tr key={`sr-${sym}`}>
                    <td>
                      <code>R{sym}</code>
                    </td>
                    <td>
                      <select
                        value={config.serveFromReception?.[sym] || '-'}
                        onChange={(e) => updateMatrixCell('serveFromReception', sym, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace' }}
                      >
                        {DV_EVAL_KEYS.map((ev) => (
                          <option key={ev} value={ev}>
                            S{ev}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table 2 : Contre -> Attaque */}
          <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 10 }}>
            <h4 style={{ marginTop: 0, marginBottom: 10, color: '#f97316' }}>
              Quand le Contre (B) est noté… → L’Attaque (A) reçoit :
            </h4>
            <table className="dv-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Éval. Contre (B)</th>
                  <th>Éval. Attaque déduite (A)</th>
                </tr>
              </thead>
              <tbody>
                {DV_EVAL_KEYS.map((sym) => (
                  <tr key={`ab-${sym}`}>
                    <td>
                      <code>B{sym}</code>
                    </td>
                    <td>
                      <select
                        value={config.attackFromBlock?.[sym] || '/'}
                        onChange={(e) => updateMatrixCell('attackFromBlock', sym, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace' }}
                      >
                        {DV_EVAL_KEYS.map((ev) => (
                          <option key={ev} value={ev}>
                            A{ev}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table 3 : Défense -> Attaque */}
          <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 10 }}>
            <h4 style={{ marginTop: 0, marginBottom: 10, color: '#a855f7' }}>
              Quand la Défense (D) est notée… → L’Attaque (A) reçoit :
            </h4>
            <table className="dv-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Éval. Défense (D)</th>
                  <th>Éval. Attaque déduite (A)</th>
                </tr>
              </thead>
              <tbody>
                {DV_EVAL_KEYS.map((sym) => (
                  <tr key={`ad-${sym}`}>
                    <td>
                      <code>D{sym}</code>
                    </td>
                    <td>
                      <select
                        value={config.attackFromDig?.[sym] || '-'}
                        onChange={(e) => updateMatrixCell('attackFromDig', sym, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace' }}
                      >
                        {DV_EVAL_KEYS.map((ev) => (
                          <option key={ev} value={ev}>
                            A{ev}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 4 : KEYBOARD REMAPPING (STANDARD AZERTY SCOUT & MACROS 1-TO-MANY) */}
      <div className="card" style={{ padding: 22, marginBottom: 24 }}>
        <KeyboardRemapModal isModal={false} />
      </div>

      {/* SECTION 5 : ÉDITEUR DE MACROS CLAVIER PERSONNALISÉES (COMBINAISONS ALT) */}
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: '1.25rem' }}>
          5. Raccourcis de Snippets Multi-Touches (Alt+1…0)
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
          Associez une combinaison de touches (ex: <code>Alt+1</code>, <code>Alt+5</code>) à une séquence de code fréquente
          pour l’insérer d’une seule touche dans le bandeau de saisie DataVolley.
        </p>

        <form
          onSubmit={handleAddMacro}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18, padding: 14, borderRadius: 10, background: 'var(--bg-secondary)' }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Raccourci clavier</label>
            <input
              type="text"
              placeholder="ex: Alt+1 ou Ctrl+M"
              value={newMacro.shortcut}
              onChange={(e) => setNewMacro({ ...newMacro, shortcut: e.target.value })}
              style={{ width: 150, padding: '6px 10px', borderRadius: 6, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Code inséré (Snippet)</label>
            <input
              type="text"
              placeholder="ex: EK1# ou AV54#"
              value={newMacro.snippet}
              onChange={(e) => setNewMacro({ ...newMacro, snippet: e.target.value.toUpperCase() })}
              style={{ width: 150, padding: '6px 10px', borderRadius: 6, fontFamily: 'monospace' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Description</label>
            <input
              type="text"
              placeholder="ex: Fixation Devant K1"
              value={newMacro.label}
              onChange={(e) => setNewMacro({ ...newMacro, label: e.target.value })}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Catégorie</label>
            <select
              value={newMacro.category}
              onChange={(e) => setNewMacro({ ...newMacro, category: e.target.value })}
              style={{ padding: '6px 10px', borderRadius: 6 }}
            >
              <option value="Passeur">Passeur</option>
              <option value="Attaque">Attaque</option>
              <option value="Service">Service</option>
              <option value="Étendu">Étendu</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            + Ajouter la macro
          </button>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table className="dv-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Raccourci</th>
                <th>Catégorie</th>
                <th>Code inséré</th>
                <th>Description</th>
                <th style={{ width: 90 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {macros.map((m) => (
                <tr key={m.id}>
                  <td>
                    <kbd style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', fontFamily: 'monospace' }}>
                      {m.shortcut}
                    </kbd>
                  </td>
                  <td>
                    <span className="badge">{m.category}</span>
                  </td>
                  <td>
                    <code style={{ fontWeight: 700, color: '#fbbf24' }}>{m.snippet}</code>
                  </td>
                  <td>{m.label}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDeleteMacro(m.id)}
                    >
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
