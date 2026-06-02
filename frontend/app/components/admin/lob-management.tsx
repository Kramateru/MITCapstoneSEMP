'use client';

import { useState } from 'react';
import {
  Building2,
  Edit,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { useLobCatalog, type LobOption } from '@/app/hooks/useLobCatalog';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';

type LobFormState = {
  name: string;
  description: string;
};

const EMPTY_FORM: LobFormState = {
  name: '',
  description: '',
};

export default function LOBManagement() {
  const { lobs, isLoading, error, reloadLobs } = useLobCatalog();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingLob, setEditingLob] = useState<LobOption | null>(null);
  const [form, setForm] = useState<LobFormState>(EMPTY_FORM);

  const authHeaders = () => {
    const token = sessionStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const resetDialog = () => {
    setEditingLob(null);
    setForm(EMPTY_FORM);
  };

  const openCreateDialog = () => {
    resetDialog();
    setIsDialogOpen(true);
  };

  const openEditDialog = (lob: LobOption) => {
    setEditingLob(lob);
    setForm({
      name: lob.name,
      description: lob.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      resetDialog();
    }
  };

  const refreshLobs = async () => {
    setIsRefreshing(true);
    await reloadLobs();
    setIsRefreshing(false);
  };

  const submitLob = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
    };

    if (!payload.name || !payload.description) {
      toast.error('Please enter both the LOB name and description.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        editingLob ? `/api/admin/lob/${editingLob.id}` : '/api/admin/lob',
        {
          method: editingLob ? 'PUT' : 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to save the LOB.');
      }

      toast.success(
        editingLob
          ? 'LOB updated in the database successfully.'
          : 'LOB created in the database successfully.',
      );
      await reloadLobs();
      handleDialogChange(false);
    } catch (submitError) {
      console.error('Error saving LOB:', submitError);
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to save the LOB right now.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLob = async (lob: LobOption) => {
    const confirmed = window.confirm(
      `Deactivate "${lob.name}" from the live LOB catalog?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/lob/${lob.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to deactivate the LOB.');
      }

      toast.success('LOB deactivated successfully.');
      await reloadLobs();
    } catch (deleteError) {
      console.error('Error deleting LOB:', deleteError);
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to deactivate the LOB right now.',
      );
    }
  };

  const totalUsers = lobs.reduce(
    (sum, lob) => sum + (lob.active_users_count || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Line of Business (LOB) Management</CardTitle>
              <CardDescription>
                Maintain the live LOB catalog used for scenario, user, and batch selection across the system.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshLobs()}
                disabled={isRefreshing || isLoading}
              >
                {isRefreshing ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Refresh
              </Button>

              <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
                <DialogTrigger asChild>
                  <Button type="button" onClick={openCreateDialog}>
                    <Plus className="mr-2 size-4" />
                    Add LOB
                  </Button>
                </DialogTrigger>
                <DialogContent size="sm">
                  <DialogHeader>
                    <DialogTitle>
                      {editingLob ? 'Modify LOB' : 'Create New LOB'}
                    </DialogTitle>
                    <DialogDescription>
                      {editingLob
                        ? 'Update the selected line of business and save the changes to the database.'
                        : 'Add a new line of business to the live database catalog.'}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="lob-name">LOB Name</Label>
                      <Input
                        id="lob-name"
                        placeholder="e.g., Customer Service"
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lob-description">Description</Label>
                      <Textarea
                        id="lob-description"
                        placeholder="Describe the purpose and scope of this LOB"
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        rows={4}
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => void submitLob()}
                      disabled={isSubmitting}
                      className="w-full"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Saving...
                        </>
                      ) : editingLob ? (
                        'Save Changes'
                      ) : (
                        'Create LOB'
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Active LOBs</p>
                <p className="mt-2 text-3xl font-bold">{lobs.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Assigned Users</p>
                <p className="mt-2 text-3xl font-bold">{totalUsers}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Scenario Coverage</p>
                <p className="mt-2 text-3xl font-bold">
                  {lobs.reduce((sum, lob) => sum + (lob.scenario_count || 0), 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Batch Usage</p>
                <p className="mt-2 text-3xl font-bold">
                  {lobs.reduce((sum, lob) => sum + (lob.batch_count || 0), 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {lobs.map((lob) => (
                  <Card key={lob.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                            <Building2 className="size-5" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{lob.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {lob.course_count || 0} courses linked
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openEditDialog(lob)}
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-red-600"
                            onClick={() => void handleDeleteLob(lob)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4 text-sm text-muted-foreground">
                        {lob.description}
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-muted-foreground">Users</p>
                          <p className="mt-1 font-semibold">
                            {lob.active_users_count || 0}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-muted-foreground">Scenarios</p>
                          <p className="mt-1 font-semibold">
                            {lob.scenario_count || 0}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-muted-foreground">Batches</p>
                          <p className="mt-1 font-semibold">
                            {lob.batch_count || 0}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-muted-foreground">Courses</p>
                          <p className="mt-1 font-semibold">
                            {lob.course_count || 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>LOB Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Assigned Users</TableHead>
                      <TableHead>Scenarios</TableHead>
                      <TableHead>Batches</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lobs.map((lob) => (
                      <TableRow key={lob.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            <Building2 className="size-4 text-blue-600" />
                            {lob.name}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xl text-sm text-muted-foreground">
                          {lob.description}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="size-4 text-muted-foreground" />
                            {lob.active_users_count || 0}
                          </div>
                        </TableCell>
                        <TableCell>{lob.scenario_count || 0}</TableCell>
                        <TableCell>{lob.batch_count || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(lob)}
                            >
                              <Edit className="mr-1 size-4" />
                              Modify
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => void handleDeleteLob(lob)}
                            >
                              <Trash2 className="mr-1 size-4" />
                              Deactivate
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!lobs.length ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          No active LOB records found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
