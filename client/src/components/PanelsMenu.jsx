// ============================================================================
// Menu « Fenêtres » : ouvrir / fermer chaque fenêtre de la page de codage,
// tout réafficher, tout masquer (sauf la vidéo et la zone de code) et
// réinitialiser la disposition.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { PANEL_IDS, PANEL_META, isClosable } from '../utils/panelLayout';
import * as icons from './icons';
import { Check, LayoutGrid, RotateCcw, Save, Trash, X } from './icons';

/** Largeur du menu (voir .dv-panels-dropdown) + marge de sécurité. */
const MENU_WIDTH = 270;
const MENU_MARGIN = 12;

export default function PanelsMenu({
  layout,
  onToggle,
  onSetMany,
  onReset,
  compactIds = [],
  profiles = [],
  onSaveProfile,
  onApplyProfile,
  onDeleteProfile,
  initialOpen = false,
}) {
  const [open, setOpen] = useState(initialOpen);
  const [openRight, setOpenRight] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('');
  const wrapRef = useRef(null);

  // Un profil supprimé (ou remplacé) ne doit pas rester sélectionné.
  useEffect(() => {
    if (selectedProfile && !(profiles || []).some((p) => p.id === selectedProfile)) {
      setSelectedProfile('');
    }
  }, [profiles, selectedProfile]);

  const saveProfile = () => {
    const name = profileName.trim();
    if (!name || !onSaveProfile) return;
    const saved = onSaveProfile(name);
    if (saved?.id) {
      setSelectedProfile(saved.id);
      setProfileName('');
    }
  };

  const applyProfile = () => {
    if (selectedProfile && onApplyProfile) onApplyProfile(selectedProfile);
  };

  const deleteProfile = () => {
    if (!selectedProfile || !onDeleteProfile) return;
    onDeleteProfile(selectedProfile);
    setSelectedProfile('');
  };

  /**
   * Le menu s'ouvre normalement vers la gauche (ancré au bord droit du bouton),
   * ce qui convient quand le bouton est à droite de l'écran. Si la barre
   * d'outils est passée à la ligne et que le bouton se retrouve près du bord
   * gauche, il n'y a plus la place : le menu s'ouvre alors vers la droite.
   */
  const placeMenu = useCallback(() => {
    const button = wrapRef.current?.querySelector('button');
    if (!button || typeof window === 'undefined') return;
    const rect = button.getBoundingClientRect();
    setOpenRight(rect.right - (MENU_WIDTH + MENU_MARGIN) < 8);
  }, []);

  // Ferme le menu au clic extérieur ou sur Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Recalcule le côté d'ouverture à l'affichage et lors d'un redimensionnement.
  useEffect(() => {
    if (!open) return;
    placeMenu();
    window.addEventListener('resize', placeMenu);
    return () => window.removeEventListener('resize', placeMenu);
  }, [open, placeMenu]);

  const visibleIds = compactIds.length ? compactIds : PANEL_IDS;
  const hiddenCount = visibleIds.filter((id) => layout?.[id]?.open === false).length;

  return (
    <div className="dv-panels-menu" ref={wrapRef}>
      <button
        type="button"
        className={`btn btn-sm ${hiddenCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Afficher, masquer, déplacer et redimensionner les fenêtres de codage"
      >
        <LayoutGrid size={14} /> Fenêtres{hiddenCount > 0 ? ` (${hiddenCount} masquée${hiddenCount > 1 ? 's' : ''})` : ''}
      </button>

      {open && (
        <div className={`dv-panels-dropdown ${openRight ? 'open-right' : ''}`} role="menu">
          <div className="dv-panels-head">
            <strong>Fenêtres</strong>
            <button type="button" className="fp-close" onClick={() => setOpen(false)} aria-label="Fermer le menu">
              <X size={13} />
            </button>
          </div>
          <ul className="dv-panels-list">
            {visibleIds.map((id) => {
              const meta = PANEL_META[id] || { title: id, icon: 'Square' };
              const Icon = icons[meta.icon] || icons.Square;
              const isOpen = !!layout?.[id]?.open;
              const closable = isClosable(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`dv-panel-toggle ${isOpen ? 'on' : ''}`}
                    onClick={() => onToggle(id)}
                    disabled={!closable}
                    title={closable ? (isOpen ? 'Masquer' : 'Afficher') : 'Toujours affichée (déplaçable et redimensionnable)'}
                  >
                    <span className="dv-panel-toggle-icon">{isOpen ? <Check size={13} /> : <Icon size={13} />}</span>
                    <span className="dv-panel-toggle-label">{meta.title}</span>
                    {!closable && <span className="dv-panel-lock">ancre</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="dv-panels-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSetMany(visibleIds, true)}>
              Tout afficher
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSetMany(visibleIds, false)}>
              Tout masquer
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onReset} title="Revenir à la disposition d'origine">
              <RotateCcw size={13} /> Réinitialiser
            </button>
          </div>

          {onSaveProfile && (
            <div className="dv-panels-profiles">
              <strong>Profils de fenêtres</strong>
              <p className="dv-panels-hint">
                Enregistrez la disposition actuelle (positions, tailles, fenêtres ouvertes), puis appliquez-la à
                n’importe quel match. Les profils restent sur ce poste.
              </p>
              <select
                className="dv-profile-select"
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                aria-label="Profil de fenêtres"
              >
                <option value="">Choisir un profil…</option>
                {(profiles || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="dv-profile-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={applyProfile}
                  disabled={!selectedProfile}
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={deleteProfile}
                  disabled={!selectedProfile}
                  title="Supprimer ce profil"
                >
                  <Trash size={12} />
                </button>
              </div>
              <div className="dv-profile-save">
                <input
                  type="text"
                  value={profileName}
                  maxLength={40}
                  placeholder="Nom du profil (ex. Saisie club)"
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveProfile();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={saveProfile}
                  disabled={!profileName.trim()}
                  title="Enregistrer la disposition actuelle (un nom existant met à jour le profil)"
                >
                  <Save size={12} /> Enregistrer
                </button>
              </div>
              {(profiles || []).length === 0 && (
                <p className="dv-panels-hint">Aucun profil enregistré pour l’instant.</p>
              )}
            </div>
          )}

          <p className="dv-panels-hint">
            Glissez une barre de titre pour déplacer une fenêtre, tirez un bord ou le coin pour la redimensionner.
          </p>
        </div>
      )}
    </div>
  );
}
