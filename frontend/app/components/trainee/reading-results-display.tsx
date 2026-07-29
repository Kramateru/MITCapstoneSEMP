'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../hooks/use-toast';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface WordAnalysis {
  word_index: number;
  expected_word: string;
  spoken_word?: string;
  status: 'correct' | 'mispronounced' | 'omitted' | 'extra' | 'uncertain';
  confidence?: number;
  feedback?: string;
}

interface ReadingResultsDisplayProps {
  attemptId: string;
  onClose?: () => void;
}

export function ReadingResultsDisplay({ attemptId, onClose }: ReadingResultsDisplayProps) {
  const { toast } = useToast();
  const [results, setResults] = useState<any>(null);
  const [wordAnalysis, setWordAnalysis] = useState<WordAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await fetch(`/api/trainee/reading/attempts/${attemptId}`);
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status}`);
        }
        const data = await response.json();
        setResults(data);
        setWordAnalysis(data.word_analysis || []);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch results:', err);
        setError(err?.message || 'Failed to load results');
        toast({
          title: 'Error',
          description: 'Could not load assessment results',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [attemptId, toast]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading results...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !results) {
    return (
      <Card className="border-red-300">
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 font-semibold">{error || 'Failed to load results'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'correct':
        return 'bg-green-100 text-green-900';
      case 'mispronounced':
        return 'bg-orange-100 text-orange-900';
      case 'omitted':
        return 'bg-red-100 text-red-900';
      case 'extra':
        return 'bg-blue-100 text-blue-900';
      case 'uncertain':
        return 'bg-yellow-100 text-yellow-900';
      default:
        return 'bg-gray-100 text-gray-900';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'correct':
        return '✓';
      case 'mispronounced':
        return '✗';
      case 'omitted':
        return '⊘';
      case 'extra':
        return '⊕';
      case 'uncertain':
        return '?';
      default:
        return '◆';
    }
  };

  const passed = results.passed;
  const score = Math.round(results.score);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* Score Card */}
      <Card className={passed ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'}>
        <CardHeader>
          <CardTitle className={passed ? 'text-green-700' : 'text-orange-700'}>
            {passed ? '✓ Assessment Passed' : '✗ Assessment Needs Improvement'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className={`text-5xl font-bold ${passed ? 'text-green-600' : 'text-orange-600'}`}>
                {score}%
              </div>
              <div className="text-sm text-gray-600 mt-2">Your Score</div>
            </div>
            <div className="text-center border-l border-gray-300">
              <div className="text-5xl font-bold text-blue-600">{results.passing_score}%</div>
              <div className="text-sm text-gray-600 mt-2">Passing Required</div>
            </div>
            <div className="text-center border-l border-gray-300">
              <div className="text-5xl font-bold text-purple-600">
                {results.attempt_number}
              </div>
              <div className="text-sm text-gray-600 mt-2">Attempt Number</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Tabs */}
      <Tabs defaultValue="statistics" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="word-analysis">Word Analysis</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        {/* Statistics Tab */}
        <TabsContent value="statistics">
          <Card>
            <CardHeader>
              <CardTitle>Assessment Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-gray-800">{results.word_count}</div>
                  <div className="text-sm text-gray-600 mt-1">Total Words</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">{results.correct_words}</div>
                  <div className="text-sm text-gray-600 mt-1">Correct</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-3xl font-bold text-orange-600">{results.mispronounced_words}</div>
                  <div className="text-sm text-gray-600 mt-1">Mispronounced</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-3xl font-bold text-red-600">{results.omitted_words}</div>
                  <div className="text-sm text-gray-600 mt-1">Omitted</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{results.extra_words}</div>
                  <div className="text-sm text-gray-600 mt-1">Extra</div>
                </div>
              </div>

              {results.audio_url && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Recording Playback</h3>
                  <audio controls className="w-full">
                    <source src={results.audio_url} type="audio/webm" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}

              {results.transcript && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Transcript</h3>
                  <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 max-h-40 overflow-y-auto">
                    {results.transcript}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Word Analysis Tab */}
        <TabsContent value="word-analysis">
          <Card>
            <CardHeader>
              <CardTitle>Word-by-Word Analysis</CardTitle>
              <CardDescription>
                View how each word was pronounced compared to the expected text
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-6">
                {wordAnalysis.map((word, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-2 rounded-lg font-medium text-sm ${getStatusColor(word.status)} flex items-center gap-1`}
                    title={word.feedback || word.status}
                  >
                    <span className="font-bold">{getStatusIcon(word.status)}</span>
                    <span>{word.spoken_word || word.expected_word}</span>
                    {word.confidence !== undefined && (
                      <span className="text-xs opacity-70">({Math.round(word.confidence * 100)}%)</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border border-green-400 rounded"></div>
                  <span>
                    <strong>Correct:</strong> Word pronounced correctly
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-100 border border-orange-400 rounded"></div>
                  <span>
                    <strong>Mispronounced:</strong> Word recognized but pronounced incorrectly
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-100 border border-red-400 rounded"></div>
                  <span>
                    <strong>Omitted:</strong> Word was skipped
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-100 border border-blue-400 rounded"></div>
                  <span>
                    <strong>Extra:</strong> Word was added that wasn't in the original text
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-100 border border-yellow-400 rounded"></div>
                  <span>
                    <strong>Uncertain:</strong> Word recognition had low confidence
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback">
          <div className="space-y-4">
            {/* Strengths */}
            {results.strengths && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="text-2xl">💪</span> Your Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{results.strengths}</p>
                </CardContent>
              </Card>
            )}

            {/* Improvement Areas */}
            {results.improvement_areas && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="text-2xl">🎯</span> Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{results.improvement_areas}</p>
                </CardContent>
              </Card>
            )}

            {/* Common Issues */}
            {results.common_issues && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="text-2xl">⚠️</span> Most Common Issues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{results.common_issues}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {onClose && (
          <Button onClick={onClose} variant="outline" className="flex-1">
            ← Close
          </Button>
        )}
        <Button onClick={() => window.print()} variant="outline" className="flex-1">
          📄 Print Results
        </Button>
      </div>
    </div>
  );
}

export default ReadingResultsDisplay;
