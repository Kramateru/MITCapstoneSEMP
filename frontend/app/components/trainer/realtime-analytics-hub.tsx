'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { 
  TrendingUp,
  Users,
  Activity,
  Clock,
  Target,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  FileText,
  Calendar,
  Send,
  Save,
  Link2,
  Bell
} from 'lucide-react';
import { toast } from 'sonner';

interface AgentPerformance {
  agentId: string;
  name: string;
  overallScore: number;
  grammar: number;
  empathy: number;
  fluency: number;
  activeNow: boolean;
}

export default function RealtimeAnalyticsHub() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [coachingFormOpen, setCoachingFormOpen] = useState(false);

  // Real-time batch performance data
  const batchData: AgentPerformance[] = [
    { agentId: 'a1', name: 'John T.', overallScore: 92, grammar: 95, empathy: 88, fluency: 93, activeNow: true },
    { agentId: 'a2', name: 'Sarah C.', overallScore: 88, grammar: 90, empathy: 92, fluency: 85, activeNow: true },
    { agentId: 'a3', name: 'Mike R.', overallScore: 85, grammar: 87, empathy: 84, fluency: 86, activeNow: false },
    { agentId: 'a4', name: 'Emily W.', overallScore: 78, grammar: 75, empathy: 80, fluency: 78, activeNow: true },
    { agentId: 'a5', name: 'David L.', overallScore: 95, grammar: 97, empathy: 94, fluency: 95, activeNow: true },
    { agentId: 'a6', name: 'Lisa A.', overallScore: 82, grammar: 85, empathy: 78, fluency: 83, activeNow: false },
    { agentId: 'a7', name: 'Tom B.', overallScore: 90, grammar: 92, empathy: 88, fluency: 91, activeNow: true },
    { agentId: 'a8', name: 'Anna M.', overallScore: 87, grammar: 88, empathy: 89, fluency: 85, activeNow: true },
    { agentId: 'a9', name: 'Chris D.', overallScore: 76, grammar: 72, empathy: 75, fluency: 78, activeNow: false },
    { agentId: 'a10', name: 'Nina P.', overallScore: 93, grammar: 94, empathy: 93, fluency: 92, activeNow: true },
    { agentId: 'a11', name: 'Sam K.', overallScore: 84, grammar: 86, empathy: 82, fluency: 85, activeNow: true },
    { agentId: 'a12', name: 'Rachel H.', overallScore: 89, grammar: 91, empathy: 88, fluency: 89, activeNow: false },
    { agentId: 'a13', name: 'Kevin F.', overallScore: 91, grammar: 93, empathy: 90, fluency: 91, activeNow: true },
    { agentId: 'a14', name: 'Sophie G.', overallScore: 86, grammar: 88, empathy: 85, fluency: 86, activeNow: true },
    { agentId: 'a15', name: 'Mark S.', overallScore: 79, grammar: 77, empathy: 80, fluency: 79, activeNow: false },
    { agentId: 'a16', name: 'Julia R.', overallScore: 94, grammar: 96, empathy: 93, fluency: 94, activeNow: true },
    { agentId: 'a17', name: 'Alex W.', overallScore: 83, grammar: 84, empathy: 82, fluency: 83, activeNow: true },
    { agentId: 'a18', name: 'Megan L.', overallScore: 88, grammar: 89, empathy: 87, fluency: 88, activeNow: false },
    { agentId: 'a19', name: 'Ryan C.', overallScore: 81, grammar: 79, empathy: 83, fluency: 81, activeNow: true },
    { agentId: 'a20', name: 'Olivia T.', overallScore: 92, grammar: 93, empathy: 91, fluency: 92, activeNow: true }
  ];

  // Performance trends over time
  const trendData = [
    { time: '09:00', avgScore: 82, grammar: 85, empathy: 78, fluency: 83 },
    { time: '10:00', avgScore: 84, grammar: 86, empathy: 81, fluency: 85 },
    { time: '11:00', avgScore: 86, grammar: 88, empathy: 83, fluency: 87 },
    { time: '12:00', avgScore: 85, grammar: 87, empathy: 82, fluency: 86 },
    { time: '13:00', avgScore: 88, grammar: 90, empathy: 85, fluency: 89 },
    { time: '14:00', avgScore: 87, grammar: 89, empathy: 84, fluency: 88 },
    { time: '15:00', avgScore: 89, grammar: 91, empathy: 86, fluency: 90 }
  ];

  // Coaching form state
  const [coachingForm, setCoachingForm] = useState({
    coachingId: `COACH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
    traineeName: '',
    traineeId: '',
    timestamp: new Date().toISOString(),
    assessmentLink: '',
    strengths: '',
    opportunities: '',
    actionPlan: '',
    targetDate: '',
    status: 'pending' as 'pending' | 'acknowledged'
  });

  const handleCreateCoachingLog = (agentId: string, agentName: string) => {
    setCoachingForm({
      ...coachingForm,
      traineeId: agentId,
      traineeName: agentName,
      coachingId: `COACH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
      timestamp: new Date().toISOString()
    });
    setSelectedAgent(agentId);
    setCoachingFormOpen(true);
  };

  const handleSaveCoachingLog = (publish: boolean = false) => {
    if (!coachingForm.strengths || !coachingForm.opportunities || !coachingForm.actionPlan) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (publish) {
      toast.success(`Coaching log ${coachingForm.coachingId} published and sent to ${coachingForm.traineeName}`);
    } else {
      toast.success(`Coaching log ${coachingForm.coachingId} saved as draft`);
    }

    setCoachingFormOpen(false);
    setCoachingForm({
      coachingId: `COACH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
      traineeName: '',
      traineeId: '',
      timestamp: new Date().toISOString(),
      assessmentLink: '',
      strengths: '',
      opportunities: '',
      actionPlan: '',
      targetDate: '',
      status: 'pending'
    });
  };

  // Calculate statistics
  const averageScore = Math.round(batchData.reduce((sum, agent) => sum + agent.overallScore, 0) / batchData.length);
  const activeAgents = batchData.filter(a => a.activeNow).length;
  const needsAttention = batchData.filter(a => a.overallScore < 80).length;
  const topPerformers = batchData.filter(a => a.overallScore >= 90).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl">Real-Time Analytics & Coaching Hub</h1>
          <p className="text-sm text-gray-500 mt-1">
            Batch: New Hire Wave 10 - Tech Support - Live Session
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-600 animate-pulse">
            <Activity className="size-3 mr-1" />
            Live
          </Badge>
          <span className="text-sm text-gray-500">{activeAgents}/{batchData.length} Active</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="size-4 text-blue-600" />
              Batch Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{averageScore}%</div>
            <p className="text-xs text-gray-500 mt-1">Overall Performance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="size-4 text-green-600" />
              Active Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeAgents}</div>
            <p className="text-xs text-gray-500 mt-1">Currently practicing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="size-4 text-yellow-600" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topPerformers}</div>
            <p className="text-xs text-gray-500 mt-1">Scoring 90%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="size-4 text-red-600" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{needsAttention}</div>
            <p className="text-xs text-gray-500 mt-1">Scoring &lt;80%</p>
          </CardContent>
        </Card>
      </div>

      {/* Real-Time Batch Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart className="size-5 text-purple-600" />
            Live Batch Performance Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={batchData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="grammar" fill="#3b82f6" name="Grammar" />
              <Bar dataKey="empathy" fill="#10b981" name="Empathy" />
              <Bar dataKey="fluency" fill="#f59e0b" name="Fluency" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Performance Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-blue-600" />
            Performance Trends (Today)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[70, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="avgScore" stroke="#8b5cf6" strokeWidth={2} name="Overall" />
              <Line type="monotone" dataKey="grammar" stroke="#3b82f6" name="Grammar" />
              <Line type="monotone" dataKey="empathy" stroke="#10b981" name="Empathy" />
              <Line type="monotone" dataKey="fluency" stroke="#f59e0b" name="Fluency" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Agent List & Quick Coach */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-green-600" />
            Agent Performance Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {batchData.map((agent) => (
                <div
                  key={agent.agentId}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {agent.activeNow && (
                      <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{agent.name}</span>
                        {agent.overallScore >= 90 && (
                          <Badge className="bg-green-600 text-xs">Top Performer</Badge>
                        )}
                        {agent.overallScore < 80 && (
                          <Badge variant="destructive" className="text-xs">Needs Help</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                        <span>Grammar: {agent.grammar}%</span>
                        <span>Empathy: {agent.empathy}%</span>
                        <span>Fluency: {agent.fluency}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Overall</p>
                      <p className={`text-2xl font-bold ${
                        agent.overallScore >= 90 ? 'text-green-600' :
                        agent.overallScore >= 80 ? 'text-blue-600' :
                        agent.overallScore >= 70 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {agent.overallScore}%
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleCreateCoachingLog(agent.agentId, agent.name)}
                    >
                      <MessageSquare className="size-4 mr-2" />
                      Coach
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Coaching Log Creator Dialog */}
      {coachingFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-5" />
                  Create Coaching Log
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCoachingFormOpen(false)}
                >
                  -
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {/* Coaching ID & Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Coaching ID</Label>
                  <p className="text-lg font-mono">{coachingForm.coachingId}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Trainee Name</Label>
                  <p className="text-lg">{coachingForm.traineeName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Timestamp</Label>
                  <p className="text-sm">{new Date(coachingForm.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {coachingForm.status === 'acknowledged' ? (
                      <Badge className="bg-green-600">
                        <CheckCircle2 className="size-3 mr-1" />
                        Acknowledged
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-600">
                        <Clock className="size-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Link to Assessment */}
              <div className="space-y-2">
                <Label>Link to Assessment</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Select or paste assessment link..."
                    value={coachingForm.assessmentLink}
                    onChange={(e) => setCoachingForm({ ...coachingForm, assessmentLink: e.target.value })}
                  />
                  <Button variant="outline">
                    <Link2 className="size-4 mr-2" />
                    Browse
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Strengths */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-600" />
                  Strengths
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </Label>
                <Textarea
                  placeholder="Describe what the trainee did well in this assessment..."
                  value={coachingForm.strengths}
                  onChange={(e) => setCoachingForm({ ...coachingForm, strengths: e.target.value })}
                  rows={4}
                />
              </div>

              {/* Opportunities / Improvement Areas */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-yellow-600" />
                  Improvement Areas
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </Label>
                <Textarea
                  placeholder="Identify areas where the trainee needs improvement..."
                  value={coachingForm.opportunities}
                  onChange={(e) => setCoachingForm({ ...coachingForm, opportunities: e.target.value })}
                  rows={4}
                />
              </div>

              {/* SMART Action Plan */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Target className="size-4 text-blue-600" />
                  SMART Action Plan
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </Label>
                <Textarea
                  placeholder="1. Specific action item&#10;2. Measurable goal&#10;3. Achievable steps&#10;4. Time-bound deadline"
                  value={coachingForm.actionPlan}
                  onChange={(e) => setCoachingForm({ ...coachingForm, actionPlan: e.target.value })}
                  rows={6}
                />
              </div>

              {/* Target Date */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="size-4" />
                  Target Completion Date
                </Label>
                <Input
                  type="date"
                  value={coachingForm.targetDate}
                  onChange={(e) => setCoachingForm({ ...coachingForm, targetDate: e.target.value })}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setCoachingFormOpen(false)}>
                  Cancel
                </Button>
                <Button variant="outline" onClick={() => handleSaveCoachingLog(false)}>
                  <Save className="size-4 mr-2" />
                  Save as Draft
                </Button>
                <Button onClick={() => handleSaveCoachingLog(true)} className="bg-blue-600 hover:bg-blue-700">
                  <Send className="size-4 mr-2" />
                  Publish & Send
                </Button>
              </div>

              {/* Acknowledgement Status Info */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                <div className="flex items-start gap-2">
                  <Bell className="size-4 mt-0.5 text-gray-500" />
                  <div>
                    <p className="font-medium">Trainee Acknowledgement</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Once published, the trainee will receive a notification and must acknowledge this coaching log within 48 hours.
                      The acknowledgement will be timestamped and lock the log for editing.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
