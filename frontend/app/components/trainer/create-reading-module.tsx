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

interface ReadingModuleFormData {
  title: string;
  readingContent: string;
}

const DEFAULT_FORM_DATA: ReadingModuleFormData = {
  title: '',
  readingContent: '',
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
          reading_title: formData.title,
          reading_rich_content: formData.readingContent,
          reading_content: stats.plainText,
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

export default CreateReadingModule;
