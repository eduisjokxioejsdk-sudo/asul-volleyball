import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const ClubContext = createContext({
  clubs: [],
  activeClub: null,
  switchingClub: false,
  selectClub: async () => null,
  refreshClubs: async () => [],
});

function detailRedirectPath(pathname) {
  if (/^\/datavolley\/[^/]+$/.test(pathname)) {
    const sub = pathname.slice('/datavolley/'.length);
    if (!['multi', 'distribution', 'auto-codes'].includes(sub)) {
      return '/datavolley';
    }
  }
  if (/^\/trajectories\/.+/.test(pathname)) return '/trajectories';
  if (/^\/live\/.+/.test(pathname)) return '/direct?tab=advanced';
  if (/^\/fast-direct\/(?!join\/).+/.test(pathname)) return '/direct';
  return null;
}

export function ClubProvider({ user, clubs = [], onClubsLoaded, onUserUpdated, children }) {
  const [switchingClub, setSwitchingClub] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const activeClub = useMemo(() => {
    if (!user?.club_id || !Array.isArray(clubs)) return null;
    return clubs.find((c) => c.id === user.club_id) || null;
  }, [clubs, user?.club_id]);

  const refreshClubs = useCallback(async () => {
    try {
      const res = await authAPI.getClubs();
      const list = res.data?.clubs || [];
      if (onClubsLoaded) onClubsLoaded(list);
      return list;
    } catch {
      return clubs;
    }
  }, [clubs, onClubsLoaded]);

  const selectClub = useCallback(
    async (clubId, { redirectTo = null } = {}) => {
      if (!clubId || switchingClub) return null;
      setSwitchingClub(true);
      try {
        const res = await authAPI.selectClub(clubId);
        const updatedUser = res.data?.user;
        const newToken = res.data?.token;
        if (updatedUser && onUserUpdated) {
          onUserUpdated(updatedUser, newToken);
        }
        const target = redirectTo || detailRedirectPath(location.pathname);
        if (target) {
          navigate(target, { replace: true });
        }
        return res.data?.club || null;
      } finally {
        setSwitchingClub(false);
      }
    },
    [location.pathname, navigate, onUserUpdated, switchingClub]
  );

  const value = useMemo(
    () => ({
      clubs,
      activeClub,
      switchingClub,
      selectClub,
      refreshClubs,
    }),
    [clubs, activeClub, switchingClub, selectClub, refreshClubs]
  );

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClub() {
  return useContext(ClubContext);
}
