'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { useAuth } from '@/app/context/AuthContext';
import { trainerSidebarItems } from '@/app/trainer/nav';
import { Info, Search } from 'lucide-react';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';

type Batch = {
  id: string;
  name: string;
  description?: string | null;
  wave_number?: number | null;
  lob?: string | null;
  is_active?: boolean;
  users_count?: number;
};

type TraineeRecord = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active?: boolean;
  department?: string | null;
  batch?: Batch | null;
  batches?: Batch[];
  batch_ids?: string[];
  batch_names?: string[];
};

type StatusTone = 'success' | 'error' | 'info';
type RosterFilter = 'available' | 'mine' | 'all';
type StatusFilter = 'all' | 'active' | 'inactive';

type RegisteredTraineeRecord = TraineeRecord & {
  is_in_my_class: boolean;
  current_trainer_batch_id?: string | null;
  current_trainer_batch_name?: string | null;
};

const DEFAULT_TRAINEE_PASSWORD = 'SPVTrainee2026';
const BULK_UPLOAD_TEMPLATE_FILENAME = 'trainer-trainee-bulk-upload-template.csv';

export default function TrainerUsersPage() {
  const { token, isAuthenticated, isLoading: isAuthLoading, refreshToken, logout } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [trainees, setTrainees] = useState<TraineeRecord[]>([]);
  const [registeredTrainees, setRegisteredTrainees] = useState<RegisteredTraineeRecord[]>([]);
  const [status, setStatus] = useState<{ tone: StatusTone; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingTrainee, setIsCreatingTrainee] = useState(false);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isSavingTrainee, setIsSavingTrainee] = useState(false);
  const [isRemovingTrainee, setIsRemovingTrainee] = useState(false);
  const [isAssigningRegistered, setIsAssigningRegistered] = useState(false);
  const [isUpdatingTraineeStatus, setIsUpdatingTraineeStatus] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [editingTraineeId, setEditingTraineeId] = useState<string | null>(null);
  const [assignmentBatchId, setAssignmentBatchId] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedRegisteredIds, setSelectedRegisteredIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    email: '',
    full_name: '',
  });
  const [editForm, setEditForm] = useState({
    email: '',
    full_name: '',
    batch_id: '',
  });

  const sidebarItems = trainerSidebarItems();

  const assignmentTargetBatch = useMemo(() => {
    return batches.find((batch) => batch.id === assignmentBatchId) || null;
  }, [batches, assignmentBatchId]);

  const authHeaders = (json = true) => {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchWithAuthRetry = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const sendRequest = async (authToken: string | null) => {
      const nextHeaders = new Headers(init?.headers || undefined);
      if (token || authToken) {
        nextHeaders.set('Authorization', `Bearer ${authToken || token}`);
      }
      return fetch(input, {
        ...init,
        headers: nextHeaders,
        cache: 'no-store',
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

  const showStatus = (tone: StatusTone, message: string) => {
    setStatus({ tone, message });
  };

  const formatBatchLabel = (batch: Batch) => {
    const parts = batch.name ? [batch.name] : [];
    if (!parts.length && typeof batch.wave_number === 'number') {
      parts.push(`Batch ${batch.wave_number}`);
    }
    return parts.join(' | ');
  };

  const formatBatchSummary = (trainee: Pick<TraineeRecord, 'batch_names' | 'batch'>) => {
    if (trainee.batch_names?.length) {
      return trainee.batch_names.join(', ');
    }
    if (trainee.batch) {
      return formatBatchLabel(trainee.batch);
    }
    return 'Not assigned';
  };

  const loadData = async (preserveStatus = false) => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated || !token) {
      setBatches([]);
      setTrainees([]);
      setRegisteredTrainees([]);
      setAssignmentBatchId('');
      setSelectedRegisteredIds([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (!preserveStatus) {
      setStatus(null);
    }

    try {
      const [batchRes, traineeRes, rosterRes] = await Promise.all([
        fetchWithAuthRetry('/api/trainer/batches', { headers: authHeaders() }),
        fetchWithAuthRetry('/api/trainer/trainees', { headers: authHeaders() }),
        fetchWithAuthRetry('/api/trainer/trainees/registry', { headers: authHeaders() }),
      ]);

      if (!batchRes.ok || !traineeRes.ok || !rosterRes.ok) {
        const batchError = !batchRes.ok ? await batchRes.json().catch(() => null) : null;
        const traineeError = !traineeRes.ok ? await traineeRes.json().catch(() => null) : null;
        const rosterError = !rosterRes.ok ? await rosterRes.json().catch(() => null) : null;
        throw new Error(
          batchError?.detail ||
            traineeError?.detail ||
            rosterError?.detail ||
            'Unable to load trainee access data.',
        );
      }

      const batchData = await batchRes.json();
      const traineeData = await traineeRes.json();
      const rosterData = await rosterRes.json();
      const nextBatches = batchData.batches || [];
      const nextRegisteredTrainees = rosterData.trainees || [];

      setBatches(nextBatches);
      setTrainees(traineeData.trainees || []);
      setRegisteredTrainees(nextRegisteredTrainees);
      setAssignmentBatchId((current) =>
        current && nextBatches.some((batch: Batch) => batch.id === current)
          ? current
          : nextBatches[0]?.id || '',
      );
      setSelectedRegisteredIds((current) =>
        current.filter((traineeId) =>
          nextRegisteredTrainees.some((trainee: RegisteredTraineeRecord) => trainee.id === traineeId),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load batches and trainees right now.';
      showStatus('error', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAuthenticated, token]);

  const activeBatches = useMemo(
    () => batches.filter((batch) => batch.is_active !== false),
    [batches],
  );
  const visibleRegisteredTrainees = useMemo(() => {
    const normalizedSearch = rosterSearch.trim().toLowerCase();

    return registeredTrainees.filter((trainee) => {
      const matchesSearch =
        !normalizedSearch ||
        trainee.full_name.toLowerCase().includes(normalizedSearch) ||
        trainee.email.toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (statusFilter === 'active' && trainee.is_active === false) {
        return false;
      }
      if (statusFilter === 'inactive' && trainee.is_active !== false) {
        return false;
      }

      if (rosterFilter === 'mine') {
        return trainee.is_in_my_class;
      }

      if (rosterFilter === 'available') {
        return !trainee.is_in_my_class;
      }

      return true;
    });
  }, [registeredTrainees, rosterFilter, rosterSearch, statusFilter]);
  const assignableRegisteredIds = useMemo(
    () =>
      selectedRegisteredIds.filter((traineeId) => {
        const trainee = registeredTrainees.find((entry) => entry.id === traineeId);
        return (
          !!trainee &&
          trainee.is_active !== false &&
          (!assignmentBatchId || !trainee.batch_ids?.includes(assignmentBatchId))
        );
      }),
    [assignmentBatchId, registeredTrainees, selectedRegisteredIds],
  );
  const visibleRosterStatusCounts = useMemo(
    () =>
      visibleRegisteredTrainees.reduce(
        (counts, trainee) => {
          if (trainee.is_active === false) {
            counts.inactive += 1;
          } else {
            counts.active += 1;
          }
          return counts;
        },
        { active: 0, inactive: 0 },
      ),
    [visibleRegisteredTrainees],
  );

  const createTrainee = async () => {
    setIsCreatingTrainee(true);
    setStatus(null);
    setBulkErrors([]);

    try {
      const res = await fetchWithAuthRetry('/api/trainer/trainees', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          email: form.email,
          full_name: form.full_name,
          role: 'trainee',
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to create trainee account.');
      }

      showStatus(
        'success',
        `Trainee created successfully. Default password: ${data?.temporary_password || DEFAULT_TRAINEE_PASSWORD}`,
      );
      setForm((current) => ({
        ...current,
        email: '',
        full_name: '',
      }));
      await loadData(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create trainee account.';
      showStatus('error', message);
    } finally {
      setIsCreatingTrainee(false);
    }
  };

  const toggleRegisteredTrainee = (traineeId: string, checked: boolean) => {
    setSelectedRegisteredIds((current) => {
      if (checked) {
        return current.includes(traineeId) ? current : [...current, traineeId];
      }

      return current.filter((value) => value !== traineeId);
    });
  };

  const selectVisibleRegisteredTrainees = () => {
    const eligibleIds = visibleRegisteredTrainees
      .filter(
        (trainee) =>
          trainee.is_active !== false &&
          (!assignmentBatchId || !trainee.batch_ids?.includes(assignmentBatchId)),
      )
      .map((trainee) => trainee.id);
    setSelectedRegisteredIds(eligibleIds);
  };

  const clearSelectedRegisteredTrainees = () => {
    setSelectedRegisteredIds([]);
  };

  const assignRegisteredTrainees = async () => {
    if (!assignmentBatchId) {
      showStatus('error', 'Select the batch or wave that should receive the trainee list.');
      return;
    }

    if (!assignableRegisteredIds.length) {
      showStatus('error', 'Select at least one registered trainee to add.');
      return;
    }

    setIsAssigningRegistered(true);
    setStatus(null);
    setBulkErrors([]);

    try {
      const response = await fetchWithAuthRetry(`/api/trainer/batches/${assignmentBatchId}/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          user_ids: assignableRegisteredIds,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to add registered trainees to the selected batch.');
      }

      const batchLabel = assignmentTargetBatch ? formatBatchLabel(assignmentTargetBatch) : 'the selected batch';
      const movedSuffix =
        payload?.moved_users > 0 ? ` ${payload.moved_users} trainee(s) were moved from another batch you manage.` : '';
      showStatus(
        'success',
        `${payload?.added_users || 0} trainee(s) added to ${batchLabel}.${movedSuffix}`,
      );
      setSelectedRegisteredIds([]);
      await loadData(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to add registered trainees to the selected batch.';
      showStatus('error', message);
    } finally {
      setIsAssigningRegistered(false);
    }
  };

  const beginEditingTrainee = (trainee: TraineeRecord) => {
    setStatus(null);
    setBulkErrors([]);
    setEditingTraineeId(trainee.id);
    setEditForm({
      email: trainee.email,
      full_name: trainee.full_name,
      batch_id: trainee.batch?.id || batches[0]?.id || '',
    });
  };

  const cancelEditingTrainee = () => {
    setEditingTraineeId(null);
    setEditForm({
      email: '',
      full_name: '',
      batch_id: '',
    });
  };

  const saveTraineeChanges = async () => {
    if (!editingTraineeId) {
      return;
    }

    setIsSavingTrainee(true);
    setStatus(null);
    setBulkErrors([]);

    try {
      const response = await fetchWithAuthRetry(`/api/trainer/trainees/${editingTraineeId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          email: editForm.email,
          full_name: editForm.full_name,
          role: 'trainee',
          batch_id: editForm.batch_id,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to update trainee account.');
      }

      const updatedName = payload?.trainee?.full_name || editForm.full_name || 'Trainee';
      showStatus('success', `Trainee updated successfully: ${updatedName}`);
      cancelEditingTrainee();
      await loadData(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update trainee account.';
      showStatus('error', message);
    } finally {
      setIsSavingTrainee(false);
    }
  };

  const removeTraineeFromBatch = async (trainee: TraineeRecord) => {
    if (!trainee.batch?.id) {
      showStatus('error', 'No batch found for this trainee.');
      return;
    }

    setIsRemovingTrainee(true);
    setStatus(null);
    setBulkErrors([]);

    try {
      const response = await fetchWithAuthRetry(`/api/trainer/batches/${trainee.batch.id}/users/${trainee.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to remove trainee from batch.');
      }

      showStatus('success', 'Trainee removed from batch. They are now available in Add Existing Registered Trainees.');
      cancelEditingTrainee();
      await loadData(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove trainee from batch.';
      showStatus('error', message);
    } finally {
      setIsRemovingTrainee(false);
    }
  };

  const updateTraineeStatus = async (trainee: TraineeRecord, isActive: boolean) => {
    setIsUpdatingTraineeStatus(trainee.id);
    setStatus(null);
    setBulkErrors([]);

    try {
      const response = await fetchWithAuthRetry(`/api/trainer/trainees/${trainee.id}/status`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ is_active: isActive }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to update trainee status.');
      }

      const action = isActive ? 'activated' : 'deactivated';
      showStatus('success', `Trainee ${action} successfully.`);
      cancelEditingTrainee();
      await loadData(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update trainee status.';
      showStatus('error', message);
    } finally {
      setIsUpdatingTraineeStatus(null);
    }
  };

  const downloadTemplate = async () => {
    setStatus(null);
    setBulkErrors([]);
    setIsDownloadingTemplate(true);

    try {
      const response = await fetchWithAuthRetry('/api/trainer/trainees/bulk-upload-template?format=csv', {
        headers: authHeaders(false),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || 'Failed to download the CSV template.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = BULK_UPLOAD_TEMPLATE_FILENAME;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showStatus('success', `Template downloaded: ${BULK_UPLOAD_TEMPLATE_FILENAME}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download the CSV template.';
      showStatus('error', message);
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const uploadBulkTrainees = async () => {
    if (!selectedFile) {
      showStatus('error', 'Select an Excel or CSV file first.');
      return;
    }

    setIsUploadingBulk(true);
    setStatus(null);
    setBulkErrors([]);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetchWithAuthRetry('/api/trainer/trainees/bulk-upload', {
        method: 'POST',
        headers: authHeaders(false),
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Bulk upload failed.');
      }

      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      setBulkErrors(errors);
      const suffix = errors.length ? ` ${errors.length} row(s) need attention.` : '';
      showStatus(
        errors.length ? 'info' : 'success',
        `${payload?.created || 0} trainee account(s) uploaded using default password ${payload?.temporary_password || DEFAULT_TRAINEE_PASSWORD}.${suffix}`,
      );
      setSelectedFile(null);
      const input = document.getElementById('bulk-upload-file') as HTMLInputElement | null;
      if (input) {
        input.value = '';
      }
      await loadData(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bulk upload failed.';
      showStatus('error', message);
    } finally {
      setIsUploadingBulk(false);
    }
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="trainer">
      <div className="space-y-6">
        <div className="dashboard-hero p-5 sm:p-6 lg:p-7">
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Trainee Access</h2>
          <p className="max-w-3xl text-gray-600">
            Register trainees one by one, bulk upload accounts, activate or deactivate existing trainee records, and
            assign saved batch or wave records to your class list.
          </p>
        </div>

        {status && (
          <div
            className={`rounded-[1.15rem] border px-4 py-3 text-sm shadow-[0_16px_34px_-30px_rgba(15,23,42,0.24)] ${
              status.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : status.tone === 'info'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </div>
        )}

        <div className="grid gap-6">
          <section className="rounded-[1.4rem] border border-border/80 bg-white/95 p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Saved Batches</h3>
                <p className="mt-1 text-sm text-gray-600">
                  These are the batches currently available for trainee assignment. Create new ones from the trainer
                  batches page when needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadData()}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {batches.map((batch) => (
                <div key={batch.id} className="rounded-[1.1rem] border border-gray-200 bg-gray-50 p-3">
                  <div className="font-medium text-gray-900">{batch.name}</div>
                  <div className="mt-1 text-xs text-gray-600">{formatBatchLabel(batch)}</div>
                  {batch.description && (
                    <div className="mt-2 text-xs text-gray-500">{batch.description}</div>
                  )}
                  <div className="mt-2 text-xs text-gray-600">
                    Trainees assigned: <span className="font-semibold text-gray-900">{batch.users_count || 0}</span>
                  </div>
                </div>
              ))}
              {!batches.length && !isLoading && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  No batches created yet. Use the Batches page to create at least one batch before registering trainees.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="rounded-[1.4rem] border border-border/80 bg-white/95 p-5 shadow-sm sm:p-6">
            <h3 className="mb-3 font-semibold text-gray-900">Create Trainee Account</h3>
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Default password: <span className="font-semibold">{DEFAULT_TRAINEE_PASSWORD}</span>
            </div>

            {!batches.length && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                Batch or wave assignment is now handled separately. You can create the trainee account first and add it
                to a saved batch later from the registered trainee roster below.
              </div>
            )}

            <div className="space-y-3">
              <input
                className="w-full rounded border px-3 py-2"
                placeholder="Email address"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
              <input
                className="w-full rounded border px-3 py-2"
                placeholder="Full name"
                value={form.full_name}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
              />
              <input className="w-full rounded border bg-gray-50 px-3 py-2 text-gray-600" value="trainee" readOnly />
              <input
                className="w-full rounded border bg-gray-50 px-3 py-2 text-gray-600"
                value={DEFAULT_TRAINEE_PASSWORD}
                readOnly
              />
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Batch / Wave selection removed from account creation. Use the roster assignment section to place the
                trainee into a batch after the account is created.
              </div>
              <button
                onClick={createTrainee}
                disabled={isCreatingTrainee || !form.email.trim() || !form.full_name.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isCreatingTrainee ? 'Creating Trainee...' : 'Create Trainee'}
              </button>
            </div>
          </section>

          <section className="rounded-[1.4rem] border border-border/80 bg-white/95 p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Bulk Upload Trainees</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Download the template first, fill in the trainee rows, and upload it back to register multiple trainees at once.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={isDownloadingTemplate}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                {isDownloadingTemplate ? 'Downloading...' : 'Download CSV Template'}
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              Expected CSV columns: <span className="font-semibold">Email Address</span>, <span className="font-semibold">Full Name</span>, <span className="font-semibold">Role</span>, <span className="font-semibold">Password</span>, <span className="font-semibold">Wave/Batch</span>.
              <div className="mt-2 text-xs text-gray-500">
                The upload uses the default password <span className="font-semibold">{DEFAULT_TRAINEE_PASSWORD}</span> and matches each row to an existing trainer batch by batch name or wave number.
              </div>
              <div className="mt-2 text-xs text-gray-500">
                The downloaded template contains the correct headers only, so every uploaded trainee row comes from your own prepared source file.
              </div>
            </div>

            <div className="space-y-3">
              <label htmlFor="bulk-upload-file" className="block text-sm font-medium text-gray-700">
                Upload CSV/XLSX File
              </label>
              <input
                id="bulk-upload-file"
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileChange}
                className="w-full rounded border px-3 py-2"
              />
              {selectedFile && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Selected file: <span className="font-semibold text-gray-900">{selectedFile.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={uploadBulkTrainees}
                disabled={isUploadingBulk || !selectedFile}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isUploadingBulk ? 'Uploading...' : 'Upload Bulk File'}
              </button>
              {!!bulkErrors.length && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="font-semibold">Rows that need correction:</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {bulkErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-[1.4rem] border border-border/80 bg-white/95 p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Add Existing Registered Trainees</h3>
              <p className="mt-1 text-sm text-gray-600">
                Review all trainee accounts already saved in the database, then add the selected trainees into one of your existing batch or wave records.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    className="w-full rounded border border-gray-200 pl-10 pr-3 py-2 text-sm md:w-64"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="rounded border border-gray-200 px-3 py-2 text-sm"
                  title="Filter trainees by status"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRosterFilter('available')}
                  className={`rounded border px-3 py-2 text-sm ${
                    rosterFilter === 'available'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Available
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilter('mine')}
                  className={`rounded border px-3 py-2 text-sm ${
                    rosterFilter === 'mine'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  In My Class
                </button>
                <button
                  type="button"
                  onClick={() => setRosterFilter('all')}
                  className={`rounded border px-3 py-2 text-sm ${
                    rosterFilter === 'all'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All Registered
                </button>
              </div>
            </div>
          </div>

          {!batches.length && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Create a batch first before adding registered trainees into your class list.
            </div>
          )}

          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-sky-700">Trainee Status Management</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Search by trainee name or email, filter by active or inactive status, update trainee activation from
                  this roster, and only add active trainees to the selected batch.
                </p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                Active {visibleRosterStatusCounts.active} | Inactive {visibleRosterStatusCounts.inactive}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Search Name Or Email
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full rounded border bg-white pl-9 pr-3 py-2"
                    placeholder="Search registered trainees by name or email"
                    value={rosterSearch}
                    onChange={(event) => setRosterSearch(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Status
                </label>
                <select
                  className="w-full rounded border bg-white px-3 py-2"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  title="Filter trainees by status"
                >
                  <option value="all">All trainees</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Target Batch / Wave
                </label>
                <select
                  className="w-full rounded border bg-white px-3 py-2"
                  value={assignmentBatchId}
                  onChange={(event) => setAssignmentBatchId(event.target.value)}
                  disabled={!activeBatches.length}
                  title="Select target batch for trainee assignment"
                >
                  <option value="">{activeBatches.length ? 'Select target batch / wave' : 'No active batches available'}</option>
                  {activeBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {formatBatchLabel(batch)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 self-end">
                <button
                  type="button"
                  onClick={selectVisibleRegisteredTrainees}
                  disabled={!visibleRegisteredTrainees.length}
                  className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Select Visible
                </button>
                <button
                  type="button"
                  onClick={clearSelectedRegisteredTrainees}
                  disabled={!selectedRegisteredIds.length}
                  className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs text-gray-600">
              Showing <span className="font-semibold text-gray-900">{visibleRegisteredTrainees.length}</span> of{' '}
              <span className="font-semibold text-gray-900">{registeredTrainees.length}</span> registered trainees.
              {' '}Active: <span className="font-semibold text-gray-900">{visibleRosterStatusCounts.active}</span>.
              {' '}Inactive: <span className="font-semibold text-gray-900">{visibleRosterStatusCounts.inactive}</span>.
              {' '}Selected for add-to-batch: <span className="font-semibold text-gray-900">{assignableRegisteredIds.length}</span>.
              {assignmentTargetBatch && (
                <>
                  {' '}Target batch: <span className="font-semibold text-gray-900">{formatBatchLabel(assignmentTargetBatch)}</span>.
                </>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2 max-h-[440px] overflow-y-auto">
            {visibleRegisteredTrainees.map((trainee) => {
              const isSelected = selectedRegisteredIds.includes(trainee.id);
              const alreadyInTargetBatch = !!assignmentBatchId && trainee.batch_ids?.includes(assignmentBatchId);
              const isInactive = trainee.is_active === false;

              return (
                <label
                  key={trainee.id}
                  className={`flex cursor-pointer flex-col gap-3 rounded-lg border p-3 transition md:flex-row md:items-start md:justify-between ${
                    isInactive
                      ? 'border-gray-200 bg-gray-100 text-gray-600'
                      : alreadyInTargetBatch
                        ? 'border-emerald-200 bg-emerald-50'
                        : isSelected
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                  title={isInactive ? 'Inactive trainees must be reactivated before joining a batch.' : undefined}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                      checked={isSelected}
                      disabled={alreadyInTargetBatch || isInactive}
                      onChange={(event) => {
                        if (!alreadyInTargetBatch && !isInactive) {
                          toggleRegisteredTrainee(trainee.id, event.target.checked);
                        }
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900">{trainee.full_name}</div>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            isInactive
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {isInactive ? 'Inactive' : 'Active'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">{trainee.email}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        Status: {isInactive ? 'Inactive' : 'Active'} | Current batches: {formatBatchSummary(trainee)}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {alreadyInTargetBatch
                          ? 'This trainee is already assigned to the selected batch.'
                          : isInactive
                            ? 'This trainee must be reactivated before batch assignment.'
                            : 'This trainee can be added to the selected batch.'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-1 font-medium ${
                        isInactive
                          ? 'border border-gray-300 bg-gray-100 text-gray-700'
                          : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {isInactive ? 'Inactive' : 'Active'}
                    </span>
                    {alreadyInTargetBatch ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                        Already in target batch
                      </span>
                    ) : trainee.is_in_my_class ? (
                      <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-1 font-medium text-blue-700">
                        Already in your class
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-1 font-medium text-amber-700">
                        Available to add
                      </span>
                    )}
                    {isInactive && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-700"
                        title="Inactive trainees must be reactivated before joining a batch."
                        aria-label="Inactive trainees must be reactivated before joining a batch."
                      >
                        <Info className="h-3.5 w-3.5" />
                        Inactive trainees must be reactivated
                      </span>
                    )}
                    {!trainee.batch_names?.length && (
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 font-medium text-slate-700">
                        No batch yet
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void updateTraineeStatus(trainee, trainee.is_active === false);
                      }}
                      disabled={isUpdatingTraineeStatus === trainee.id}
                      className={`rounded-full px-3 py-1 font-medium transition ${
                        isInactive
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {isUpdatingTraineeStatus === trainee.id
                        ? 'Updating...'
                        : isInactive
                          ? 'Activate'
                          : 'Deactivate'}
                    </button>
                  </div>
                </label>
              );
            })}

            {!visibleRegisteredTrainees.length && !isLoading && (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                No registered trainees matched the current filter.
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={assignRegisteredTrainees}
              disabled={isAssigningRegistered || !batches.length || !assignmentBatchId || !assignableRegisteredIds.length}
              className="rounded-xl bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isAssigningRegistered ? 'Adding Trainees...' : 'Add Selected Trainees to Batch'}
            </button>
            <div className="text-xs text-gray-500">
              Trainers can add already registered trainees here without recreating the account, and the batch membership will drive coaching, MCQ, analytics, and report visibility.
            </div>
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-border/80 bg-white/95 p-5 shadow-sm sm:p-6">
          <h3 className="mb-3 font-semibold text-gray-900">Assigned Trainees</h3>
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {trainees.map((trainee) => (
              <div key={trainee.id} className="rounded-[1.1rem] border p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-gray-900">{trainee.full_name}</div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          trainee.is_active === false
                            ? 'border border-gray-300 bg-gray-100 text-gray-700'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {trainee.is_active === false ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">{trainee.email}</div>
                    <div className="mt-1 text-xs text-gray-600">
                      Role: {trainee.role} | Batch: {formatBatchSummary(trainee)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => beginEditingTrainee(trainee)}
                    className="rounded border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Modify
                  </button>
                </div>

                {editingTraineeId === trainee.id && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-blue-900">
                      Update trainee information and reassign batch / wave
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        className="w-full rounded border border-blue-200 bg-white px-3 py-2"
                        placeholder="Email address"
                        value={editForm.email}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, email: event.target.value }))
                        }
                      />
                      <input
                        className="w-full rounded border border-blue-200 bg-white px-3 py-2"
                        placeholder="Full name"
                        value={editForm.full_name}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, full_name: event.target.value }))
                        }
                      />
                      <input
                        className="w-full rounded border border-blue-200 bg-slate-100 px-3 py-2 text-slate-600"
                        value="trainee"
                        readOnly
                      />
                      <select
                        className="w-full rounded border border-blue-200 bg-white px-3 py-2"
                        value={editForm.batch_id}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, batch_id: event.target.value }))
                        }
                        disabled={!activeBatches.length}
                        title="Select batch for trainee assignment"
                      >
                        <option value="">{activeBatches.length ? 'Select batch / wave' : 'No active batches available'}</option>
                        {activeBatches.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {formatBatchLabel(batch)}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Status:</label>
                        <button
                          type="button"
                          onClick={() => {
                            const trainee = trainees.find((t) => t.id === editingTraineeId);
                            if (trainee) {
                              void updateTraineeStatus(trainee, trainee.is_active === false);
                            }
                          }}
                          disabled={isUpdatingTraineeStatus === trainee.id}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            trainees.find((t) => t.id === editingTraineeId)?.is_active
                              ? 'bg-green-600'
                              : 'bg-gray-200'
                          }`}
                          aria-label={`Toggle trainee status to ${trainees.find((t) => t.id === editingTraineeId)?.is_active ? 'inactive' : 'active'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              trainees.find((t) => t.id === editingTraineeId)?.is_active
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="text-sm text-gray-600">
                          {trainees.find((t) => t.id === editingTraineeId)?.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {isUpdatingTraineeStatus === trainee.id && (
                          <span className="text-xs text-blue-600">Updating...</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={saveTraineeChanges}
                        disabled={isSavingTrainee || !editForm.batch_id || isRemovingTrainee}
                        className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        {isSavingTrainee ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const trainee = trainees.find((t) => t.id === editingTraineeId);
                          if (trainee) {
                            void removeTraineeFromBatch(trainee);
                          }
                        }}
                        disabled={isRemovingTrainee || isSavingTrainee}
                        className="rounded border border-red-200 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isRemovingTrainee ? 'Removing...' : 'Remove from Batch'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingTrainee}
                        disabled={isSavingTrainee || isRemovingTrainee}
                        className="rounded border border-blue-200 bg-white px-4 py-2 text-sm text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!trainees.length && !isLoading && (
              <div className="text-sm text-gray-500">
                No trainee accounts created yet for your batches.
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
