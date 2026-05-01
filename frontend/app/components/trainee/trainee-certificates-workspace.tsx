'use client';

import { openCallSimulationRealtimeStream } from '@/app/lib/assessment/call-simulation-client';
import { Award, ExternalLink, FileDown, GraduationCap, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import CertificatePreview, {
    type CertificatePreviewData,
    type CertificateSettingsView,
} from '@/app/components/shared/certificate-preview';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { useAuth } from '@/app/context/AuthContext';

type TraineeCertificateRecord = CertificatePreviewData & {
  source_type?: string | null;
  source_id?: string | null;
  qr_token?: string | null;
};

type CertificatesResponse = {
  count: number;
  settings: CertificateSettingsView;
  certificates: TraineeCertificateRecord[];
};

function formatDateLabel(value?: string | null) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatLongDateLabel(value?: string | null) {
  if (!value) {
    return 'No certificates issued yet';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No certificates issued yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function prettifyValue(value?: string | null) {
  if (!value) {
    return 'Other';
  }

  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

async function readErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as { detail?: string; error?: string; message?: string } | null;
    for (const value of [payload?.detail, payload?.error, payload?.message]) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return fallback;
  }

  const text = (await response.text().catch(() => '')).trim();
  return text || fallback;
}

async function readCertificatesPayload(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  return (await response.json().catch(() => null)) as CertificatesResponse | null;
}

export default function TraineeCertificatesWorkspace() {
  const { token, isAuthenticated, isLoading, refreshToken, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<CertificateSettingsView | null>(null);
  const [certificates, setCertificates] = useState<TraineeCertificateRecord[]>([]);
  const [selectedCertificateId, setSelectedCertificateId] = useState('');

  const fetchWithAuthRetry = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const sendRequest = async (authToken: string | null) => {
        const headers = new Headers(init?.headers || undefined);
        if (authToken || token) {
          headers.set('Authorization', `Bearer ${authToken || token}`);
        }
        return fetch(input, {
          ...init,
          headers,
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
    },
    [logout, refreshToken, token],
  );

  const loadCertificates = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (isLoading) {
        return;
      }

      if (!isAuthenticated || !token) {
        setCertificates([]);
        setSettings(null);
        setSelectedCertificateId('');
        setError('');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError('');

      try {
        const response = await fetchWithAuthRetry('/api/certification/certificates');
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Unable to load certificates right now.'));
        }

        const payload = await readCertificatesPayload(response);
        if (!payload) {
          throw new Error('Unable to load certificates right now.');
        }
        const nextCertificates = payload.certificates || [];

        setSettings(payload.settings);
        setCertificates(nextCertificates);
        setSelectedCertificateId((current) =>
          current && nextCertificates.some((certificate) => certificate.id === current)
            ? current
            : nextCertificates[0]?.id || '',
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load certificates right now.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchWithAuthRetry, isAuthenticated, isLoading, token],
  );

  useEffect(() => {
    void loadCertificates();
  }, [loadCertificates]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) {
      return;
    }

    let stream: EventSource | null = null;
    try {
      stream = openCallSimulationRealtimeStream();
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (payload.type === 'certificate_changed' || payload.type === 'session_changed') {
            void loadCertificates('refresh');
          }
        } catch {
          // Ignore malformed realtime payloads and keep manual refresh available.
        }
      };
    } catch {
      // Realtime refresh is optional for this page.
    }

    return () => {
      stream?.close();
    };
  }, [isAuthenticated, isLoading, loadCertificates, token]);

  const selectedCertificate = useMemo(
    () => certificates.find((certificate) => certificate.id === selectedCertificateId) || certificates[0] || null,
    [certificates, selectedCertificateId],
  );

  const certificateBreakdown = useMemo(() => {
    return certificates.reduce(
      (totals, certificate) => {
        const sourceType = certificate.source_type || '';
        if (sourceType === 'sim_floor_session') {
          totals.simFloor += 1;
        } else if (sourceType === 'microlearning_assignment') {
          totals.microlearning += 1;
        } else if (sourceType === 'mcq_assessment' || sourceType === 'mcq_assessment_completion') {
          totals.assessments += 1;
        } else {
          totals.other += 1;
        }
        return totals;
      },
      { simFloor: 0, microlearning: 0, assessments: 0, other: 0 },
    );
  }, [certificates]);

  const latestIssuedAt = useMemo(() => {
    return certificates.reduce<string | null>((latest, certificate) => {
      if (!certificate.issued_at) {
        return latest;
      }
      if (!latest) {
        return certificate.issued_at;
      }
      return new Date(certificate.issued_at).getTime() > new Date(latest).getTime() ? certificate.issued_at : latest;
    }, null);
  }, [certificates]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">My Certificates</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Every certificate earned from completed microlearning, MCQ assessments, and Call Simulation competency is shown
            here from the backend certificate ledger.
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
              Finish assigned learning activities, pass assessments, or earn a competent Call Simulation verdict to unlock
              certificates automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/trainee/microlearning">Open Microlearning</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/trainee/call-simulation">Open Call Simulation</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/trainee/reports">View Reports</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && certificates.length && settings ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Certificates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-3xl font-bold">
                  <Award className="size-5 text-amber-600" />
                  {certificates.length}
                </div>
                <p className="text-xs text-muted-foreground">All earned accomplishments</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Microlearning</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{certificateBreakdown.microlearning}</div>
                <p className="text-xs text-muted-foreground">Completed learning modules</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Assessments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{certificateBreakdown.assessments}</div>
                <p className="text-xs text-muted-foreground">Passed MCQ certifications</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Call Simulation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-3xl font-bold">
                  <ShieldCheck className="size-5 text-emerald-600" />
                  {certificateBreakdown.simFloor}
                </div>
                <p className="text-xs text-muted-foreground">Latest issue {formatLongDateLabel(latestIssuedAt)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.86fr,1.14fr]">
            <Card>
              <CardHeader>
                <CardTitle>Issued Certificates</CardTitle>
                <CardDescription>Select a certificate to preview, verify, or open the saved PDF.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {certificates.map((certificate) => {
                  const isSelected = certificate.id === selectedCertificate?.id;

                  return (
                    <button
                      key={certificate.id || certificate.certificate_no}
                      type="button"
                      onClick={() => setSelectedCertificateId(certificate.id || '')}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-sky-400 bg-sky-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="font-semibold text-slate-900">{certificate.achievement_title}</div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={isSelected ? 'default' : 'secondary'}>{prettifyValue(certificate.source_type)}</Badge>
                            <Badge variant="outline">{prettifyValue(certificate.achievement_type)}</Badge>
                            {typeof certificate.score === 'number' ? (
                              <Badge variant="outline">{certificate.score.toFixed(1)}%</Badge>
                            ) : null}
                          </div>
                        </div>
                        <GraduationCap className={`size-5 ${isSelected ? 'text-sky-700' : 'text-amber-600'}`} />
                      </div>
                      <div className="mt-3 text-sm text-slate-600">{certificate.certificate_no}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateLabel(certificate.issued_at)}</div>
                    </button>
                  );
                })}

                {certificateBreakdown.other ? (
                  <div className="rounded-2xl border border-dashed p-3 text-xs text-muted-foreground">
                    {certificateBreakdown.other} certificate{certificateBreakdown.other === 1 ? '' : 's'} came from other
                    completion sources and are included above as well.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {selectedCertificate ? (
              <CertificatePreview
                certificate={selectedCertificate}
                settings={settings}
                actions={
                  <div className="flex flex-wrap gap-2">
                    {selectedCertificate.pdf_url ? (
                      <Button asChild variant="outline">
                        <a href={selectedCertificate.pdf_url} target="_blank" rel="noreferrer">
                          <FileDown className="size-4" />
                          Open PDF
                        </a>
                      </Button>
                    ) : null}
                    {selectedCertificate.verification_url ? (
                      <Button asChild>
                        <a href={selectedCertificate.verification_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                          Verify Certificate
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost">
                      <Link href="/trainee/reports">
                        <ShieldCheck className="size-4" />
                        View Full Reports
                      </Link>
                    </Button>
                  </div>
                }
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
