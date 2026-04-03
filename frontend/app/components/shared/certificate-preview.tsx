'use client';

import { type ReactNode } from 'react';
import { Award, Calendar, Copy, Download, FileText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

export type CertificateSettingsView = {
  institution_name: string;
  address: string;
  contact_number?: string;
  contact_email?: string;
  logo_url?: string;
  manager_signature_url?: string;
  registrar_name: string;
  signatory_title?: string;
  certificate_title: string;
  certificate_subtitle: string;
  certificate_intro: string;
  certificate_outro: string;
  certificate_footer: string;
};

export type CertificatePreviewData = {
  id?: string;
  certificate_no: string;
  trainee_name: string;
  achievement_title: string;
  achievement_type: string;
  issued_at: string;
  issuer_name?: string | null;
  score?: number;
  pdf_url?: string;
  verification_url?: string;
};

interface CertificatePreviewProps {
  certificate: CertificatePreviewData;
  settings: CertificateSettingsView;
  actions?: ReactNode;
  showVerifyAction?: boolean;
  showCopyLinkAction?: boolean;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
}

function prettyAchievementType(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CertificatePreview({
  certificate,
  settings,
  actions,
  showVerifyAction = true,
  showCopyLinkAction = true,
}: CertificatePreviewProps) {
  const logoSource = settings.logo_url || '/st-peter-seal.png';

  const handleCopy = async () => {
    if (!certificate.verification_url) {
      toast.error('No verification link available for this certificate.');
      return;
    }
    await navigator.clipboard.writeText(certificate.verification_url);
    toast.success('Verification link copied.');
  };

  const handleDownload = async () => {
    if (!certificate.pdf_url) {
      toast.error('No PDF is available for this certificate yet.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(certificate.pdf_url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error('Unable to download the selected certificate PDF.');
      }

      const pdfBlob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(pdfBlob);
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const matchedFilename = contentDisposition.match(/filename="?([^"]+)"?/i)?.[1];
      const fallbackFilename = `certificate_${certificate.certificate_no || 'download'}.pdf`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = matchedFilename || fallbackFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to download the selected certificate PDF.';
      toast.error(message);
    }
  };

  const handleVerify = () => {
    if (!certificate.verification_url) {
      toast.error('No verification link available for this certificate.');
      return;
    }
    window.open(certificate.verification_url, '_blank');
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-4 border-amber-200 bg-[linear-gradient(145deg,#fffbeb_0%,#fff7ed_52%,#eff6ff_100%)] shadow-[0_24px_70px_rgba(148,163,184,0.18)]">
        <CardContent className="p-8 md:p-10">
          <div className="space-y-8">
            <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:justify-center md:text-left">
              <img
                src={logoSource}
                alt="Training center logo"
                className="size-20 rounded-full border border-slate-200 bg-white object-contain p-2 shadow-sm"
                onError={(event) => {
                  event.currentTarget.src = '/st-peter-seal.png';
                }}
              />
              <div>
                <div className="text-2xl font-bold tracking-tight text-slate-900">{settings.institution_name}</div>
                <div className="text-sm text-slate-600">{settings.address}</div>
                <div className="text-xs text-slate-500">
                  {[settings.contact_number, settings.contact_email].filter(Boolean).join(' | ')}
                </div>
              </div>
            </div>

            <Separator className="bg-amber-200/80" />

            <div className="space-y-2 text-center">
              <div className="text-4xl font-semibold uppercase tracking-[0.16em] text-slate-900">
                {settings.certificate_title}
              </div>
              <div className="text-sm uppercase tracking-[0.26em] text-slate-500">{settings.certificate_subtitle}</div>
            </div>

            <div className="space-y-5 text-center">
              <p className="text-lg leading-8 text-slate-700">{settings.certificate_intro}</p>
              <div className="rounded-3xl border border-sky-200 bg-white/80 px-6 py-5 shadow-sm">
                <div className="text-4xl font-semibold tracking-tight text-sky-900">{certificate.trainee_name}</div>
              </div>
              <p className="text-lg leading-8 text-slate-700">{settings.certificate_outro}</p>
              <div className="rounded-3xl border border-slate-200 bg-white/80 px-6 py-5 shadow-sm">
                <div className="text-2xl font-semibold text-slate-900">{certificate.achievement_title}</div>
                <div className="mt-2 text-sm uppercase tracking-[0.18em] text-slate-500">
                  {prettyAchievementType(certificate.achievement_type)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoCell
                    icon={<FileText className="size-4 text-sky-700" />}
                    label="Certificate Number"
                    value={certificate.certificate_no}
                  />
                  <InfoCell
                    icon={<Calendar className="size-4 text-sky-700" />}
                    label="Issued On"
                    value={formatDate(certificate.issued_at)}
                  />
                  <InfoCell
                    icon={<Award className="size-4 text-sky-700" />}
                    label="Recorded By"
                    value={certificate.issuer_name || settings.registrar_name}
                  />
                  <InfoCell
                    icon={<ShieldCheck className="size-4 text-sky-700" />}
                    label="Recorded Score"
                    value={
                      typeof certificate.score === 'number' && certificate.score > 0
                        ? `${certificate.score.toFixed(2)}%`
                        : 'Stored in database'
                    }
                  />
                </div>
              </div>

              <div className="flex flex-col items-center justify-between rounded-3xl border border-slate-200 bg-white/80 p-5 text-center shadow-sm">
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                  Database-backed certificate
                </Badge>
                <div className="space-y-3">
                  {settings.manager_signature_url ? (
                    <img
                      src={settings.manager_signature_url}
                      alt="Signatory signature"
                      className="mx-auto h-16 object-contain"
                    />
                  ) : (
                    <div className="mx-auto h-16 w-44 rounded-2xl border border-dashed border-slate-300 bg-slate-50" />
                  )}
                  <div className="border-t border-slate-300 pt-2">
                    <div className="font-semibold text-slate-900">{settings.registrar_name}</div>
                    <div className="text-sm text-slate-500">{settings.signatory_title || 'Authorized Signatory'}</div>
                  </div>
                </div>
                <div className="text-xs leading-5 text-slate-500">{settings.certificate_footer}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleDownload()} disabled={!certificate.pdf_url}>
            <Download className="size-4" />
            Download PDF
          </Button>
          {showVerifyAction ? (
            <Button type="button" variant="outline" onClick={handleVerify} disabled={!certificate.verification_url}>
              <ShieldCheck className="size-4" />
              Verify
            </Button>
          ) : null}
          {showCopyLinkAction ? (
            <Button type="button" variant="outline" onClick={() => void handleCopy()} disabled={!certificate.verification_url}>
              <Copy className="size-4" />
              Copy Link
            </Button>
          ) : null}
        </div>
        {actions}
      </div>
    </div>
  );
}

function InfoCell({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="break-words text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
