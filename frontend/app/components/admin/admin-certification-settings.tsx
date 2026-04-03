'use client';

import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { ImagePlus, Loader2, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/app/utils/api';
import CertificatePreview, {
  type CertificatePreviewData,
  type CertificateSettingsView,
} from '../shared/certificate-preview';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

type CertificationSettingsPayload = CertificateSettingsView & {
  asr_passing_threshold: number;
  mcq_passing_threshold: number;
  certificate_prefix: string;
  unit_of_competency: string;
};

type AdminMcqCategory = {
  id: string;
  name: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  passing_threshold: number;
  question_count: number;
  created_by_name?: string | null;
};

type AdminMcqAssignmentTrainee = {
  id: string;
  full_name: string;
  status: 'pending' | 'completed';
  is_passed?: boolean | null;
  score_percentage?: number | null;
  certificate_no?: string | null;
};

type AdminMcqAssignment = {
  id: string;
  title: string;
  category_name?: string | null;
  assigned_by_name?: string | null;
  assigned_batch_name?: string | null;
  assigned_user_name?: string | null;
  question_count: number;
  category_question_count?: number;
  passing_threshold: number;
  total_trainees: number;
  completed_trainees: number;
  certificate_count: number;
  completion_rate: number;
  trainees: AdminMcqAssignmentTrainee[];
};

type AdminCertificatesResponse = {
  count: number;
  certificates: CertificatePreviewData[];
};

const DEFAULT_SETTINGS: CertificationSettingsPayload = {
  institution_name: 'St. Peter Velle Technical Training Center, Inc.',
  address: '#92 Mc Arthur Highway Marulas, Valenzuela, Philippines, 1440',
  contact_number: '0960 545 6293',
  contact_email: 'stpetervelle2003@yahoo.com.ph',
  logo_url: '/st-peter-seal.png',
  manager_signature_url: '',
  registrar_name: 'St. Peter Velle Registrar',
  signatory_title: 'Authorized Signatory',
  asr_passing_threshold: 80,
  mcq_passing_threshold: 100,
  certificate_prefix: 'SPV',
  certificate_title: 'Certificate of Completion',
  certificate_subtitle: 'Issued for completed trainee tasks and assessments',
  certificate_intro: 'This certificate is proudly presented to',
  certificate_outro:
    'for successfully completing the training requirement shown below through St. Peter Velle Technical Training Center, Inc.',
  certificate_footer:
    'This certificate is stored in the platform database and may be verified through the official certificate record.',
  unit_of_competency: 'Communication effectively in English for CCS',
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });
}

export default function AdminCertificationSettings() {
  const [form, setForm] = useState<CertificationSettingsPayload>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [mcqCategories, setMcqCategories] = useState<AdminMcqCategory[]>([]);
  const [mcqAssignments, setMcqAssignments] = useState<AdminMcqAssignment[]>([]);
  const [recentCertificates, setRecentCertificates] = useState<CertificatePreviewData[]>([]);
  const [certificateCount, setCertificateCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [settingsResult, categoriesResult, assignmentsResult, certificatesResult] =
        await Promise.allSettled([
          apiFetch<Partial<CertificationSettingsPayload>>('/api/certification/settings'),
          apiFetch<{ categories: AdminMcqCategory[] }>('/api/certification/mcq/categories'),
          apiFetch<{ assignments: AdminMcqAssignment[] }>('/api/certification/mcq/assignments'),
          apiFetch<AdminCertificatesResponse>('/api/certification/certificates'),
        ]);

      if (settingsResult.status === 'fulfilled') {
        setForm((current) => ({ ...current, ...settingsResult.value }));
      } else {
        toast.error(
          settingsResult.reason instanceof Error
            ? settingsResult.reason.message
            : 'Unable to load certification settings.',
        );
      }

      const workflowFailures = [
        categoriesResult.status === 'rejected',
        assignmentsResult.status === 'rejected',
        certificatesResult.status === 'rejected',
      ].some(Boolean);

      if (categoriesResult.status === 'fulfilled') {
        setMcqCategories(categoriesResult.value.categories || []);
      } else {
        setMcqCategories([]);
      }

      if (assignmentsResult.status === 'fulfilled') {
        setMcqAssignments(assignmentsResult.value.assignments || []);
      } else {
        setMcqAssignments([]);
      }

      if (certificatesResult.status === 'fulfilled') {
        setRecentCertificates((certificatesResult.value.certificates || []).slice(0, 6));
        setCertificateCount(certificatesResult.value.count || 0);
      } else {
        setRecentCertificates([]);
        setCertificateCount(0);
      }

      if (workflowFailures) {
        setWorkflowError('Some MCQ workflow data could not be loaded from the active database.');
      } else {
        setWorkflowError('');
      }

      setLoading(false);
    };

    void load();
  }, []);

  const previewCertificate = useMemo<CertificatePreviewData>(
    () => ({
      certificate_no: `${(form.certificate_prefix || 'SPV').toUpperCase()}-${new Date().getFullYear()}-0001`,
      trainee_name: 'Maria Santos',
      achievement_title: 'Billing Dispute Resolution',
      achievement_type: 'task',
      issued_at: new Date().toISOString(),
      issuer_name: form.registrar_name,
      score: 92.4,
    }),
    [form.certificate_prefix, form.registrar_name],
  );
  const totalQuestions = useMemo(
    () => mcqCategories.reduce((total, category) => total + (category.question_count || 0), 0),
    [mcqCategories],
  );
  const assignmentsNeedingCoaching = useMemo(
    () =>
      mcqAssignments.filter((assignment) =>
        assignment.trainees.some((trainee) => trainee.status === 'completed' && trainee.is_passed === false),
      ).length,
    [mcqAssignments],
  );

  const updateField = <K extends keyof CertificationSettingsPayload>(
    field: K,
    value: CertificationSettingsPayload[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleImageUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    field: 'logo_url' | 'manager_signature_url',
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Please upload an image smaller than 2MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are supported.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateField(field, dataUrl);
      toast.success(field === 'logo_url' ? 'Logo ready to save.' : 'Signature ready to save.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to read the uploaded file.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/certification/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      toast.success('Certificate layout settings saved to the database.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save certification settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Certificate Layout Settings</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Control the content and layout of the certificate that trainees will see after completing training tasks
            and assessments. These settings are stored in the database and used when certificates are issued and fetched
            across the trainee, trainer, and admin MCQ workflow.
          </p>
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={loading || saving} className="rounded-full">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Certificate Layout
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
        <Card>
          <CardHeader>
            <CardTitle>Certificate Content</CardTitle>
            <CardDescription>
              Focus this section on St. Peter Velle Technical Training Center, Inc. branding and the certificate text
              trainees should receive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="institution_name">Training Center Name</Label>
              <Input
                id="institution_name"
                value={form.institution_name}
                onChange={(event) => updateField('institution_name', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                rows={3}
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_number">Contact Number</Label>
                <Input
                  id="contact_number"
                  value={form.contact_number || ''}
                  onChange={(event) => updateField('contact_number', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input
                  id="contact_email"
                  value={form.contact_email || ''}
                  onChange={(event) => updateField('contact_email', event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="certificate_prefix">Certificate Prefix</Label>
                <Input
                  id="certificate_prefix"
                  value={form.certificate_prefix}
                  onChange={(event) => updateField('certificate_prefix', event.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificate_title">Certificate Title</Label>
                <Input
                  id="certificate_title"
                  value={form.certificate_title}
                  onChange={(event) => updateField('certificate_title', event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="mcq_passing_threshold">Default MCQ Pass Threshold</Label>
                <Input
                  id="mcq_passing_threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={form.mcq_passing_threshold}
                  onChange={(event) => updateField('mcq_passing_threshold', Number(event.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asr_passing_threshold">ASR Pass Threshold</Label>
                <Input
                  id="asr_passing_threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={form.asr_passing_threshold}
                  onChange={(event) => updateField('asr_passing_threshold', Number(event.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit_of_competency">Default Unit of Competency</Label>
                <Input
                  id="unit_of_competency"
                  value={form.unit_of_competency}
                  onChange={(event) => updateField('unit_of_competency', event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_subtitle">Certificate Subtitle</Label>
              <Input
                id="certificate_subtitle"
                value={form.certificate_subtitle}
                onChange={(event) => updateField('certificate_subtitle', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_intro">Intro Text</Label>
              <Textarea
                id="certificate_intro"
                rows={2}
                value={form.certificate_intro}
                onChange={(event) => updateField('certificate_intro', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_outro">Completion Statement</Label>
              <Textarea
                id="certificate_outro"
                rows={3}
                value={form.certificate_outro}
                onChange={(event) => updateField('certificate_outro', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_footer">Footer Note</Label>
              <Textarea
                id="certificate_footer"
                rows={3}
                value={form.certificate_footer}
                onChange={(event) => updateField('certificate_footer', event.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registrar_name">Signatory Name</Label>
                <Input
                  id="registrar_name"
                  value={form.registrar_name}
                  onChange={(event) => updateField('registrar_name', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signatory_title">Signatory Title</Label>
                <Input
                  id="signatory_title"
                  value={form.signatory_title || ''}
                  onChange={(event) => updateField('signatory_title', event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AssetUploadCard
                title="Certificate Logo"
                description="Upload the logo shown in the certificate header."
                imageUrl={form.logo_url}
                inputId="certificate-logo-upload"
                onUpload={(event) => void handleImageUpload(event, 'logo_url')}
                fallbackIcon={<ImagePlus className="size-5" />}
              />
              <AssetUploadCard
                title="Signatory Signature"
                description="Upload the signature used on the certificate."
                imageUrl={form.manager_signature_url}
                inputId="certificate-signature-upload"
                onUpload={(event) => void handleImageUpload(event, 'manager_signature_url')}
                fallbackIcon={<Upload className="size-5" />}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>
              This preview reflects the same certificate layout trainees will receive once their completed tasks or
              assessments are stored and issued from the database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading certificate layout...
              </div>
            ) : (
              <CertificatePreview
                certificate={previewCertificate}
                settings={form}
                actions={<div className="text-xs text-muted-foreground">Preview only</div>}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">MCQ Workflow Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin can review the categories trainers created, the assignments trainees are answering, and the
            certificates being issued from the same database-backed workflow.
          </p>
        </div>

        {workflowError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {workflowError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <WorkflowStat label="MCQ Categories" value={String(mcqCategories.length)} hint="Visible trainer-owned banks" />
          <WorkflowStat label="Active Questions" value={String(totalQuestions)} hint="Questions saved in the database" />
          <WorkflowStat label="Active Assignments" value={String(mcqAssignments.length)} hint="Open and completed trainer MCQ pushes" />
          <WorkflowStat label="Certificates Issued" value={String(certificateCount)} hint="Recorded certificate rows" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Recent MCQ Assignments</CardTitle>
              <CardDescription>
                Review trainer assignment activity, completion, and follow-up signals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mcqAssignments.slice(0, 6).map((assignment) => {
                const failedCount = assignment.trainees.filter(
                  (trainee) => trainee.status === 'completed' && trainee.is_passed === false,
                ).length;
                return (
                  <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-slate-900">{assignment.title}</div>
                      <Badge variant="outline">{assignment.category_name || 'Category'}</Badge>
                      <Badge variant="outline">
                        {assignment.question_count}
                        {assignment.category_question_count &&
                        assignment.category_question_count !== assignment.question_count
                          ? ` / ${assignment.category_question_count}`
                          : ''}
                        {' '}questions
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {assignment.assigned_by_name || 'Trainer'} assigned this to{' '}
                      {assignment.assigned_batch_name || assignment.assigned_user_name || 'a target cohort'}.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{assignment.completed_trainees}/{assignment.total_trainees} completed</span>
                      <span>{assignment.completion_rate.toFixed(0)}% completion</span>
                      <span>{assignment.certificate_count} certificates</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className="bg-sky-100 text-sky-700">{assignment.passing_threshold}% pass mark</Badge>
                      {failedCount ? (
                        <Badge className="bg-amber-100 text-amber-700">
                          {failedCount} trainee{failedCount === 1 ? '' : 's'} need coaching
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700">No coaching blockers</Badge>
                      )}
                    </div>
                  </div>
                );
              })}

              {!loading && !mcqAssignments.length ? (
                <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No MCQ assignments have been stored yet.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Certificates</CardTitle>
              <CardDescription>
                These records are what trainees see in their certificate view after finishing MCQ or task requirements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentCertificates.map((certificate) => (
                <div key={certificate.id || certificate.certificate_no} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{certificate.achievement_title}</div>
                      <div className="text-sm text-slate-600">{certificate.trainee_name}</div>
                    </div>
                    <Badge variant="outline">{certificate.certificate_no}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }).format(new Date(certificate.issued_at))}
                    {' '}| {certificate.achievement_type.replace(/_/g, ' ')}
                  </div>
                </div>
              ))}

              {!loading && !recentCertificates.length ? (
                <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No certificate records have been issued yet.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Category Catalog</CardTitle>
            <CardDescription>
              Trainer-created language categories stored in the active database.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {mcqCategories.map((category) => (
              <div key={category.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="font-medium text-slate-900">{category.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {category.question_count} questions | {category.passing_threshold}% pass mark
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Owner: {category.created_by_name || 'Trainer'} | {category.difficulty}
                </div>
              </div>
            ))}

            {!loading && !mcqCategories.length ? (
              <div className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No MCQ categories have been created yet.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AssetUploadCard({
  title,
  description,
  imageUrl,
  inputId,
  onUpload,
  fallbackIcon,
}: {
  title: string;
  description: string;
  imageUrl?: string;
  inputId: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  fallbackIcon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-4">
      <div className="mb-3">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="mb-4 flex min-h-[120px] items-center justify-center rounded-2xl border bg-slate-50 p-4">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="max-h-24 object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
            {fallbackIcon}
            <span>No image uploaded yet</span>
          </div>
        )}
      </div>
      <Label htmlFor={inputId} className="cursor-pointer">
        <div className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted">
          <Upload className="size-4" />
          Upload Image
        </div>
      </Label>
      <input id={inputId} type="file" accept="image/*" className="hidden" onChange={onUpload} />
    </div>
  );
}

function WorkflowStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}
