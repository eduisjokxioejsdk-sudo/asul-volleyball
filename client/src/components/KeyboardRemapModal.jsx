// ============================================================================
// KEYBOARD REMAP MODAL & EDITOR — Interface visuelle de personnalisation
// du clavier AZERTY Scout & Macros 1-to-Many (DataVolley / PureVolley)
// ============================================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  KEY_COLOR_CATEGORIES,
  KEY_COLOR_MAP,
  KEYBOARD_REMAP_EVENT,
  loadKeyboardProfile,
  saveKeyboardProfile,
  resetKeyboardProfile,
  exportProfileToJson,
  validateAndImportProfileJson,
  formatPhysicalKey,
  handleRemappedKeyDown,
} from '../utils/keyboardRemap';
import { downloadTextFile } from '../utils/download';
import { parseSequence, describeCode } from '../utils/datavolley';
import {
  Check,
  CornerDownLeft,
  Download,
  Keyboard,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  Upload,
  X,
  Zap,
} from './icons';

/** Disposition physique d'un clavier AZERTY pour la visualisation des gommettes. */
const AZERTY_VISUAL_ROWS = [
  [
    { code: 'Digit1', top: '1', sub: '&' },
    { code: 'Digit2', top: '2', sub: 'é' },
    { code: 'Digit3', top: '3', sub: '"' },
    { code: 'Digit4', top: '4', sub: "'" },
    { code: 'Digit5', top: '5', sub: '(' },
    { code: 'Digit6', top: '6', sub: '-' },
    { code: 'Digit7', top: '7', sub: 'è' },
    { code: 'Digit8', top: '8', sub: '_' },
    { code: 'Digit9', top: '9', sub: 'ç' },
    { code: 'Digit0', top: '0', sub: 'à' },
  ],
  [
    { code: 'KeyQ', top: 'A', sub: 'KeyQ' },
    { code: 'KeyW', top: 'Z', sub: 'KeyW' },
    { code: 'KeyE', top: 'E', sub: '' },
    { code: 'KeyR', top: 'R', sub: '' },
    { code: 'KeyT', top: 'T', sub: '' },
    { code: 'KeyY', top: 'Y', sub: '' },
    { code: 'KeyU', top: 'U', sub: '' },
    { code: 'KeyI', top: 'I', sub: '' },
    { code: 'KeyO', top: 'O', sub: '' },
    { code: 'KeyP', top: 'P', sub: '' },
  ],
  [
    { code: 'KeyA', top: 'Q', sub: 'KeyA' },
    { code: 'KeyS', top: 'S', sub: '' },
    { code: 'KeyD', top: 'D', sub: '' },
    { code: 'KeyF', top: 'F', sub: '' },
    { code: 'KeyG', top: 'G', sub: '' },
    { code: 'KeyH', top: 'H', sub: '' },
    { code: 'KeyJ', top: 'J', sub: '' },
    { code: 'KeyK', top: 'K', sub: '' },
    { code: 'KeyL', top: 'L', sub: '' },
    { code: 'Semicolon', top: 'M', sub: ';' },
  ],
  [
    { code: 'KeyZ', top: 'W', sub: 'KeyZ' },
    { code: 'KeyX', top: 'X', sub: '' },
    { code: 'KeyC', top: 'C', sub: '' },
    { code: 'KeyV', top: 'V', sub: '' },
    { code: 'KeyB', top: 'B', sub: '' },
    { code: 'KeyN', top: 'N', sub: '' },
    { code: 'ArrowLeft', top: '←', sub: 'Gauche', wide: true },
    { code: 'ArrowUp', top: '↑', sub: 'Haut' },
    { code: 'ArrowDown', top: '↓', sub: 'Bas' },
    { code: 'ArrowRight', top: '→', sub: 'Droite', wide: true },
  ],
];

/**
 * Éditeur complet de Keyboard Remapping (utilisable en modale ou intégré dans une page).
 *
 * @param {Object} props
 * @param {boolean} [props.open=true] - Affiche ou masque le composant (si modale)
 * @param {() => void} [props.onClose] - Callback de fermeture (si modale)
 * @param {boolean} [props.isModal=false] - Si true, encapsule dans un overlay modal
 * @param {(profile: import('../utils/keyboardRemap').KeyboardRemapProfile) => void} [props.onProfileChange]
 */
export default function KeyboardRemapModal({
  open = true,
  onClose = null,
  isModal = false,
  onProfileChange = null,
}) {
  const [profile, setProfile] = useState(() => loadKeyboardProfile());
  const [isCapturingKey, setIsCapturingKey] = useState(false);

  // État du formulaire d'ajout / modification d'un raccourci
  const [formCode, setFormCode] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formOutput, setFormOutput] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formColor, setFormColor] = useState('yellow');
  const [formAutoEnter, setFormAutoEnter] = useState(false);

  // Filtre de couleur dans la liste
  const [colorFilter, setColorFilter] = useState('ALL');

  // Notification flash
  const [notice, setNotice] = useState(null);
  const noticeTimerRef = useRef(null);

  // Zone de test en temps réel (Live Sandbox)
  const [testInput, setTestInput] = useState('*09A4');
  const [testLogs, setTestLogs] = useState([]);
  const testInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const showNotice = (ok, text) => {
    setNotice({ ok, text });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
  };

  useEffect(() => {
    const syncProfile = () => {
      setProfile(loadKeyboardProfile());
    };
    window.addEventListener(KEYBOARD_REMAP_EVENT, syncProfile);
    return () => {
      window.removeEventListener(KEYBOARD_REMAP_EVENT, syncProfile);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const applyNewProfile = (nextProfile, message = '') => {
    const saved = saveKeyboardProfile(nextProfile);
    setProfile(saved);
    onProfileChange?.(saved);
    if (message) showNotice(true, message);
  };

  // Capture physique de la touche lorsque "Appuyez sur une touche..." est actif
  useEffect(() => {
    if (!isCapturingKey) return undefined;

    const handleCaptureKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignorer l'appui isolé sur une touche modificatrice seule
      if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) {
        return;
      }

      if (e.code === 'Escape') {
        setIsCapturingKey(false);
        return;
      }

      const capturedCode = e.code || e.key;
      const capturedKey = e.key || '';
      setFormCode(capturedCode);
      setFormKey(capturedKey);
      setIsCapturingKey(false);

      // Si cette touche existe déjà dans le profil, pré-remplir ses valeurs pour faciliter l'édition
      const existing = profile.mappings?.[capturedCode];
      if (existing) {
        setFormOutput(existing.output);
        setFormLabel(existing.label || '');
        setFormColor(existing.color || 'yellow');
        setFormAutoEnter(Boolean(existing.autoEnter));
      }
    };

    window.addEventListener('keydown', handleCaptureKeyDown, true);
    return () => window.removeEventListener('keydown', handleCaptureKeyDown, true);
  }, [isCapturingKey, profile]);

  if (isModal && !open) return null;

  const mappingList = Object.values(profile.mappings || {});
  const filteredMappings =
    colorFilter === 'ALL' ? mappingList : mappingList.filter((m) => m.color === colorFilter);

  const selectKeyForEdit = (code, keyHint = '') => {
    const existing = profile.mappings?.[code];
    setFormCode(code);
    setFormKey(existing?.key || keyHint || '');
    if (existing) {
      setFormOutput(existing.output);
      setFormLabel(existing.label || '');
      setFormColor(existing.color || 'yellow');
      setFormAutoEnter(Boolean(existing.autoEnter));
    } else {
      setFormOutput('');
      setFormLabel('');
      setFormColor('yellow');
      setFormAutoEnter(false);
    }
  };

  const handleSaveShortcut = (e) => {
    e.preventDefault();
    const cleanCode = String(formCode || '').trim();
    const cleanOutput = String(formOutput || '');
    if (!cleanCode) {
      showNotice(false, 'Veuillez d’abord capturer ou sélectionner une touche physique.');
      return;
    }
    if (!cleanOutput) {
      showNotice(false, 'Veuillez saisir le ou les caractères à produire (ex: #, ap, *p, X5).');
      return;
    }

    const nextMappings = {
      ...(profile.mappings || {}),
      [cleanCode]: {
        id: `map_${cleanCode.toLowerCase()}`,
        code: cleanCode,
        key: formKey || '',
        label: formLabel.trim() || `Touche ${formatPhysicalKey(cleanCode, formKey)} → ${cleanOutput}`,
        output: cleanOutput,
        color: formColor,
        autoEnter: Boolean(formAutoEnter),
        enabled: true,
      },
    };

    applyNewProfile(
      { ...profile, mappings: nextMappings },
      `Raccourci ${formatPhysicalKey(cleanCode, formKey)} → « ${cleanOutput} » enregistré`
    );
  };

  const handleDeleteMapping = (code) => {
    const nextMappings = { ...(profile.mappings || {}) };
    delete nextMappings[code];
    applyNewProfile({ ...profile, mappings: nextMappings }, `Raccourci ${code} supprimé`);
  };

  const handleToggleMapping = (code) => {
    const current = profile.mappings?.[code];
    if (!current) return;
    const nextMappings = {
      ...(profile.mappings || {}),
      [code]: { ...current, enabled: !current.enabled },
    };
    applyNewProfile({ ...profile, mappings: nextMappings });
  };

  const handleToggleGlobalEnabled = () => {
    applyNewProfile(
      { ...profile, enabled: !profile.enabled },
      !profile.enabled ? 'Keyboard Remapping activé' : 'Keyboard Remapping désactivé'
    );
  };

  const handleResetDefault = () => {
    const reset = resetKeyboardProfile();
    setProfile(reset);
    onProfileChange?.(reset);
    showNotice(true, 'Profil réinitialisé au Standard AZERTY Scout');
  };

  const handleExportJson = () => {
    const json = exportProfileToJson(profile);
    const slug = String(profile.name || 'azerty-scout')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    downloadTextFile(`purevolley-keymap-${slug}.json`, json, 'application/json;charset=utf-8');
    showNotice(true, 'Profil clavier exporté en .json');
  };

  const handleImportJsonFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = validateAndImportProfileJson(String(reader.result || ''));
        setProfile(imported);
        onProfileChange?.(imported);
        showNotice(true, `Profil « ${imported.name} » (${Object.keys(imported.mappings).length} touches) importé avec succès !`);
      } catch (err) {
        showNotice(false, err?.message || 'Erreur lors de l’importation du fichier JSON.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Gestionnaire d'événements du bac à sable de test en temps réel
  const handleSandboxKeyDown = (e) => {
    const res = handleRemappedKeyDown(e, {
      value: testInput,
      profile,
      inputElement: testInputRef.current,
      onChange: (nextVal, { mapping, cursorPos }) => {
        setTestInput(nextVal);
        setTestLogs((prev) => [
          {
            id: Date.now() + Math.random(),
            code: mapping.code,
            output: mapping.output,
            color: mapping.color,
            autoEnter: mapping.autoEnter,
            resultBuffer: nextVal,
            cursorPos,
          },
          ...prev.slice(0, 7),
        ]);
      },
      onCommit: (finalVal, mapping) => {
        setTestLogs((prev) => [
          {
            id: Date.now() + Math.random(),
            code: mapping ? mapping.code : 'Enter',
            output: mapping ? mapping.output : '↵',
            color: mapping ? mapping.color : 'blue',
            autoEnter: true,
            committedLine: finalVal,
            resultBuffer: finalVal,
          },
          ...prev.slice(0, 7),
        ]);
        setTestInput('');
      },
    });

    if (res.handled) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (testInput.trim()) {
        setTestLogs((prev) => [
          {
            id: Date.now() + Math.random(),
            code: 'Enter',
            output: '↵ Validation manuelle',
            color: 'blue',
            autoEnter: true,
            committedLine: testInput,
            resultBuffer: testInput,
          },
          ...prev.slice(0, 7),
        ]);
        setTestInput('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setTestInput('');
    }
  };

  const sandboxParsed = useMemo(() => parseSequence(testInput), [testInput]);

  const content = (
    <div className="kb-remap-shell" style={{ color: 'var(--text-primary)' }}>
      {/* En-tête et barre d'actions Import / Export */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid var(--border-color, #27272a)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.15rem' }}>
            <Keyboard size={18} /> Configuration du Clavier &amp; Macros Scout ({profile.name})
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            Interception par code physique (<code>event.code</code>), injection 1-to-Many à la position exacte du curseur
            et option d’auto-validation immédiate (<code>Enter</code>).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label
            className="btn btn-secondary btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              borderColor: profile.enabled ? '#22c55e' : undefined,
            }}
          >
            <input type="checkbox" checked={!!profile.enabled} onChange={handleToggleGlobalEnabled} />
            <span>{profile.enabled ? 'Remapping Actif' : 'Remapping Désactivé'}</span>
          </label>

          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportJson} title="Exporter le profil clavier au format .json">
            <Download size={13} /> Exporter le profil (.json)
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            title="Importer un fichier de profil clavier .json"
          >
            <Upload size={13} /> Importer un profil (.json)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJsonFile}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResetDefault}
            title="Revenir au profil Standard AZERTY Scout par défaut"
          >
            <RotateCcw size={13} /> Standard AZERTY
          </button>

          {isModal && onClose && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} title="Fermer">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          style={{
            marginBottom: 14,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: notice.ok ? 'rgba(34, 197, 94, 0.16)' : 'rgba(239, 68, 68, 0.18)',
            border: `1px solid ${notice.ok ? '#22c55e' : '#ef4444'}`,
            color: notice.ok ? '#86efac' : '#fca5a5',
          }}
        >
          {notice.ok ? '✓ ' : '⚠ '} {notice.text}
        </div>
      )}

      {/* 1. REPRÉSENTATION VISUELLE DU CLAVIER AZERTY AVEC GOMMETTES COLORÉES */}
      <div
        style={{
          padding: 14,
          marginBottom: 16,
          borderRadius: 8,
          background: '#09090b',
          border: '1px solid #27272a',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.04em' }}>
            Vue Clavier AZERTY Scout (Cliquez sur une touche pour l’éditer)
          </span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11 }}>
            {KEY_COLOR_CATEGORIES.map((cat) => (
              <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: cat.hex,
                    display: 'inline-block',
                  }}
                />
                <span style={{ color: '#d4d4d8' }}>{cat.shortLabel}</span>
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {AZERTY_VISUAL_ROWS.map((row, rIdx) => (
            <div
              key={`row-${rIdx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(10, minmax(56px, 1fr))',
                gap: 6,
                paddingLeft: rIdx === 1 ? 12 : rIdx === 2 ? 22 : 0,
              }}
            >
              {row.map((k) => {
                const mapped = profile.mappings?.[k.code];
                const colorObj = mapped ? KEY_COLOR_MAP[mapped.color] || KEY_COLOR_MAP.yellow : null;
                const isSelected = formCode === k.code;
                return (
                  <button
                    key={k.code}
                    type="button"
                    onClick={() => selectKeyForEdit(k.code, k.sub || k.top)}
                    title={
                      mapped
                        ? `${k.code} → ${mapped.output} (${mapped.label})${mapped.autoEnter ? ' + Auto-Enter ↵' : ''}`
                        : `Cliquer pour configurer ${k.code}`
                    }
                    style={{
                      position: 'relative',
                      minHeight: 50,
                      padding: '5px 6px',
                      borderRadius: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      textAlign: 'left',
                      background: mapped && mapped.enabled ? colorObj.bg : '#18181b',
                      border: isSelected
                        ? '2px solid #f8fafc'
                        : mapped && mapped.enabled
                          ? `1.5px solid ${colorObj.border}`
                          : '1px solid #27272a',
                      opacity: mapped && !mapped.enabled ? 0.45 : 1,
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#a1a1aa', fontWeight: 600 }}>{k.top}</span>
                      {mapped && mapped.autoEnter && (
                        <span
                          title="Auto-Validation (Enter) activée"
                          style={{
                            fontSize: 9,
                            padding: '1px 4px',
                            borderRadius: 3,
                            background: '#3b82f6',
                            color: '#fff',
                            fontWeight: 800,
                          }}
                        >
                          ↵
                        </span>
                      )}
                    </div>
                    {mapped ? (
                      <strong
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: 15,
                          fontWeight: 900,
                          color: colorObj.text,
                          alignSelf: 'center',
                        }}
                      >
                        {mapped.output}
                      </strong>
                    ) : (
                      <span style={{ fontSize: 10, color: '#52525b', alignSelf: 'center' }}>—</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 2. FORMULAIRE D'AJOUT / ÉDITION DE RACCOURCI + ZONE DE TEST EN DIRECT */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Formulaire d'édition d'une touche */}
        <form
          onSubmit={handleSaveShortcut}
          style={{
            padding: 16,
            borderRadius: 8,
            background: 'var(--bg-secondary, #18181b)',
            border: '1px solid var(--border-color, #27272a)',
          }}
        >
          <h4 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Ajouter ou modifier un raccourci clavier
          </h4>

          {/* Étape 1 : Bouton de capture physique */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              1. Touche physique écoutée (<code>event.code</code>)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setIsCapturingKey((v) => !v)}
                className={`btn btn-sm ${isCapturingKey ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontWeight: 700,
                  border: isCapturingKey ? '2px solid #fbbf24' : undefined,
                }}
              >
                {isCapturingKey ? (
                  <>
                    <Target size={14} /> Appuyez sur une touche… (Échap pour annuler)
                  </>
                ) : formCode ? (
                  <>
                    <Keyboard size={14} /> Touche capturée : <code>{formCode}</code> ({formatPhysicalKey(formCode, formKey)})
                  </>
                ) : (
                  <>
                    <Target size={14} /> Appuyez sur une touche…
                  </>
                )}
              </button>
              <input
                type="text"
                placeholder="Code ex: ArrowRight"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                style={{
                  width: 125,
                  padding: '7px 8px',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  background: '#09090b',
                  border: '1px solid #3f3f46',
                  color: '#f4f4f5',
                }}
                title="Identifiant physique (event.code)"
              />
            </div>
          </div>

          {/* Étape 2 : Chaîne à injecter (1 ou plusieurs caractères) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                2. Caractère(s) à produire
              </label>
              <input
                type="text"
                placeholder="ex: #, ap, *p, X5, V5"
                value={formOutput}
                onChange={(e) => setFormOutput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 14,
                  fontWeight: 800,
                  background: '#09090b',
                  border: '1px solid #38bdf8',
                  color: '#fbbf24',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Libellé descriptif (optionnel)
              </label>
              <input
                type="text"
                placeholder="ex: Point équipe extérieure (ap)"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  background: '#09090b',
                  border: '1px solid #3f3f46',
                  color: '#f4f4f5',
                }}
              />
            </div>
          </div>

          {/* Étape 3 : Sélecteur de couleur (gommette visuelle) */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              3. Gommette visuelle (Couleur par catégorie)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {KEY_COLOR_CATEGORIES.map((cat) => {
                const active = formColor === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFormColor(cat.id)}
                    title={cat.desc}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: active ? 800 : 500,
                      background: active ? cat.bg : '#09090b',
                      border: active ? `2px solid ${cat.border}` : '1px solid #27272a',
                      color: active ? cat.text : '#d4d4d8',
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: cat.hex,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cat.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Étape 4 : Case à cocher Auto-Validation (Enter) */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 6,
                background: formAutoEnter ? 'rgba(59, 130, 246, 0.14)' : '#09090b',
                border: formAutoEnter ? '1px solid #3b82f6' : '1px solid #27272a',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={formAutoEnter}
                onChange={(e) => setFormAutoEnter(e.target.checked)}
              />
              <div>
                <strong style={{ color: formAutoEnter ? '#93c5fd' : '#e4e4e7' }}>
                  4. Valider automatiquement la ligne après insertion (Auto-Validation / Enter ↵)
                </strong>
                <div style={{ fontSize: 11, color: '#a1a1aa' }}>
                  Idéal pour les conclusions de point (ex: <code>ArrowRight</code> écrit <code>ap</code> et valide immédiatement le point).
                </div>
              </div>
            </label>
          </div>

          <button type="submit" className="btn btn-primary btn-block" style={{ width: '100%' }}>
            <Check size={14} /> Enregistrer ce raccourci sur le clavier
          </button>
        </form>

        {/* Zone de test en temps réel (Live Test Sandbox) */}
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: 'var(--bg-secondary, #18181b)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h4 style={{ marginTop: 0, marginBottom: 6, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
              <Zap size={15} /> Zone de Test en Temps Réel (Curseur &amp; Macros)
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 10 }}>
              Cliquez dans le champ ci-dessous (même au milieu du texte) et appuyez sur vos touches mappées (ex:{' '}
              <kbd>1</kbd> pour <code>#</code>, <kbd>V</kbd> pour <code>B</code>, <kbd>→</kbd> pour <code>ap</code> + validation).
            </p>

            <input
              ref={testInputRef}
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={handleSandboxKeyDown}
              placeholder="Tapez ici pour tester votre mapping en direct (ex: *09A4 puis →)..."
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 16,
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                borderRadius: 8,
                background: '#09090b',
                border: '2px solid #38bdf8',
                color: '#fbbf24',
                marginBottom: 10,
              }}
            />

            {/* Décodage DataVolley en direct du champ de test */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', marginBottom: 4 }}>
                Aperçu décodé PureVolley / DataVolley :
              </div>
              {sandboxParsed.length === 0 ? (
                <div style={{ fontSize: 12, color: '#71717a', fontStyle: 'italic' }}>Tampon vide — en attente de frappe…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sandboxParsed.map((item, idx) => (
                    <div
                      key={`${item.code}-${idx}`}
                      style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: '#09090b',
                        borderLeft: `3px solid ${item.valid ? '#22c55e' : '#ef4444'}`,
                      }}
                    >
                      <code style={{ fontWeight: 800, color: item.valid ? '#4ade80' : '#f87171' }}>{item.code}</code>{' '}
                      <span style={{ color: '#d4d4d8' }}>{describeCode(item.code)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Journal des dernières interceptions clavier */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa' }}>
                Journal des touches interceptées :
              </span>
              {testLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTestLogs([])}
                  style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 11, cursor: 'pointer' }}
                >
                  Effacer
                </button>
              )}
            </div>
            <div
              style={{
                maxHeight: 120,
                overflowY: 'auto',
                background: '#09090b',
                border: '1px solid #27272a',
                borderRadius: 6,
                padding: 6,
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {testLogs.length === 0 ? (
                <div style={{ color: '#52525b', textAlign: 'center', padding: 8 }}>
                  Appuyez sur une touche dans le champ ci-dessus pour voir l’interception.
                </div>
              ) : (
                testLogs.map((log) => {
                  const cat = KEY_COLOR_MAP[log.color] || KEY_COLOR_MAP.yellow;
                  return (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        padding: '3px 4px',
                        borderBottom: '1px solid #18181b',
                      }}
                    >
                      <span>
                        <kbd style={{ padding: '1px 5px', borderRadius: 3, background: '#27272a', color: '#e4e4e7' }}>
                          {log.code}
                        </kbd>{' '}
                        →{' '}
                        <strong style={{ color: cat.text }}>{log.output}</strong>
                      </span>
                      {log.committedLine ? (
                        <span style={{ color: '#60a5fa', fontWeight: 700 }}>
                          <CornerDownLeft size={11} /> Validé : {log.committedLine}
                        </span>
                      ) : (
                        <span style={{ color: '#a1a1aa' }}>Tampon : {log.resultBuffer}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. LISTE COMPLÈTE DES TOUCHES MAPPÉES */}
      <div
        style={{
          padding: 14,
          borderRadius: 8,
          background: 'var(--bg-secondary, #18181b)',
          border: '1px solid var(--border-color, #27272a)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <h4 style={{ margin: 0, fontSize: 14 }}>
            Touches configurées ({filteredMappings.length} / {mappingList.length})
          </h4>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${colorFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setColorFilter('ALL')}
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              Toutes
            </button>
            {KEY_COLOR_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`btn btn-sm ${colorFilter === cat.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setColorFilter(cat.id)}
                style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.hex }} />
                {cat.shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="dv-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 50 }}>Actif</th>
                <th style={{ width: 170 }}>Touche physique</th>
                <th style={{ width: 130 }}>Séquence injectée</th>
                <th style={{ width: 160 }}>Gommette</th>
                <th>Description</th>
                <th style={{ width: 130 }}>Auto-Validation</th>
                <th style={{ width: 110 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMappings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 14, color: '#71717a' }}>
                    Aucun raccourci dans cette catégorie.
                  </td>
                </tr>
              ) : (
                filteredMappings.map((item) => {
                  const cat = KEY_COLOR_MAP[item.color] || KEY_COLOR_MAP.yellow;
                  return (
                    <tr key={item.code} style={{ opacity: item.enabled ? 1 : 0.5 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!item.enabled}
                          onChange={() => handleToggleMapping(item.code)}
                          title="Activer / désactiver cette touche"
                        />
                      </td>
                      <td>
                        <kbd
                          style={{
                            padding: '3px 8px',
                            borderRadius: 5,
                            background: '#09090b',
                            border: '1px solid #3f3f46',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: 12,
                          }}
                        >
                          {formatPhysicalKey(item.code, item.key)}
                        </kbd>
                      </td>
                      <td>
                        <code
                          style={{
                            padding: '3px 8px',
                            borderRadius: 5,
                            background: cat.bg,
                            border: `1px solid ${cat.border}`,
                            color: cat.text,
                            fontWeight: 800,
                            fontSize: 14,
                          }}
                        >
                          {item.output}
                        </code>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.hex }} />
                          <span style={{ color: cat.text }}>{cat.shortLabel}</span>
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{item.label}</td>
                      <td>
                        {item.autoEnter ? (
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(59, 130, 246, 0.2)',
                              color: '#93c5fd',
                              border: '1px solid #3b82f6',
                              fontSize: 11,
                            }}
                          >
                            ↵ Auto-Enter
                          </span>
                        ) : (
                          <span style={{ color: '#52525b', fontSize: 11 }}>Non</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => selectKeyForEdit(item.code, item.key)}
                            title="Modifier ce raccourci"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDeleteMapping(item.code)}
                            title="Supprimer ce raccourci"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (!isModal) return content;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: 16,
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 1040,
          width: '96%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: 20,
          background: '#121215',
          border: '1px solid #27272a',
          borderRadius: 10,
        }}
      >
        {content}
      </div>
    </div>
  );
}
