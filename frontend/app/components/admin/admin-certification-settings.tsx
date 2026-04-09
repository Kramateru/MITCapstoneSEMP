'use client';

import { apiFetch } from '@/app/utils/api';
import { Edit3, ImagePlus, Loader2, Save, Upload } from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import CertificatePreview, {
  type CertificatePreviewData,
  type CertificateSettingsView,
} from '../shared/certificate-preview';
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
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const settingsResult = await apiFetch<Partial<CertificationSettingsPayload>>(
          '/api/certification/settings',
        );
        setForm((current) => ({ ...current, ...settingsResult }));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Unable to load certification settings.',
        );
      } finally {
        setLoading(false);
      }
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
      setIsEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save certification settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const isReadOnly = !isEditing;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Certificate Layout Settings</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Control the content and layout of the certificate that trainees will see after completing training tasks
            and assessments. These settings are stored in the database and used when certificates are issued and fetched
            across the trainee, trainer, and admin workflows.
            <br />
            Certificate fields are read-only until you click Edit, then Save will persist the layout to the database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving || isReadOnly}
            className="rounded-full"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Certificate Layout
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleEdit}
            disabled={loading || saving || !isReadOnly}
            className="rounded-full"
          >
            <Edit3 className="size-4" />
            Edit Certificate Content
          </Button>
        </div>
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
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                rows={3}
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_number">Contact Number</Label>
                <Input
                  id="contact_number"
                  value={form.contact_number || ''}
                  onChange={(event) => updateField('contact_number', event.target.value)}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input
                  id="contact_email"
                  value={form.contact_email || ''}
                  onChange={(event) => updateField('contact_email', event.target.value)}
                  disabled={isReadOnly}
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
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificate_title">Certificate Title</Label>
                <Input
                  id="certificate_title"
                  value={form.certificate_title}
                  onChange={(event) => updateField('certificate_title', event.target.value)}
                  disabled={isReadOnly}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit_of_competency">Default Unit of Competency</Label>
              <Input
                id="unit_of_competency"
                value={form.unit_of_competency}
                onChange={(event) => updateField('unit_of_competency', event.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_subtitle">Certificate Subtitle</Label>
              <Input
                id="certificate_subtitle"
                value={form.certificate_subtitle}
                onChange={(event) => updateField('certificate_subtitle', event.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_intro">Intro Text</Label>
              <Textarea
                id="certificate_intro"
                rows={2}
                value={form.certificate_intro}
                onChange={(event) => updateField('certificate_intro', event.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_outro">Completion Statement</Label>
              <Textarea
                id="certificate_outro"
                rows={3}
                value={form.certificate_outro}
                onChange={(event) => updateField('certificate_outro', event.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_footer">Footer Note</Label>
              <Textarea
                id="certificate_footer"
                rows={3}
                value={form.certificate_footer}
                onChange={(event) => updateField('certificate_footer', event.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registrar_name">Signatory Name</Label>
                <Input
                  id="registrar_name"
                  value={form.registrar_name}
                  onChange={(event) => updateField('registrar_name', event.target.value)}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signatory_title">Signatory Title</Label>
                <Input
                  id="signatory_title"
                  value={form.signatory_title || ''}
                  onChange={(event) => updateField('signatory_title', event.target.value)}
                  disabled={isReadOnly}
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
                editable={isEditing}
              />
              <AssetUploadCard
                title="Signatory Signature"
                description="Upload the signature used on the certificate."
                imageUrl={form.manager_signature_url}
                inputId="certificate-signature-upload"
                onUpload={(event) => void handleImageUpload(event, 'manager_signature_url')}
                fallbackIcon={<Upload className="size-5" />}
                editable={isEditing}
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
  editable,
}: {
  title: string;
  description: string;
  imageUrl?: string;
  inputId: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  fallbackIcon: ReactNode;
  editable: boolean;
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
      <Label
        htmlFor={inputId}
        className={`inline-flex w-full cursor-pointer items-center justify-center rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted ${
          !editable ? 'cursor-not-allowed opacity-60' : ''
        }`}
      >
        <Upload className="size-4" />
        Upload Image
      </Label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onUpload}
        aria-label={title}
        disabled={!editable}
      />
    </div>
  );
}

