'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { KpiParametersReference } from '@/app/components/KpiParametersReference';
import ProgressTracking from '@/app/components/trainee/progress-tracking';
import { traineeSidebarItems } from '@/app/trainee/nav';
import { useAppUser } from '@/app/utils/user';

type CoachingLog = { id: string; coaching_id: string; status: string; strengths?: string; opportunities?: string; action_plan?: string; acknowledged_at?: string };
type McqAssessment = { id: string; title: string; description?: string };
type ReportSnapshot = {
  summary?: { total_sessions?: number; pass_rate?: number };
  average_scores?: { overall?: number; accuracy?: number; fluency?: number; clarity?: number };
};

export default function TraineeProgressPage() {
  const user = useAppUser('trainee');
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [logs, setLogs] = useState<CoachingLog[]>([]);
  const [assessments, setAssessments] = useState<McqAssessment[]>([]);
  const [days, setDays] = useState('7');
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [answerPayload, setAnswerPayload] = useState('{ }');
  const [status, setStatus] = useState('');

  const sidebarItems = traineeSidebarItems;

  const headers = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const load = async () => {
    const [rRes, cRes, mRes] = await Promise.all([
      fetch(`/api/trainee/reports?days=${encodeURIComponent(days)}`, { headers: headers() }),
      fetch('/api/certification/coaching/logs', { headers: headers() }),
      fetch('/api/certification/mcq/my-assessments', { headers: headers() }),
    ]);
    if (rRes.ok) setReport(await rRes.json());
    if (cRes.ok) {
      const d = await cRes.json();
      setLogs(d.logs || []);
    }
    if (mRes.ok) {
      const d = await mRes.json();
      setAssessments(d.assessments || []);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const acknowledge = async (id: string) => {
    const res = await fetch(`/api/certification/coaching/logs/${id}/acknowledge`, {
      method: 'POST',
      headers: headers(),
    });
    setStatus(res.ok ? 'Coaching log acknowledged.' : 'Failed to acknowledge log.');
    await load();
  };

  const submitMcq = async () => {
    if (!selectedAssessment) return;
    try {
      const answers = JSON.parse(answerPayload);
      const res = await fetch(`/api/certification/mcq/assessment/${selectedAssessment}/submit`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`MCQ submitted. Score: ${data.score_percentage}% | Passed: ${data.is_passed ? 'Yes' : 'No'}`);
      } else {
        setStatus('MCQ submission failed.');
      }
    } catch {
      setStatus('Invalid JSON format for answers payload.');
    }
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="trainee">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Performance Hub</h2>
      <p className="text-gray-600 mb-6">Track KPI progress, manage coaching acknowledgments, and complete MCQ assessments.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700" htmlFor="report-range">
          Date range
        </label>
        <select
          id="report-range"
          className="rounded border px-3 py-2 text-sm"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {status && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{status}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="font-semibold mb-3">Performance Snapshot</h3>
          {!report && <div className="text-sm text-gray-500">Loading report...</div>}
          {report && (
            <div className="space-y-2 text-sm">
              <div>Total Sessions: {report.summary?.total_sessions || 0}</div>
              <div>Pass Rate: {report.summary?.pass_rate || 0}%</div>
              <div>Overall Score: {Number(report.average_scores?.overall || 0).toFixed(2)}%</div>
              <div>Accuracy: {Number(report.average_scores?.accuracy || 0).toFixed(2)}%</div>
              <div>Fluency: {Number(report.average_scores?.fluency || 0).toFixed(2)}%</div>
              <div>Clarity: {Number(report.average_scores?.clarity || 0).toFixed(2)}%</div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="font-semibold mb-3">My Coaching Logs</h3>
          <div className="space-y-2 max-h-72 overflow-auto">
            {logs.map((log) => (
              <div key={log.id} className="border rounded p-3">
                <div className="font-medium">{log.coaching_id}</div>
                <div className="text-xs text-gray-600">Status: {log.status}</div>
                <div className="text-xs">Strengths: {log.strengths || 'N/A'}</div>
                <div className="text-xs">Opportunities: {log.opportunities || 'N/A'}</div>
                <div className="text-xs">Action Plan: {log.action_plan || 'N/A'}</div>
                {log.status !== 'acknowledged' && (
                  <button onClick={() => acknowledge(log.id)} className="mt-2 px-3 py-1 bg-emerald-600 text-white rounded text-xs">Acknowledge Coaching</button>
                )}
              </div>
            ))}
            {!logs.length && <div className="text-sm text-gray-500">No coaching logs yet.</div>}
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3">MCQ Assessments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <select className="w-full border rounded px-3 py-2 mb-2" value={selectedAssessment} onChange={(e)=>setSelectedAssessment(e.target.value)}>
                <option value="">Select assigned assessment</option>
                {assessments.map((a)=><option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
              <p className="text-xs text-gray-500">Answer format: {'{"question-id":"A"}'}</p>
            </div>
            <div>
              <textarea className="w-full border rounded px-3 py-2 h-28" value={answerPayload} onChange={(e)=>setAnswerPayload(e.target.value)} />
              <button onClick={submitMcq} disabled={!selectedAssessment} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Submit MCQ Answers</button>
            </div>
          </div>
        </section>
      </div>

      <ProgressTracking user={user} />
      <KpiParametersReference />
    </DashboardLayout>
  );
}
