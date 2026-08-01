'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useToast } from '../../hooks/use-toast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

type WordStatus = 'correct' | 'mispronounced' | 'omitted' | 'extra' | 'repeated' | 'uncertain';

interface WordAnalysis {
  word_index: number;
  expected_word: string;
  spoken_word?: string | null;
  status: WordStatus;
  confidence?: number | null;
  phoneme_data?: Record<string, any>;
  feedback?: string | null;
}

interface ReadingResultsDisplayProps {
  attemptId: string;
  onClose?: () => void;
}

function percent(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function statusClass(status: WordStatus) {
  switch (status) {
    case 'correct':
      return 'border-emerald-300 bg-emerald-100 text-emerald-900';
    case 'mispronounced':
    case 'uncertain':
      return 'border-rose-300 bg-rose-100 text-rose-900';
    case 'omitted':
      return 'border-amber-300 bg-amber-100 text-amber-900';
    case 'extra':
    case 'repeated':
      return 'border-sky-300 bg-sky-100 text-sky-900';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

function formatTime(seconds?: number | null) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function ReadingResultsDisplay({ attemptId, onClose }: ReadingResultsDisplayProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [results, setResults] = useState<any>(null);
  const [wordAnalysis, setWordAnalysis] = useState<WordAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchResults() {
      try {
        const response = await fetch(`/api/trainee/reading/attempts/${attemptId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail || `Fetch failed: ${response.status}`);
        }
        const data = await response.json();
        if (!isMounted) return;
        setResults(data);
        setWordAnalysis(Array.isArray(data.word_analysis) ? data.word_analysis : []);
        setError(null);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || 'Failed to load results');
        toast({
          title: 'Error',
          description: 'Could not load assessment results',
          variant: 'destructive',
        });
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchResults();
    return () => {
      isMounted = false;
    };
  }, [attemptId, toast, token]);

  const commonIssues = results?.common_issues || {};
  const soundRows = useMemo(
    () => (Array.isArray(commonIssues.sound_analysis) ? commonIssues.sound_analysis : []),
    [commonIssues.sound_analysis],
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 size-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
            <p className="text-slate-600">Loading results...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !results) {
    return (
      <Card className="border-rose-300">
        <CardContent className="flex h-64 items-center justify-center">
          <p className="font-semibold text-rose-700">{error || 'Failed to load results'}</p>
        </CardContent>
      </Card>
    );
  }

  const passed = Boolean(results.passed);
  const score = percent(results.overall_score ?? results.score);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Card className={passed ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{passed ? 'Assessment Passed' : 'Assessment Needs Improvement'}</CardTitle>
              <CardDescription>Attempt {results.attempt_number || 1}</CardDescription>
            </div>
            <Badge className={passed ? 'bg-emerald-600' : 'bg-amber-600'}>
              {score}% overall
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ['Pronunciation', results.pronunciation_score],
              ['Accuracy', results.accuracy],
              ['Fluency', results.fluency],
              ['Completeness', results.completeness],
              ['Confidence', results.confidence],
              ['Required', results.passing_score],
            ].map(([label, value]) => (
              <Metric key={String(label)} label={String(label)} value={`${percent(value)}%`} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="statistics" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="word-analysis">Word Analysis</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="statistics">
          <Card>
            <CardHeader>
              <CardTitle>Assessment Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Metric label="Total Words" value={results.word_count || 0} />
                <Metric label="Correct" value={results.correct_words || 0} />
                <Metric label="Mispronounced" value={results.mispronounced_words || 0} />
                <Metric label="Skipped" value={results.omitted_words || 0} />
                <Metric label="Repeated" value={results.repeated_words || 0} />
                <Metric label="Inserted" value={results.extra_words || 0} />
                <Metric label="WPM" value={percent(results.words_per_minute)} />
                <Metric label="Duration" value={formatTime(results.duration_seconds)} />
                <Metric label="Fillers" value={commonIssues.filler_count || 0} />
                <Metric label="Long Pauses" value={commonIssues.long_pause_count || 0} />
              </div>

              {soundRows.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {soundRows.slice(0, 8).map((item: any) => (
                    <div key={item.sound} className="rounded-lg border bg-white p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{item.sound}</span>
                        <span>{percent(item.accuracy)}%</span>
                      </div>
                      <Progress value={percent(item.accuracy)} className="mt-2" />
                    </div>
                  ))}
                </div>
              ) : null}

              {results.audio_url ? (
                <div className="border-t pt-4">
                  <h3 className="mb-3 font-semibold">Recording Playback</h3>
                  <audio controls className="w-full" src={results.audio_url} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="word-analysis">
          <Card>
            <CardHeader>
              <CardTitle>Word-by-Word Analysis</CardTitle>
              <CardDescription>Expected words compared with recognized speech.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2 text-sm leading-7">
                {wordAnalysis.map((word, index) => (
                  <span
                    key={`${word.word_index}-${index}`}
                    className={`rounded-md border px-2 py-1 ${statusClass(word.status)}`}
                    title={word.feedback || word.status}
                  >
                    {word.expected_word || word.spoken_word || '-'}
                  </span>
                ))}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expected</TableHead>
                      <TableHead>Recognized</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Sound Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wordAnalysis.slice(0, 120).map((word, index) => (
                      <TableRow key={`${word.word_index}-row-${index}`}>
                        <TableCell>{word.expected_word || '-'}</TableCell>
                        <TableCell>{word.spoken_word || '-'}</TableCell>
                        <TableCell>{word.status}</TableCell>
                        <TableCell>{word.confidence !== null && word.confidence !== undefined ? `${percent(word.confidence * 100)}%` : '-'}</TableCell>
                        <TableCell>{word.phoneme_data?.sound || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback">
          <div className="grid gap-4 xl:grid-cols-2">
            <FeedbackCard title="Strengths" value={results.strengths} />
            <FeedbackCard title="Areas for Improvement" value={results.improvement_areas} />
            <FeedbackCard title="Recommended Practice" value={results.recommendations} />
            <Card>
              <CardHeader>
                <CardTitle>Common Issues</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700">
                {(commonIssues.most_common_mistakes || []).slice(0, 8).map((item: any) => (
                  <div key={item.word} className="flex justify-between rounded-lg border bg-white px-3 py-2">
                    <span>{item.word}</span>
                    <span>{item.count}</span>
                  </div>
                ))}
                {!commonIssues.most_common_mistakes?.length ? (
                  <p className="text-slate-500">No recurring word issues were detected.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex gap-3">
        {onClose ? (
          <Button onClick={onClose} variant="outline" className="flex-1">
            Close
          </Button>
        ) : null}
        <Button onClick={() => window.print()} variant="outline" className="flex-1">
          Print Results
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function FeedbackCard({ title, value }: { title: string; value?: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {value || 'No feedback available yet.'}
        </p>
      </CardContent>
    </Card>
  );
}

export default ReadingResultsDisplay;
