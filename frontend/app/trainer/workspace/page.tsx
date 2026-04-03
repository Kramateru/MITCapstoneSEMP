'use client';

import { useEffect, useState } from 'react';

import WorkspaceEditor from '@/app/components/WorkspaceEditor';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { trainerSidebarItems } from '@/app/trainer/nav';

type WorkspaceRecord = {
  id: string;
  name: string;
};

export default function TrainerWorkspacePage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        setIsLoading(true);
        setError('');

        const token = localStorage.getItem('token');
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

        const listResponse = await fetch('/api/workspace', {
          headers: authHeaders,
          cache: 'no-store',
        });
        if (!listResponse.ok) {
          throw new Error('Unable to load trainer workspace.');
        }

        const workspaces: WorkspaceRecord[] = await listResponse.json();
        let workspace = workspaces[0];

        if (!workspace) {
          const createResponse = await fetch('/api/workspace', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authHeaders || {}),
            },
            body: JSON.stringify({
              name: 'Trainer Workspace',
            }),
          });
          if (!createResponse.ok) {
            throw new Error('Unable to create a trainer workspace.');
          }
          workspace = await createResponse.json();
        }

        setWorkspaceId(workspace.id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load trainer workspace.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadWorkspace();
  }, []);

  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      {isLoading ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Loading workspace configuration from the database...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : workspaceId ? (
        <WorkspaceEditor workspaceId={workspaceId} />
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No workspace record is available for this account yet.
        </div>
      )}
    </DashboardLayout>
  );
}
