'use client';

import { useRouter } from 'next/navigation';
import React, { useMemo, useRef, useState } from 'react';
import { LazyIcon } from '@/app/components/ui/LazyIcon';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

const Bold = (props: any) => <LazyIcon name="Bold" {...props} />;
const Heading2 = (props: any) => <LazyIcon name="Heading2" {...props} />;
const Italic = (props: any) => <LazyIcon name="Italic" {...props} />;
const List = (props: any) => <LazyIcon name="List" {...props} />;

type Difficulty = 'basic' | 'intermediate' | 'advanced';

interface ReadingModuleFormData {
  title: string;
  readingTitle: string;
  readingCategory: string;
  description: string;
  instructions: string;
  readingContent: string;
  passingScore: number;
  minimumPronunciationScore: number;
  minimumAccuracy: number;
  minimumCompleteness: number;
  minimumFluency: number;
  maxAttempts: number;
  timeLimitSeconds: number;
  language: string;
  difficulty: Difficulty;
  allowReplay: boolean;
  allowPause: boolean;
  autoSubmit: boolean;
  manualReviewRequired: boolean;
  ai: Record<string, boolean>;
}

const DEFAULT_FORM_DATA: ReadingModuleFormData = {
  title: '',
  readingTitle: '',
  readingCategory: 'BPO Communication',
  description: '',
  instructions: 'Read the passage aloud clearly and naturally. Pause at punctuation and complete ending consonants.',
  readingContent: '',
  passingScore: 85,
  minimumPronunciationScore: 0,
  minimumAccuracy: 0,
  minimumCompleteness: 0,
  minimumFluency: 0,
  maxAttempts: 3,
  timeLimitSeconds: 0,
  language: 'en-US',
  difficulty: 'intermediate',
  allowReplay: true,
  allowPause: true,
  autoSubmit: false,
  manualReviewRequired: false,
  ai: {
    pronunciation: true,
    fluency: true,
    accuracy: true,
    completeness: true,
    confidence: true,
    word_analysis: true,
    mispronounced_words: true,
    sound_analysis: true,
    suggestions: true,
  },
};

function stripMarkup(value: string) {
  return (value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getReadingStats(value: string) {
  const plainText = stripMarkup(value);
  const words = plainText.match(/\b[\w']+\b/g) || [];
  const sentences = plainText.split(/[.!?]+(?:\s|$)/).filter((item) => item.trim()).length;
  const paragraphs = plainText.split(/\n{2,}/).filter((item) => item.trim()).length || (plainText ? 1 : 0);
  const averageWordsPerSentence = sentences ? words.length / sentences : 0;
  const readingLevel = words.length < 120 || averageWordsPerSentence <= 12
    ? 'Basic'
    : averageWordsPerSentence <= 20
      ? 'Intermediate'
      : 'Advanced';

  return {
    words: words.length,
    sentences,
    paragraphs,
    readingLevel,
    estimatedMinutes: Math.max(1, Math.ceil(words.length / 130)),
    plainText,
  };
}

export function CreateReadingModule() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ReadingModuleFormData>(DEFAULT_FORM_DATA);
  const passageRef = useRef<HTMLTextAreaElement | null>(null);
  const stats = useMemo(() => getReadingStats(formData.readingContent), [formData.readingContent]);

  function setField<K extends keyof ReadingModuleFormData>(key: K, value: ReadingModuleFormData[K]) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  function insertMarkup(openTag: string, closeTag: string, fallback: string) {
    const field = passageRef.current;
    const currentValue = formData.readingContent;
    const start = field?.selectionStart ?? currentValue.length;
    const end = field?.selectionEnd ?? currentValue.length;
    const selected = currentValue.slice(start, end) || fallback;
    const nextValue = `${currentValue.slice(0, start)}${openTag}${selected}${closeTag}${currentValue.slice(end)}`;
    setField('readingContent', nextValue);
    window.setTimeout(() => field?.focus(), 0);
  }

  function validateForm() {
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'Module title is required', variant: 'destructive' });
      return false;
    }
    if (!stats.plainText) {
      toast({ title: 'Error', description: 'Reading passage is required', variant: 'destructive' });
      return false;
    }
    if (stats.words < 10) {
      toast({ title: 'Error', description: 'Reading passage must have at least 10 words', variant: 'destructive' });
      return false;
    }
    if (formData.passingScore < 1 || formData.passingScore > 100) {
      toast({ title: 'Error', description: 'Passing score must be between 1 and 100', variant: 'destructive' });
      return false;
    }
    if (formData.maxAttempts < 0 || formData.maxAttempts > 10) {
      toast({ title: 'Error', description: 'Maximum attempts must be between 0 and 10', variant: 'destructive' });
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/trainee/reading/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          reading_title: formData.readingTitle || formData.title,
          reading_category: formData.readingCategory,
          description: formData.description,
          reading_rich_content: formData.readingContent,
          reading_content: stats.plainText,
          passing_score: formData.passingScore,
          instructions: formData.instructions,
          max_attempts: formData.maxAttempts,
          time_limit_seconds: formData.timeLimitSeconds > 0 ? formData.timeLimitSeconds : null,
          difficulty: formData.difficulty,
          language: formData.language,
          estimated_reading_time: stats.estimatedMinutes,
          allow_replay: formData.allowReplay,
          allow_pause: formData.allowPause,
          auto_submit: formData.autoSubmit,
          manual_review_required: formData.manualReviewRequired,
          minimum_pronunciation_score: formData.minimumPronunciationScore,
          minimum_accuracy: formData.minimumAccuracy,
          minimum_completeness: formData.minimumCompleteness,
          minimum_fluency: formData.minimumFluency,
          ai_configuration: {
            voice_assessment_enabled: true,
            ...formData.ai,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `Request failed with status ${response.status}`);
      }

      toast({ title: 'Success', description: 'Reading pronunciation module created successfully' });
      setFormData(DEFAULT_FORM_DATA);
      router.push('/trainer/microlearning');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create reading module',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Create Reading Pronunciation Assessment</CardTitle>
          <CardDescription>
            Create one passage trainees read aloud through their microphone for AI pronunciation scoring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4">
              <Field label="Module Title" required>
                <Input value={formData.title} onChange={(e) => setField('title', e.target.value)} placeholder="Customer Service Pronunciation" />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label htmlFor="reading-content">Reading Passage *</Label>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="outline" size="icon" onClick={() => insertMarkup('<h2>', '</h2>', 'Heading')}>
                    <Heading2 className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => insertMarkup('<strong>', '</strong>', 'bold text')}>
                    <Bold className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => insertMarkup('<em>', '</em>', 'italic text')}>
                    <Italic className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => insertMarkup('<ul>\n<li>', '</li>\n</ul>', 'list item')}>
                    <List className="size-4" />
                  </Button>
                </div>
              </div>
              <Textarea
                ref={passageRef}
                id="reading-content"
                value={formData.readingContent}
                onChange={(e) => setField('readingContent', e.target.value)}
                placeholder="Paste the story, essay, dialogue, customer service script, or call center scenario here."
                rows={12}
                required
                className="text-base leading-7"
              />
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>{stats.words} words</span>
                <span>{stats.sentences} sentences</span>
                <span>{stats.paragraphs} paragraphs</span>
                <span>{stats.readingLevel} level</span>
                <span>Est. {stats.estimatedMinutes} min</span>
                <span>Pass target: {Math.ceil((stats.words * formData.passingScore) / 100)} correct words</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Creating...' : 'Create Reading Assessment'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
      />
    </Field>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="font-medium">{title}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        className="size-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default CreateReadingModule;
