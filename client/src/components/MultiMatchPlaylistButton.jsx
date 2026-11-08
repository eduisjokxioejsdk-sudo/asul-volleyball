// Montage multi-matchs : envoie des actions filtrées (de plusieurs matchs) vers une
// nouvelle playlist vidéo. Crée toujours une NOUVELLE playlist.

import { useState } from 'react';
import { playlistsAPI } from '../services/api';
import { getAdaptiveMargins } from '../utils/datavolley';
import { playlistItemsFromActions } from '../utils/multiMatch';

export default function MultiMatchPlaylistButton({ actions = [], label = 'Montage', matchLabelOf = null }) {
  const [state, setState] = useState({ busy: false, message: '', ok: true });
  const { items, skipped } = playlistItemsFromActions(actions, getAdaptiveMargins, matchLabelOf);

  const send = async () => {
    setState({ busy: true, message: '', ok: true });
    try {
      const res = await playlistsAPI.create({
        name: `${label} — ${new Date().toLocaleDateString('fr-FR')}`,
        description: `${items.length} séquence(s) issue(s) de plusieurs matchs`,
      });
      const id = res.data?.playlist?.id;
      if (!id) throw new Error('Playlist créée sans identifiant');
      await playlistsAPI.addItems(id, items);
      setState({ busy: false, ok: true, message: `Playlist créée : ${items.length} séquence(s).` });
    } catch (err) {
      setState({ busy: false, ok: false, message: err.response?.data?.error || err.message || 'Création impossible.' });
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={state.busy || items.length === 0} onClick={send}>
        Créer une playlist vidéo ({items.length})
      </button>
      {skipped > 0 && <p className="dv-hint" style={{ margin: '4px 0 0' }}>{skipped} action(s) ignorée(s) : sans moment vidéo.</p>}
      {state.message && <p className="dv-hint" style={{ margin: '4px 0 0', color: state.ok ? undefined : '#f87171' }}>{state.message}</p>}
    </div>
  );
}
