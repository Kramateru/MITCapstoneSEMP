'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface ReadingAssessmentProps {
  moduleId: string;
  reading: {
    title: string;
    instructions?: string;
    passingScore: number;
    wordCount: number;
    readingContent: string;
  };
  onComplete?: (attemptId: string) => void;
}

export function TraineeReadingAssessment({ moduleId, reading, onComplete }: ReadingAssessmentProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [stage, setStage] = useState<
    'preparation' | 'recording' | 'review' | 'uploading' | 'processing' | 'complete'
  >('preparation');
  
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [attemptId, setAttemptId] = useState<string>('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setStage('review');

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setMediaRecorder(recorder);
      setStage('recording');
      setRecordingTime(0);

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast({
        title: 'Recording Started',
        description: 'Read the passage aloud clearly. Click "Stop Recording" when done.',
      });
    } catch (error: any) {
      console.error('Microphone access error:', error);
      const errorMsg = error.name === 'NotAllowedError'
        ? 'Microphone access denied. Please grant permissions and try again.'
        : error.name === 'NotFoundError'
        ? 'No microphone found. Please connect a microphone.'
        : 'Unable to access microphone.';

      toast({
        title: 'Microphone Error',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRerecord = () => {
    setAudioBlob(null);
    setAudioUrl('');
    setRecordingTime(0);
    startRecording();
  };

  const handleSubmit = async () => {
    if (!audioBlob) {
      toast({
        title: 'Error',
        description: 'No recording found',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Step 1: Start attempt
      const startResponse = await fetch(`/api/trainee/reading/attempts/${moduleId}/start`, {
        method: 'POST',
      });
      if (!startResponse.ok) {
        throw new Error(`Start attempt failed with status ${startResponse.status}`);
      }
      const startData = await startResponse.json();
      const newAttemptId = startData.attempt_id;
      setAttemptId(newAttemptId);

      // Step 2: Upload audio
      setStage('uploading');
      const formData = new FormData();
      formData.append('file', audioBlob, 'reading-attempt.webm');

      const uploadResponse = await fetch(
        `/api/trainee/reading/attempts/${newAttemptId}/upload-audio`,
        {
          method: 'POST',
          body: formData,
        },
      );
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      // Step 3: Process assessment
      setStage('processing');
      const processResponse = await fetch(
        `/api/trainee/reading/attempts/${newAttemptId}/process`,
        { method: 'POST' },
      );
      if (!processResponse.ok) {
        throw new Error(`Process failed with status ${processResponse.status}`);
      }
      const processData = await processResponse.json();

      setResults(processData);
      setStage('complete');

      toast({
        title: 'Assessment Complete',
        description: 'Your reading has been analyzed. Review your results below.',
      });

      if (onComplete) {
        onComplete(newAttemptId);
      }
    } catch (error: any) {
      console.error('Assessment submission error:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to process assessment',
        variant: 'destructive',
      });
      setStage('review');
    } finally {
      setLoading(false);
    }
  };

  // Preparation stage
  if (stage === 'preparation') {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{reading.title}</CardTitle>
          <CardDescription>Reading & Pronunciation Assessment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Instructions</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{reading.instructions}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{reading.wordCount}</div>
              <div className="text-sm text-gray-600">Words</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{reading.passingScore}%</div>
              <div className="text-sm text-gray-600">Passing Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">~{Math.ceil(reading.wordCount / 130)}</div>
              <div className="text-sm text-gray-600">Min to Read</div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
            <h3 className="font-semibold mb-3">Reading Passage</h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {reading.readingContent}
            </p>
          </div>

          <Button onClick={startRecording} size="lg" className="w-full">
            🎤 Start Recording
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Recording stage
  if (stage === 'recording') {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Recording in Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center animate-pulse">
              <div className="w-16 h-16 rounded-full bg-red-500"></div>
            </div>
            <div className="text-4xl font-mono font-bold text-gray-800">
              {formatTime(recordingTime)}
            </div>
            <p className="text-gray-600">Reading the passage aloud...</p>
          </div>

          <Button onClick={stopRecording} size="lg" className="w-full bg-red-600 hover:bg-red-700">
            ⏹️ Stop Recording
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Review stage
  if (stage === 'review') {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Review Recording</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-3">Duration: {formatTime(recordingTime)}</p>
            {audioUrl && (
              <audio controls className="w-full" controlsList="nodownload">
                <source src={audioUrl} type="audio/webm" />
                Your browser does not support the audio element.
              </audio>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleRerecord}
              variant="outline"
              className="flex-1"
              disabled={loading}
            >
              🔄 Re-record
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={loading}
            >
              {loading ? 'Submitting...' : '✓ Submit for Analysis'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Uploading/Processing stages
  if (stage === 'uploading' || stage === 'processing') {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>
            {stage === 'uploading' ? 'Uploading Recording' : 'Analyzing Pronunciation'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-600">
              {stage === 'uploading'
                ? 'Uploading your recording to our servers...'
                : 'Analyzing your pronunciation and speech patterns...'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Complete stage - show results
  if (stage === 'complete' && results) {
    const passed = results.passed;
    const score = Math.round(results.score);

    return (
      <div className="w-full max-w-4xl space-y-4">
        {/* Main Result Card */}
        <Card className={passed ? 'border-green-300' : 'border-orange-300'}>
          <CardHeader>
            <CardTitle className={passed ? 'text-green-700' : 'text-orange-700'}>
              {passed ? '✓ PASSED' : '✗ Needs Improvement'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className={`text-4xl font-bold ${passed ? 'text-green-600' : 'text-orange-600'}`}>
                  {score}%
                </div>
                <div className="text-sm text-gray-600">Your Score</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600">{results.passing_score}%</div>
                <div className="text-sm text-gray-600">Required</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Word Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">{results.correct_words}</div>
                <div className="text-sm text-gray-600">Correct</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded">
                <div className="text-2xl font-bold text-orange-600">{results.mispronounced_words}</div>
                <div className="text-sm text-gray-600">Mispronounced</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded">
                <div className="text-2xl font-bold text-red-600">{results.omitted_words}</div>
                <div className="text-sm text-gray-600">Omitted</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-600">{results.extra_words}</div>
                <div className="text-sm text-gray-600">Extra</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Strengths */}
        {results.strengths && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Strengths</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{results.strengths}</p>
            </CardContent>
          </Card>
        )}

        {/* Areas for Improvement */}
        {results.improvement_areas && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Areas for Improvement</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{results.improvement_areas}</p>
            </CardContent>
          </Card>
        )}

        {/* Common Issues */}
        {results.common_issues && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Most Common Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{results.common_issues}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button onClick={() => router.back()} variant="outline" className="flex-1">
            ← Back to Module
          </Button>
          <Button
            onClick={() => {
              setStage('preparation');
              setAudioBlob(null);
              setAudioUrl('');
              setRecordingTime(0);
            }}
            className="flex-1"
          >
            🔄 Try Again
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

export default TraineeReadingAssessment;
