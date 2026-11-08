// Envoie les services et attaques codés (avec direction) vers une nouvelle fiche
// de trajectoire, pour les retrouver dans le module Trajectoires et le rapport
// global d'équipe. Crée toujours une NOUVELLE fiche : aucune fiche existante
// n'est modifiée.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trajectoryAPI } from '../services/api';
import { actionsToTrajectoryShots } from '../utils/dvTrajectories';

export default function SendToTrajectoryButton({ actions = [], setMap = null, video = null, name = '' }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ busy: false, message: '', ok: true });
  const homeId = Number(video?.home_team_id) || null;
  const awayId = Number(video?.away_team_id) || null;
  const { shots, skipped } = actionsToTrajectoryShots(actions, setMap);
  const disabled = state.busy || shots.length === 0 || (!homeId && !awayId);

  const send = async () => {
    setState({ busy: true, message: '', ok: true });
    try {
      const created = await trajectoryAPI.create(
        name || `${video?.team1_name || 'Domicile'} vs ${video?.team2_name || 'Extérieur'} (DataVolley)`,
        homeId,
        awayId && awayId !== homeId ? awayId : null,
        video?.id ?? null
      );
      const matchId = created.data?.match?.id ?? created.data?.id;
      if (!matchId) throw new Error('Fiche créée sans identifiant');
      await trajectoryAPI.saveShots(matchId, shots);
      setState({ busy: false, ok: true, message: `${shots.length} flèche(s) envoyée(s).` });
      navigate(`/trajectories/${matchId}`);
    } catch (err) {
      setState({ busy: false, ok: false, message: err.response?.data?.error || err.message || 'Envoi impossible.' });
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={send}>
        Envoyer vers une fiche de trajectoires ({shots.length})
      </button>
      {!homeId && !awayId && (
        <p className="dv-hint" style={{ margin: '4px 0 0' }}>
          Associez au moins une équipe de la base à la vidéo pour activer l’envoi.
        </p>
      )}
      {skipped > 0 && (
        <p className="dv-hint" style={{ margin: '4px 0 0' }}>
          {skipped} action(s) ignorée(s) : direction ou numéro de joueur manquant.
        </p>
      )}
      {state.message && (
        <p className="dv-hint" style={{ margin: '4px 0 0', color: state.ok ? undefined : '#f87171' }}>{state.message}</p>
      )}
    </div>
  );
}
