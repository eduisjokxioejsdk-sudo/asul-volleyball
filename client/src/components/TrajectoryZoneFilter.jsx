// ============================================================================
// Sélecteur du poste de départ des attaques : zone 4, 3, 2 (avant) ou zones
// arrière. Sert à trier les flèches d'attaque selon l'endroit d'où part la
// frappe, dans le repère de l'équipe marquée.
// ============================================================================

import { ATTACK_START_ZONES } from '../utils/trajectory.js';
import { Target } from './icons';

/**
 * @param {Object} props
 * @param {string} props.value 'all' ou l'identifiant d'un poste ('4','3','2','arriere')
 * @param {(id:string)=>void} props.onChange
 */
export default function TrajectoryZoneFilter({ value, onChange }) {
  return (
    <label className="tj-zone-filter" title="Trier les attaques selon l’endroit d’où part la flèche">
      <Target size={14} />
      <span className="tj-zone-filter-label">Poste de départ</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">Tous</option>
        {ATTACK_START_ZONES.map((z) => (
          <option key={z.id} value={z.id}>{z.label}</option>
        ))}
      </select>
    </label>
  );
}
