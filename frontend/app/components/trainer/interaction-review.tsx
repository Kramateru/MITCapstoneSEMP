'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Play, Volume2, MessageSquare, CheckCircle, UserCircle } from 'lucide-react';
import { toast } from 'sonner';

type InteractionSummary = {
  id: string;
  user_id: string;
  user_name: string;
  scenario_title: string;
  overall_score: number;
  created_at: string;
  audio_file_url?: string | null;
};

type InteractionDetail = {
  id: string;
  user_id: string;
  user_name: string;
  scenario_title: string;
  audio_file_url?: string | null;
  transcription?: string | null;
  transcription_confidence?: number | null;
  overall_score?: number | null;
  scores?: {
    accuracy?: number | null;
    fluency?: number | null;
    clarity?: number | null;
    keyword_adherence?: number | null;
    soft_skills?: number | null;
  };
  feedback_items?: { id: string; feedback_type: string; content: string; created_at: string }[];
  created_at?: string | null;
};

export default function InteractionReview() {
  const [interactions, setInteractions] = useState<InteractionSummary[]>([]);
  const [selectedInteraction, setSelectedInteraction] = useState<InteractionSummary | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<InteractionDetail | null>(null);
  const [coachNote, setCoachNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const loadInteractions = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/trainer/interaction-history', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load interactions');
      const data = await res.json();
      const mapped: InteractionSummary[] = (data.sessions || []).map((s: any) => ({
        id: s.id,
        user_id: s.user_id,
        user_name: s.user_name || 'Trainee',
        scenario_title: s.scenario_title || 'Scenario',
        overall_score: Number(s.overall_score || 0),
        created_at: s.created_at,
        audio_file_url: s.audio_file_url,
      }));
      setInteractions(mapped);
    } catch (error) {
      console.error(error);
      toast.error('Unable to load interaction history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInteractions();
  }, []);

  const loadDetail = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/trainer/interactions/${sessionId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load interaction');
      const data = await res.json();
      setSelectedDetail(data);
    } catch (error) {
      console.error(error);
      toast.error('Unable to load interaction detail.');
    }
  };

  const handleAddFeedback = async () => {
    if (!coachNote.trim() || !selectedInteraction) {
      toast.error('Please enter feedback');
      return;
    }
    try {
      const res = await fetch('/api/trainer/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeaders() || {}),
        },
        body: JSON.stringify({
          practice_session_id: selectedInteraction.id,
          feedback_type: 'empathy',
          content: coachNote.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to save feedback');
      toast.success('Feedback saved and sent to trainee');
      setCoachNote('');
      await loadDetail(selectedInteraction.id);
    } catch (error) {
      console.error(error);
      toast.error('Unable to save feedback.');
    }
  };

  const handleCoachTrainee = (interaction: InteractionSummary) => {
    toast.info(`Coaching ${interaction.user_name} for ${interaction.scenario_title}`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Interaction History & Review</CardTitle>
          <CardDescription>Review trainee attempts with transcript and audio playback</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {interactions.map((interaction) => (
              <Dialog key={interaction.id}>
                <DialogTrigger asChild>
                  <div
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedInteraction(interaction);
                      void loadDetail(interaction.id);
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4>{interaction.user_name}</h4>
                        <Badge variant="outline">{interaction.scenario_title}</Badge>
                        {selectedDetail?.feedback_items?.length ? (
                          <CheckCircle className="size-4 text-green-600" />
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-500">
                        {interaction.created_at ? new Date(interaction.created_at).toLocaleString() : '—'}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Overall Score</p>
                        <p className={`text-2xl ${
                          interaction.overall_score >= 85 ? 'text-green-600' :
                          interaction.overall_score >= 70 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {interaction.overall_score.toFixed(1)}%
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Play className="size-4 mr-1" />
                          Play Audio
                        </Button>
                        <Button size="sm">Review</Button>
                      </div>
                    </div>
                  </div>
                </DialogTrigger>

                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      Interaction Review: {interaction.user_name} - {interaction.scenario_title}
                    </DialogTitle>
                  </DialogHeader>

                  {/* Scores Breakdown */}
                  <div className="grid grid-cols-5 gap-4 py-4">
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-gray-500">Accuracy</p>
                      <p className="text-xl">{selectedDetail?.scores?.accuracy ?? '—'}%</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-gray-500">Fluency</p>
                      <p className="text-xl">{selectedDetail?.scores?.fluency ?? '—'}%</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-gray-500">Clarity</p>
                      <p className="text-xl">{selectedDetail?.scores?.clarity ?? '—'}%</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-gray-500">Keywords</p>
                      <p className="text-xl">{selectedDetail?.scores?.keyword_adherence ?? '—'}%</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-sm text-gray-500">Soft Skills</p>
                      <p className="text-xl">{selectedDetail?.scores?.soft_skills ?? '—'}%</p>
                    </div>
                  </div>

                  {/* Audio Playback */}
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm">Audio Recording</h4>
                      <span className="text-xs text-gray-500">
                        ASR Confidence: {selectedDetail?.transcription_confidence ? `${(selectedDetail.transcription_confidence * 100).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button variant="outline" disabled={!selectedDetail?.audio_file_url}>
                        <Volume2 className="size-4 mr-2" />
                        Play Recording
                      </Button>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full w-0" style={{ width: '0%' }} />
                      </div>
                    </div>
                  </div>

                  {/* Transcript */}
                  <div>
                    <h4 className="mb-2">Transcript</h4>
                    <div className="p-4 border rounded-lg bg-white dark:bg-gray-900">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedDetail?.transcription || 'No transcript available.'}
                      </p>
                    </div>
                  </div>

                  {/* Coach Trainee Button */}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button onClick={() => handleCoachTrainee(interaction)} className="bg-blue-600 hover:bg-blue-700">
                      <UserCircle className="size-4 mr-2" />
                      Coach Trainee
                    </Button>
                  </div>

                  {/* Coach Feedback */}
                  <div>
                    <h4 className="mb-2">Coach's Notes</h4>
                    {selectedDetail?.feedback_items?.length ? (
                      <div className="space-y-2">
                        {selectedDetail.feedback_items.map((f) => (
                          <div key={f.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-xs text-gray-500 mb-1">{new Date(f.created_at).toLocaleString()}</p>
                            <p className="text-sm">{f.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Provide constructive feedback to help the trainee improve..."
                          value={coachNote}
                          onChange={(e) => setCoachNote(e.target.value)}
                          rows={4}
                        />
                        <Button onClick={handleAddFeedback}>
                          <MessageSquare className="size-4 mr-2" />
                          Send Feedback to Trainee
                        </Button>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            ))}

            {!isLoading && interactions.length === 0 && (
              <div className="text-sm text-gray-500">No interactions available.</div>
            )}

            {isLoading && (
              <div className="text-sm text-gray-500">Loading interactions...</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
