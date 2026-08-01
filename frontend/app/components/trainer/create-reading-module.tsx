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
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Module Title" required>
                <Input value={formData.title} onChange={(e) => setField('title', e.target.value)} placeholder="Customer Service Pronunciation" />
              </Field>
              <Field label="Reading Title">
                <Input value={formData.readingTitle} onChange={(e) => setField('readingTitle', e.target.value)} placeholder="Claims Verification Script" />
              </Field>
              <Field label="Reading Category">
                <Input value={formData.readingCategory} onChange={(e) => setField('readingCategory', e.target.value)} placeholder="Telephone Script" />
              </Field>
              <Field label="Language">
                <Input value={formData.language} onChange={(e) => setField('language', e.target.value)} placeholder="en-US" />
              </Field>
            </div>

            <Field label="Description">
              <Textarea value={formData.description} onChange={(e) => setField('description', e.target.value)} rows={2} />
            </Field>

            <Field label="Instructions">
              <Textarea value={formData.instructions} onChange={(e) => setField('instructions', e.target.value)} rows={3} />
            </Field>

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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <NumberField label="Passing Score (%)" value={formData.passingScore} min={1} max={100} onChange={(value) => setField('passingScore', value)} />
              <NumberField label="Maximum Attempts" value={formData.maxAttempts} min={0} max={10} onChange={(value) => setField('maxAttempts', value)} />
              <NumberField label="Time Limit Seconds" value={formData.timeLimitSeconds} min={0} onChange={(value) => setField('timeLimitSeconds', value)} />
              <Field label="Difficulty">
                <select
                  value={formData.difficulty}
                  onChange={(e) => setField('difficulty', e.target.value as Difficulty)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="basic">Basic</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </Field>
            </div>

            <Section title="Score Thresholds">
              <NumberField label="Minimum Pronunciation" value={formData.minimumPronunciationScore} min={0} max={100} onChange={(value) => setField('minimumPronunciationScore', value)} />
              <NumberField label="Minimum Accuracy" value={formData.minimumAccuracy} min={0} max={100} onChange={(value) => setField('minimumAccuracy', value)} />
              <NumberField label="Minimum Completeness" value={formData.minimumCompleteness} min={0} max={100} onChange={(value) => setField('minimumCompleteness', value)} />
              <NumberField label="Minimum Fluency" value={formData.minimumFluency} min={0} max={100} onChange={(value) => setField('minimumFluency', value)} />
            </Section>

            <Section title="Recording Controls">
              <Toggle label="Allow Replay" checked={formData.allowReplay} onChange={(value) => setField('allowReplay', value)} />
              <Toggle label="Allow Pause" checked={formData.allowPause} onChange={(value) => setField('allowPause', value)} />
              <Toggle label="Auto Submit" checked={formData.autoSubmit} onChange={(value) => setField('autoSubmit', value)} />
              <Toggle label="Manual Review" checked={formData.manualReviewRequired} onChange={(value) => setField('manualReviewRequired', value)} />
            </Section>

            <Section title="AI Analysis">
              {[
                ['Pronunciation', 'pronunciation'],
                ['Fluency', 'fluency'],
                ['Accuracy', 'accuracy'],
                ['Completeness', 'completeness'],
                ['Confidence', 'confidence'],
                ['Word Analysis', 'word_analysis'],
                ['Mispronounced Words', 'mispronounced_words'],
                ['Sound Analysis', 'sound_analysis'],
                ['Suggestions', 'suggestions'],
              ].map(([label, key]) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={Boolean(formData.ai[key])}
                  onChange={(value) => setField('ai', { ...formData.ai, [key]: value })}
                />
              ))}
            </Section>

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
