'use client';

import { useEffect, useMemo, useState } from 'react';
import { Award, Loader2, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import CertificatePreview, {
  type CertificatePreviewData,
  type CertificateSettingsView,
} from '@/app/components/shared/certificate-preview';
import { traineeSidebarItems } from '@/app/trainee/nav';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';

type CertificatesResponse = {
  count: number;
  settings: CertificateSettingsView;
  certificates: CertificatePreviewData[];
};

export default function TraineeReportsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<CertificateSettingsView | null>(null);
  const [certificates, setCertificates] = useState<CertificatePreviewData[]>([]);
  const [selectedCertificateId, setSelectedCertificateId] = useState<string>('');
  const [error, setError] = useState('');

  const loadCertificates = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await fetch('/api/certification/certificates', { headers });
      const payload: CertificatesResponse = await response.json();
      if (!response.ok) {
        throw new Error((payload as unknown as { detail?: string }).detail || 'Unable to load certificates.');
      }

      setSettings(payload.settings);
      setCertificates(payload.certificates || []);
      setSelectedCertificateId((current) =>
        current && payload.certificates.some((certificate) => certificate.id === current)
          ? current
          : payload.certificates[0]?.id || '',
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load certificates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCertificates();
  }, []);

  const selectedCertificate = useMemo(
    () => certificates.find((certificate) => certificate.id === selectedCertificateId) || certificates[0] || null,
    [certificates, selectedCertificateId],
  );

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">My Certificates</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Certificates saved in the database appear here automatically once you complete a recorded training task or
              assessment.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadCertificates('refresh')} disabled={loading || refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading certificates...
            </CardContent>
          </Card>
        ) : null}

        {!loading && !certificates.length ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No certificates yet</CardTitle>
              <CardDescription>
                Complete an assigned scenario task or submit an assessment and your certificate will be issued and saved
                automatically in the database.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {!loading && certificates.length && settings ? (
          <div className="grid gap-6 xl:grid-cols-[0.86fr,1.14fr]">
            <Card>
              <CardHeader>
                <CardTitle>Issued Certificates</CardTitle>
                <CardDescription>Select a certificate to preview and download.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {certificates.map((certificate) => {
                  const isSelected = certificate.id === selectedCertificate?.id;
                  return (
                    <button
                      key={certificate.id}
                      type="button"
                      onClick={() => setSelectedCertificateId(certificate.id || '')}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-sky-400 bg-sky-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{certificate.achievement_title}</div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {certificate.achievement_type.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <Award className={`size-5 ${isSelected ? 'text-sky-700' : 'text-amber-600'}`} />
                      </div>
                      <div className="text-sm text-slate-600">{certificate.certificate_no}</div>
                      <div className="text-xs text-slate-500">
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }).format(new Date(certificate.issued_at))}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {selectedCertificate ? (
              <CertificatePreview
                certificate={selectedCertificate}
                settings={settings}
                showVerifyAction={false}
                showCopyLinkAction={false}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
