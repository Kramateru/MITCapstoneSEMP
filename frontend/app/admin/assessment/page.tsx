'use client';

import { useEffect, useState } from 'react';
import { Loader2, PencilLine, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { adminSidebarItems } from '@/app/admin/nav';
import { Button } from '@/app/components/ui/button';

type AssessmentCategory = {
  id: string;
  name: string;
  category_type: string;
  description?: string | null;
  min_score: number;
  max_score: number;
  passing_threshold: number;
  scoring_rules?: Record<string, unknown> | null;
  weight: number;
};

type CategoryForm = {
  name: string;
  category_type: string;
  description: string;
  min_score: string;
  max_score: string;
  passing_threshold: string;
  weight: string;
  scoring_rules: string;
};

const EMPTY_FORM: CategoryForm = {
  name: '',
  category_type: 'pronunciation',
  description: '',
  min_score: '0',
  max_score: '100',
  passing_threshold: '70',
  weight: '1',
  scoring_rules: '{\n  "notes": ""\n}',
};

function headers() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function prettyLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminAssessmentPage() {
  const [categories, setCategories] = useState<AssessmentCategory[]>([]);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/assessment-categories', {
        headers: headers(),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to load assessment categories.');
      }

      setCategories(payload?.categories || []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to load assessment categories.',
      );
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const editCategory = (category: AssessmentCategory) => {
    setEditingId(category.id);
    setForm({
      name: category.name,
      category_type: category.category_type,
      description: category.description || '',
      min_score: String(category.min_score),
      max_score: String(category.max_score),
      passing_threshold: String(category.passing_threshold),
      weight: String(category.weight),
      scoring_rules: JSON.stringify(category.scoring_rules || { notes: '' }, null, 2),
    });
  };

  const saveCategory = async () => {
    if (!form.name.trim()) {
      toast.error('Category name is required.');
      return;
    }

    let scoringRules: Record<string, unknown> | undefined;
    try {
      scoringRules = form.scoring_rules.trim()
        ? (JSON.parse(form.scoring_rules) as Record<string, unknown>)
        : undefined;
    } catch {
      toast.error('Scoring rules must be valid JSON.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        category_type: form.category_type,
        description: form.description.trim() || undefined,
        min_score: Number(form.min_score),
        max_score: Number(form.max_score),
        passing_threshold: Number(form.passing_threshold),
        weight: Number(form.weight),
        scoring_rules: scoringRules,
      };

      const response = await fetch(
        editingId
          ? `/api/admin/assessment-categories/${editingId}`
          : '/api/admin/assessment-categories',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: headers(),
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || 'Unable to save the assessment category.');
      }

      toast.success(
        editingId
          ? 'Assessment category updated in the database.'
          : 'Assessment category created in the database.',
      );
      resetForm();
      await loadCategories();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to save the assessment category.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCategory = async (category: AssessmentCategory) => {
    if (!window.confirm(`Deactivate "${category.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/assessment-categories/${category.id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to delete the category.');
      }

      toast.success('Assessment category deactivated successfully.');
      if (editingId === category.id) {
        resetForm();
      }
      await loadCategories();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to delete the category.',
      );
    }
  };

  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assessment Categories</h2>
          <p className="mt-2 text-sm text-gray-600">
            Manage the speech-scoring categories stored in the active database.
          </p>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">
                {editingId ? 'Edit category' : 'Create category'}
              </h3>
              <p className="text-sm text-gray-500">
                Save real pronunciation, fluency, grammar, empathy, or clarity rules.
              </p>
            </div>
            {editingId ? (
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel Edit
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <input className="rounded-md border px-3 py-2" placeholder="Category name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <select className="rounded-md border px-3 py-2" value={form.category_type} onChange={(event) => setForm((current) => ({ ...current, category_type: event.target.value }))}>
              <option value="pronunciation">Pronunciation</option>
              <option value="fluency">Fluency</option>
              <option value="grammar">Grammar</option>
              <option value="empathy">Empathy</option>
              <option value="clarity">Clarity</option>
            </select>
            <textarea className="min-h-24 rounded-md border px-3 py-2 md:col-span-2" placeholder="Description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            <input className="rounded-md border px-3 py-2" type="number" placeholder="Minimum score" value={form.min_score} onChange={(event) => setForm((current) => ({ ...current, min_score: event.target.value }))} />
            <input className="rounded-md border px-3 py-2" type="number" placeholder="Maximum score" value={form.max_score} onChange={(event) => setForm((current) => ({ ...current, max_score: event.target.value }))} />
            <input className="rounded-md border px-3 py-2" type="number" placeholder="Passing threshold" value={form.passing_threshold} onChange={(event) => setForm((current) => ({ ...current, passing_threshold: event.target.value }))} />
            <input className="rounded-md border px-3 py-2" type="number" step="0.1" placeholder="Weight" value={form.weight} onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))} />
            <textarea className="min-h-40 rounded-md border px-3 py-2 md:col-span-2" placeholder="Scoring rules JSON" value={form.scoring_rules} onChange={(event) => setForm((current) => ({ ...current, scoring_rules: event.target.value }))} />
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => void saveCategory()} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : editingId ? (
                <Save className="mr-2 size-4" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              {editingId ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-4 font-semibold text-gray-900">Live category catalog</h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-14 text-sm text-gray-500">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading categories...
            </div>
          ) : categories.length ? (
            <div className="space-y-3">
              {categories.map((category) => (
                <div key={category.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-gray-900">{category.name}</h4>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {prettyLabel(category.category_type)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {category.description || 'No description provided.'}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>Min: {category.min_score}</span>
                        <span>Max: {category.max_score}</span>
                        <span>Pass: {category.passing_threshold}</span>
                        <span>Weight: {category.weight}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => editCategory(category)}>
                        <PencilLine className="mr-2 size-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" className="text-red-600" onClick={() => void deleteCategory(category)}>
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-sm text-gray-500">
              No assessment categories found in the database yet.
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
