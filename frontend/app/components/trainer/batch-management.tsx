'use client';

import { useAuth } from '@/app/context/AuthContext';
import { ArrowRight, PencilLine, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

type TrainerBatch = {
  id: string;
  name: string;
  description?: string | null;
  wave_number?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  lob?: string | null;
  is_active?: boolean;
  users_count?: number;
  created_at?: string;
};

type BatchFormState = {
  name: string;
  wave_number: string;
  description: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const emptyBatchForm = (): BatchFormState => ({
  name: '',
  wave_number: '',
  description: '',
  start_date: '',
  end_date: '',
  is_active: true,
});

export default function BatchManagement() {
  const { token, isAuthenticated, isLoading: isAuthLoading, refreshToken, logout } = useAuth();
  const [batches, setBatches] = useState<TrainerBatch[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [editingBatch, setEditingBatch] = useState<TrainerBatch | null>(null);
  const [batchForm, setBatchForm] = useState<BatchFormState>(emptyBatchForm());

  const authHeaders = () => {
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchWithAuthRetry = async (input: RequestInfo | URL, init?: RequestInit) => {
    const sendRequest = async (authToken: string | null) => {
      const nextHeaders = new Headers(init?.headers || undefined);
      if (authToken || token) {
        nextHeaders.set('Authorization', `Bearer ${authToken || token}`);
      }
      return fetch(input, {
        ...init,
        headers: nextHeaders,
      });
    };

    let response = await sendRequest(token);
    if (response.status !== 401) {
      return response;
    }

    const nextToken = await refreshToken();
    if (!nextToken) {
      throw new Error('Session expired. Please sign in again.');
    }

    response = await sendRequest(nextToken);
    if (response.status === 401) {
      logout();
      throw new Error('Session expired. Please sign in again.');
    }

    return response;
  };

  const loadBatches = async () => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated || !token) {
      setBatches([]);
      return;
    }

    try {
      const response = await fetchWithAuthRetry('/api/trainer/batches', {
        headers: authHeaders(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || 'Failed to load batches.');
      }

      const payload = await response.json();
      setBatches(payload.batches || []);
    } catch (error) {
      console.error('Error loading trainer batches:', error);
      toast.error('Unable to load trainer batches right now.');
    }
  };

  useEffect(() => {
    void loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAuthenticated, token]);

  const buildBatchPayload = () => ({
    name: batchForm.name.trim() || undefined,
    wave_number: batchForm.wave_number ? Number(batchForm.wave_number) : undefined,
    description: batchForm.description.trim() || undefined,
    start_date: batchForm.start_date || undefined,
    end_date: batchForm.end_date || undefined,
  });

  const validateBatchForm = () => {
    if (!batchForm.name.trim() && !batchForm.wave_number.trim()) {
      toast.error('Enter a batch name or a batch number.');
      return false;
    }
    if (batchForm.start_date && batchForm.end_date && batchForm.end_date < batchForm.start_date) {
      toast.error('End date cannot be earlier than start date.');
      return false;
    }
    return true;
  };

  const resetBatchForm = () => {
    setBatchForm(emptyBatchForm());
  };

  const openCreateDialog = () => {
    resetBatchForm();
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (batch: TrainerBatch) => {
    setEditingBatch(batch);
    setBatchForm({
      name: batch.name || '',
      wave_number: typeof batch.wave_number === 'number' ? String(batch.wave_number) : '',
      description: batch.description || '',
      start_date: batch.start_date ? String(batch.start_date).slice(0, 10) : '',
      end_date: batch.end_date ? String(batch.end_date).slice(0, 10) : '',
      is_active: batch.is_active !== false,
    });
  };

  const handleCreateBatch = async () => {
    if (!validateBatchForm()) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetchWithAuthRetry('/api/trainer/batches', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(buildBatchPayload()),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to create batch.');
      }

      resetBatchForm();
      setIsCreateDialogOpen(false);
      toast.success(`Batch created: ${payload?.name || 'New batch'}`);
      await loadBatches();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create batch.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch) {
      return;
    }
    if (!validateBatchForm()) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetchWithAuthRetry(`/api/trainer/batches/${editingBatch.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(buildBatchPayload()),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to update batch.');
      }

      const updatedLabel = payload?.batch?.name || formatBatchLabel(editingBatch);
      resetBatchForm();
      setEditingBatch(null);
      toast.success(`Batch updated: ${updatedLabel}`);
      await loadBatches();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update batch.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBatchStatus = async (batch: TrainerBatch) => {
    setIsSaving(true);

    try {
      const response = await fetchWithAuthRetry(`/api/trainer/batches/${batch.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          name: batch.name,
          description: batch.description,
          wave_number: batch.wave_number,
          start_date: batch.start_date || undefined,
          end_date: batch.end_date || undefined,
          lob: batch.lob,
          is_active: !batch.is_active,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to update batch status.');
      }

      const statusText = !batch.is_active ? 'activated' : 'deactivated';
      toast.success(`Batch ${statusText}: ${formatBatchLabel(batch)}`);
      await loadBatches();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update batch status.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBatch = async (batch: TrainerBatch) => {
    const batchLabel = formatBatchLabel(batch);
    const confirmed = window.confirm(
      `Delete "${batchLabel}"?\n\nThis will remove trainees from the batch, delete batch-level course assignments, and keep trainee microlearning work by removing only the batch link.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingBatchId(batch.id);

    try {
      const response = await fetchWithAuthRetry(`/api/trainer/batches/${batch.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to delete batch.');
      }

      if (editingBatch?.id === batch.id) {
        setEditingBatch(null);
        resetBatchForm();
      }

      toast.success(
        `Batch deleted: ${batchLabel}. ${payload?.removed_trainees || 0} trainee(s) removed, ${payload?.deleted_course_assignments || 0} batch course assignment(s) deleted.`,
      );
      await loadBatches();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete batch.';
      toast.error(message);
    } finally {
      setDeletingBatchId(null);
    }
  };

  const formatBatchLabel = (batch: TrainerBatch) => {
    const parts: string[] = [];
    if (batch.name) {
      parts.push(batch.name);
    }
    if (typeof batch.wave_number === 'number') {
      parts.push(`Wave ${batch.wave_number}`);
    }
    return parts.join(' | ') || 'Unnamed batch';
  };

  const formatBatchWindow = (batch: TrainerBatch) => {
    if (!batch.start_date && !batch.end_date) {
      return 'Dates not set';
    }
    const start = batch.start_date ? new Date(batch.start_date).toLocaleDateString() : 'Open start';
    const end = batch.end_date ? new Date(batch.end_date).toLocaleDateString() : 'Open end';
    return `${start} - ${end}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Batch & User Mapping</CardTitle>
              <CardDescription>
                Manage the live batches used across trainee registration, assignments, and reporting, including batch
                edits and removals.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void loadBatches()}>
                <RefreshCw className="size-4 mr-2" />
                Refresh
              </Button>
              <Dialog
                open={isCreateDialogOpen}
                onOpenChange={(open) => {
                  setIsCreateDialogOpen(open);
                  if (!open) {
                    resetBatchForm();
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button onClick={openCreateDialog}>
                    <Plus className="size-4 mr-2" />
                    Create Batch
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Batch</DialogTitle>
                    <DialogDescription>Create a batch name, a batch number, or both for trainee assignment.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="batch-name">Batch Name</Label>
                      <Input
                        id="batch-name"
                        placeholder="For example Wave 12 - CSR"
                        value={batchForm.name}
                        onChange={(event) => setBatchForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="batch-wave">Batch Number</Label>
                      <Input
                        id="batch-wave"
                        placeholder="For example 12"
                        inputMode="numeric"
                        value={batchForm.wave_number}
                        onChange={(event) =>
                          setBatchForm((current) => ({
                            ...current,
                            wave_number: event.target.value.replace(/[^0-9]/g, ''),
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="batch-description">Description</Label>
                      <Input
                        id="batch-description"
                        placeholder="Optional batch description"
                        value={batchForm.description}
                        onChange={(event) => setBatchForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="batch-start-date">Start Date</Label>
                        <Input
                          id="batch-start-date"
                          type="date"
                          value={batchForm.start_date}
                          onChange={(event) => setBatchForm((current) => ({ ...current, start_date: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="batch-end-date">End Date</Label>
                        <Input
                          id="batch-end-date"
                          type="date"
                          value={batchForm.end_date}
                          onChange={(event) => setBatchForm((current) => ({ ...current, end_date: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="batch-active"
                        checked={batchForm.is_active}
                        onChange={(event) => setBatchForm((current) => ({ ...current, is_active: event.target.checked }))}
                        className="rounded"
                      />
                      <Label htmlFor="batch-active">Active batch (can be selected for trainee assignment)</Label>
                    </div>
                    <Button onClick={() => void handleCreateBatch()} className="w-full" disabled={isSaving}>
                      {isSaving ? 'Creating Batch...' : 'Create Batch'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {batches.map((batch) => (
              <div key={batch.id} className="rounded-lg border p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{formatBatchLabel(batch)}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {typeof batch.wave_number === 'number' && (
                        <Badge variant="outline">Wave {batch.wave_number}</Badge>
                      )}
                      <Badge variant={batch.is_active ? "default" : "secondary"}>
                        {batch.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">
                        <Users className="size-3 mr-1" />
                        {batch.users_count || 0} trainees
                      </Badge>
                    </div>
                    {batch.description && (
                      <p className="mt-2 text-sm text-slate-600">{batch.description}</p>
                    )}
                    <p className="mt-2 text-sm text-slate-500">Batch window: {formatBatchWindow(batch)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleToggleBatchStatus(batch)}
                      disabled={isSaving}
                    >
                      {batch.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(batch)}>
                      <PencilLine className="size-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deletingBatchId === batch.id}
                      onClick={() => void handleDeleteBatch(batch)}
                    >
                      <Trash2 className="size-4 mr-2" />
                      {deletingBatchId === batch.id ? 'Deleting...' : 'Delete'}
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/trainer/users">
                        Open Trainee Access
                        <ArrowRight className="size-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  <span>{formatBatchLabel(batch)}</span>
                  {batch.created_at && (
                    <>
                      <span className="mx-2">-</span>
                      <span>Created: {new Date(batch.created_at).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!batches.length && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                No trainer batches found yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!editingBatch}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBatch(null);
            resetBatchForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Batch</DialogTitle>
            <DialogDescription>Update the saved batch label or batch number used across your trainer navigation and reports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-batch-name">Batch Name</Label>
              <Input
                id="edit-batch-name"
                placeholder="For example Wave 12 - CSR"
                value={batchForm.name}
                onChange={(event) => setBatchForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-batch-wave">Batch Number</Label>
              <Input
                id="edit-batch-wave"
                placeholder="For example 12"
                inputMode="numeric"
                value={batchForm.wave_number}
                onChange={(event) =>
                  setBatchForm((current) => ({
                    ...current,
                    wave_number: event.target.value.replace(/[^0-9]/g, ''),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-batch-description">Description</Label>
              <Input
                id="edit-batch-description"
                placeholder="Optional batch description"
                value={batchForm.description}
                onChange={(event) => setBatchForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-batch-start-date">Start Date</Label>
                <Input
                  id="edit-batch-start-date"
                  type="date"
                  value={batchForm.start_date}
                  onChange={(event) => setBatchForm((current) => ({ ...current, start_date: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-batch-end-date">End Date</Label>
                <Input
                  id="edit-batch-end-date"
                  type="date"
                  value={batchForm.end_date}
                  onChange={(event) => setBatchForm((current) => ({ ...current, end_date: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-batch-active"
                checked={batchForm.is_active}
                onChange={(event) => setBatchForm((current) => ({ ...current, is_active: event.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="edit-batch-active">Active batch (can be selected for trainee assignment)</Label>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setEditingBatch(null);
                  resetBatchForm();
                }}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={() => void handleUpdateBatch()} disabled={isSaving}>
                {isSaving ? 'Saving Batch...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
