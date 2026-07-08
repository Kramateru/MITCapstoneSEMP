'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';

export interface LobOption {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  active_users_count?: number;
  scenario_count?: number;
  batch_count?: number;
  course_count?: number;
}

export function useLobCatalog() {
  const { token, isLoading: isAuthLoading, isAuthenticated, refreshToken } = useAuth();
  const [lobs, setLobs] = useState<LobOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLobsWithToken = async (authToken: string) =>
    fetch('/api/auth/lobs', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

  const loadLobs = async () => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated || !token) {
      setLobs([]);
      setError('');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let response = await fetchLobsWithToken(token);

      if (response.status === 401) {
        const nextToken = await refreshToken();
        if (!nextToken) {
          throw new Error('Session expired. Please sign in again.');
        }
        response = await fetchLobsWithToken(nextToken);
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || 'Failed to load LOB catalog.');
      }

      const data = await response.json();
      setLobs(data.lobs || []);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Unable to load the LOB catalog right now.';
      setError(message);
      setLobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLobs();
  }, [isAuthLoading, isAuthenticated, token]);

  return {
    lobs,
    isLoading,
    error,
    reloadLobs: loadLobs,
  };
}
