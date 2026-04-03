'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  FileCheck2,
  GraduationCap,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { traineeSidebarItems } from '@/app/trainee/nav';

type LatestVerdictResponse = {
  status?: string;
  id?: string;
  is_competent?: boolean;
  remarks?: string | null;
  asr_score?: number | null;
  mcq_score?: number | null;
  decided_at?: string | null;
  certificate_id?: string | null;
};

type PracticeSessionSummary = {
  id: string;
  scenario_title?: string | null;
  overall_score?: number | null;
  attempt_number?: number | null;
  created_at?: string | null;
  is_verified?: boolean;
};

type PracticeSessionsResponse = {
  count: number;
  sessions: PracticeSessionSummary[];
};

type CertificateListItem = {
  id: string;
  certificate_no: string;
  achievement_title: string;
  achievement_type: string;
  issued_at: string;
  verification_url: string;
  pdf_url: string;
};

type CertificatesResponse = {
  count: number;
  certificates: CertificateListItem[];
};

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatScore(value?: number | null) {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : 'Not available';
}

function formatAchievementType(value?: string | null) {
  if (!value) {
    return 'Certificate';
  }

  return value
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function TraineeAssessmentPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [latestVerdict, setLatestVerdict] = useState<LatestVerdictResponse | null>(null);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSessionSummary[]>([]);
  const [certificates, setCertificates] = useState<CertificateListItem[]>([]);

  const loadAssessmentData = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const [verdictRes, sessionsRes, certificatesRes] = await Promise.all([
        fetch('/api/certification/verdicts/my-latest', { headers, cache: 'no-store' }),
        fetch('/api/trainee/practice-sessions?limit=8', { headers, cache: 'no-store' }),
        fetch('/api/certification/certificates', { headers, cache: 'no-store' }),
      ]);

      const verdictPayload = await verdictRes.json().catch(() => null);
      const sessionsPayload = await sessionsRes.json().catch(() => null);
      const certificatesPayload = await certificatesRes.json().catch(() => null);

      if (!verdictRes.ok) {
        throw new Error((verdictPayload as { detail?: string } | null)?.detail || 'Unable to load your latest verdict.');
      }
      if (!sessionsRes.ok) {
        throw new Error((sessionsPayload as { detail?: string } | null)?.detail || 'Unable to load your assessment records.');
      }
      if (!certificatesRes.ok) {
        throw new Error(
          (certificatesPayload as { detail?: string } | null)?.detail || 'Unable to load your certificate records.',
        );
      }

      setLatestVerdict((verdictPayload as LatestVerdictResponse | null) || { status: 'none' });
      setPracticeSessions(((sessionsPayload as PracticeSessionsResponse | null)?.sessions || []).slice(0, 8));
      setCertificates((certificatesPayload as CertificatesResponse | null)?.certificates || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your assessment records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAssessmentData();
  }, []);

  const latestSession = useMemo(() => practiceSessions[0] || null, [practiceSessions]);
  const issuedCertificateCount = certificates.length;
  const hasVerdict = latestVerdict?.status !== 'none' && !!latestVerdict?.id;

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Assessment Records</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              This page reads your saved practice sessions, verdicts, and certificate records directly from the
              database. When your trainer records a new result, it appears here automatically.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadAssessmentData('refresh')} disabled={loading || refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Latest Practice Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {latestSession ? formatScore(latestSession.overall_score) : 'No record'}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {latestSession?.scenario_title || 'No saved practice session yet.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Latest ASR Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{formatScore(latestVerdict?.asr_score)}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasVerdict ? `Recorded ${formatDate(latestVerdict?.decided_at)}` : 'Waiting for a trainer verdict.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Latest MCQ Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{formatScore(latestVerdict?.mcq_score)}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasVerdict ? 'Pulled from your saved competency verdict.' : 'No MCQ verdict recorded yet.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Issued Certificates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{issuedCertificateCount}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Database-backed certificate record{issuedCertificateCount === 1 ? '' : 's'} in your account.
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="records" className="space-y-4">
          <TabsList className="grid w-full max-w-4xl grid-cols-3">
            <TabsTrigger value="records">Assessment Records</TabsTrigger>
            <TabsTrigger value="status">Certificate Status</TabsTrigger>
            <TabsTrigger value="verify">Verify Certificate</TabsTrigger>
          </TabsList>

          <TabsContent value="records">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="size-5 text-sky-700" />
                  Latest Assessment Activity
                </CardTitle>
                <CardDescription>
                  Practice sessions below are loaded from your saved trainee assessment records in the database.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {hasVerdict ? (
                    <>
                      Latest trainer verdict:{' '}
                      <span className="font-semibold text-slate-950">
                        {latestVerdict?.is_competent ? 'Competent' : 'Needs follow-up'}
                      </span>
                      {' '}on {formatDate(latestVerdict?.decided_at)}.
                    </>
                  ) : (
                    'No trainer verdict has been saved yet. Once a trainer records one, it will appear here.'
                  )}
                </div>

                {loading ? (
                  <div className="flex min-h-[180px] items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Loading assessment records...
                  </div>
                ) : practiceSessions.length ? (
                  <div className="space-y-3">
                    {practiceSessions.map((session) => (
                      <div key={session.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="font-semibold text-slate-950">
                              {session.scenario_title || 'Saved assessment session'}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              Attempt {session.attempt_number || 1} | Recorded {formatDate(session.created_at)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                              Score: {formatScore(session.overall_score)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                              {session.is_verified ? 'Verified by trainer' : 'Waiting for verification'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">
                    No saved assessment attempts are available yet in your database records.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="size-5 text-sky-700" />
                  Database-Backed Certificate Status
                </CardTitle>
                <CardDescription>
                  Certificate issuance and competency status are pulled from the saved database records tied to your
                  trainee account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
                  {hasVerdict ? (
                    <>
                      Your latest verdict is{' '}
                      <span className="font-semibold text-slate-950">
                        {latestVerdict?.is_competent ? 'Competent' : 'Needs follow-up'}
                      </span>
                      . Certificates already issued for your account: <span className="font-semibold text-slate-950">{issuedCertificateCount}</span>.
                    </>
                  ) : (
                    'No competency verdict has been saved yet. Once a trainer records one and a certificate is issued, it will appear automatically in your trainee records.'
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-sm font-medium text-slate-500">Latest verdict date</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {hasVerdict ? formatDate(latestVerdict?.decided_at) : 'Not recorded yet'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-sm font-medium text-slate-500">Certificate status</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {latestVerdict?.certificate_id ? 'Issued' : 'Waiting for issuance'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/trainee/reports">Open My Certificates</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/trainee/progress">Open Progress Tracking</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verify">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-emerald-700" />
                  Verification and Download
                </CardTitle>
                <CardDescription>
                  Review the issued certificate records from the database and open their verification or PDF links.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!loading && !certificates.length ? (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">
                    No certificate records are available yet. Once a certificate is issued in the database, its
                    verification and PDF links will appear here.
                  </div>
                ) : null}

                {certificates.slice(0, 5).map((certificate) => (
                  <div key={certificate.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="font-semibold text-slate-950">{certificate.achievement_title}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {certificate.certificate_no} | {formatAchievementType(certificate.achievement_type)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Issued {formatDate(certificate.issued_at)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline">
                          <a href={certificate.verification_url} target="_blank" rel="noreferrer">
                            <ShieldCheck className="size-4" />
                            Verify Record
                          </a>
                        </Button>
                        <Button asChild variant="outline">
                          <a href={certificate.pdf_url} target="_blank" rel="noreferrer">
                            <FileCheck2 className="size-4" />
                            Download PDF
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/trainee/reports">Go to Certificate Records</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/trainee/reports">Review Issued Certificates</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
