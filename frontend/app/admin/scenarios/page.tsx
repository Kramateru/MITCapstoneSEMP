'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { adminSidebarItems } from '@/app/admin/nav';
import { useLobCatalog } from '@/app/hooks/useLobCatalog';

type Scenario = { id: string; title: string; difficulty: string; purpose: string; is_published: boolean };

export default function AdminScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [status, setStatus] = useState('');
  const { lobs, isLoading: isLoadingLobs } = useLobCatalog();
  const [form, setForm] = useState({
    title: '',
    description: '',
    purpose: 'practice',
    difficulty: 'basic',
    lob: '',
    opening_prompt: '',
    expected_keywords: '',
    estimated_duration: 120,
  });

  const sidebarItems = adminSidebarItems;

  const headers = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const load = async () => {
    const res = await fetch('/api/admin/scenarios', { headers: headers() });
    if (res.ok) {
      const data = await res.json();
      setScenarios(data.scenarios || []);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createScenario = async () => {
    setStatus('');
    const payload = {
      ...form,
      expected_keywords: form.expected_keywords.split(',').map((x) => x.trim()).filter(Boolean),
    };
    const res = await fetch('/api/admin/scenarios', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    setStatus(res.ok ? 'Scenario created.' : 'Failed to create scenario.');
    if (res.ok) {
      setForm({ ...form, title: '', description: '', opening_prompt: '', expected_keywords: '' });
      await load();
    }
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="admin">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Simulation Architect</h2>
      <p className="text-gray-600 mb-6">Create and publish practice/assessment scenarios with expected speech keywords.</p>

      {status && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{status}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="font-semibold mb-3">Create Scenario</h3>
          <div className="space-y-2">
            <input className="w-full border rounded px-3 py-2" placeholder="Title" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} />
            <textarea className="w-full border rounded px-3 py-2" placeholder="Description" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} />
            <div className="grid grid-cols-2 gap-2">
              <select className="w-full border rounded px-3 py-2" value={form.purpose} onChange={(e)=>setForm({...form,purpose:e.target.value})}>
                <option value="practice">practice</option>
                <option value="assessment">assessment</option>
                <option value="certification">certification</option>
              </select>
              <select className="w-full border rounded px-3 py-2" value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})}>
                <option value="basic">basic</option>
                <option value="intermediate">intermediate</option>
                <option value="advanced">advanced</option>
              </select>
            </div>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.lob}
              disabled={isLoadingLobs}
              onChange={(e)=>setForm({...form,lob:e.target.value})}
            >
              <option value="">{isLoadingLobs ? 'Loading LOBs...' : 'Select LOB'}</option>
              {lobs.map((lob) => (
                <option key={lob.id} value={lob.name}>
                  {lob.name}
                </option>
              ))}
            </select>
            <textarea className="w-full border rounded px-3 py-2" placeholder="Opening customer prompt" value={form.opening_prompt} onChange={(e)=>setForm({...form,opening_prompt:e.target.value})} />
            <input className="w-full border rounded px-3 py-2" placeholder="Expected keywords (comma separated)" value={form.expected_keywords} onChange={(e)=>setForm({...form,expected_keywords:e.target.value})} />
            <input type="number" className="w-full border rounded px-3 py-2" value={form.estimated_duration} onChange={(e)=>setForm({...form,estimated_duration:Number(e.target.value)})} />
            <button onClick={createScenario} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Scenario</button>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="font-semibold mb-3">Scenario List</h3>
          <div className="space-y-2 max-h-[520px] overflow-auto">
            {scenarios.map((s)=> (
              <div key={s.id} className="border rounded p-3">
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-gray-600">{s.difficulty} | {s.purpose} | Published: {s.is_published ? 'Yes' : 'No'}</div>
              </div>
            ))}
            {!scenarios.length && <div className="text-sm text-gray-500">No scenarios available.</div>}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
