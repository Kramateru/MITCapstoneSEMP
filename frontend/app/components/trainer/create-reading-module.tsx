'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

interface ReadingModuleFormData {
  title: string;
  description?: string;
  readingContent: string;
  instructions?: string;
  passingScore: number;
  maxAttempts: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

const DEFAULT_FORM_DATA: ReadingModuleFormData = {
  title: '',
  description: '',
  readingContent: '',
  instructions: 'Read the passage aloud clearly and naturally.',
  passingScore: 85,
  maxAttempts: 3,
  difficulty: 'intermediate',
};

export function CreateReadingModule() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ReadingModuleFormData>(DEFAULT_FORM_DATA);

  // Calculate word count automatically
  const wordCount = formData.readingContent
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;

  // Estimate reading time (average: 130 words per minute)
  const estimatedReadingTime = Math.ceil(wordCount / 130);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'passingScore' || name === 'maxAttempts' ? parseInt(value, 10) : value,
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      toast({ title: 'Error', description: 'Module title is required', variant: 'destructive' });
      return false;
    }

    if (!formData.readingContent.trim()) {
      toast({
        title: 'Error',
        description: 'Reading content is required',
        variant: 'destructive',
      });
      return false;
    }

    if (wordCount < 10) {
      toast({
        title: 'Error',
        description: 'Reading content must have at least 10 words',
        variant: 'destructive',
      });
      return false;
    }

    if (formData.passingScore < 0 || formData.passingScore > 100) {
      toast({
        title: 'Error',
        description: 'Passing score must be between 0 and 100',
        variant: 'destructive',
      });
      return false;
    }

    if (formData.maxAttempts < 1 || formData.maxAttempts > 10) {
      toast({
        title: 'Error',
        description: 'Maximum attempts must be between 1 and 10',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/trainee/reading/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          reading_content: formData.readingContent,
          passing_score: formData.passingScore,
          instructions: formData.instructions,
          max_attempts: formData.maxAttempts,
          difficulty: formData.difficulty,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `Request failed with status ${response.status}`);
      }

      toast({
        title: 'Success',
        description: 'Reading module created successfully',
      });

      // Reset form
      setFormData(DEFAULT_FORM_DATA);

      // Redirect to module or dashboard
      router.push('/trainer/microlearning');
    } catch (error: any) {
      console.error('Failed to create reading module:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create reading module',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create Reading Assessment Module</CardTitle>
          <CardDescription>
            Create a reading passage for trainees to practice pronunciation and reading skills
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title Field */}
            <div className="space-y-2">
              <Label htmlFor="title">Module Title *</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., Customer Service Excellence"
                required
              />
            </div>

            {/* Description Field */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Brief description of what trainees will learn..."
                rows={2}
              />
            </div>

            {/* Instructions Field */}
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea
                id="instructions"
                name="instructions"
                value={formData.instructions}
                onChange={handleChange}
                placeholder="Instructions for trainees on how to complete this assessment..."
                rows={3}
              />
            </div>

            {/* Reading Content - Main Field */}
            <div className="space-y-2">
              <Label htmlFor="readingContent">Reading Content *</Label>
              <div className="text-sm text-gray-600 mb-2">
                Paste or type the passage, article, story, or text that trainees should read aloud.
              </div>
              <Textarea
                id="readingContent"
                name="readingContent"
                value={formData.readingContent}
                onChange={handleChange}
                placeholder="Paste the reading passage here..."
                rows={10}
                required
                className="font-serif"
              />
              <div className="flex gap-4 text-sm text-gray-600 mt-2">
                <div>
                  <span className="font-semibold">Word Count:</span> {wordCount} words
                </div>
                <div>
                  <span className="font-semibold">Est. Reading Time:</span> {estimatedReadingTime}{' '}
                  min
                </div>
              </div>
            </div>

            {/* Passing Score */}
            <div className="space-y-2">
              <Label htmlFor="passingScore">Passing Score (%)</Label>
              <Input
                id="passingScore"
                name="passingScore"
                type="number"
                min="0"
                max="100"
                value={formData.passingScore}
                onChange={handleChange}
                required
              />
              <div className="text-sm text-gray-600">
                Trainees must achieve at least {formData.passingScore}% pronunciation accuracy to pass
              </div>
            </div>

            {/* Difficulty Level */}
            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty Level</Label>
              <select
                id="difficulty"
                name="difficulty"
                value={formData.difficulty}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="beginner">Beginner (Simple vocabulary, short sentences)</option>
                <option value="intermediate">
                  Intermediate (Standard vocabulary and sentence complexity)
                </option>
                <option value="advanced">
                  Advanced (Complex vocabulary, technical terms, longer sentences)
                </option>
              </select>
            </div>

            {/* Max Attempts */}
            <div className="space-y-2">
              <Label htmlFor="maxAttempts">Maximum Attempts</Label>
              <Input
                id="maxAttempts"
                name="maxAttempts"
                type="number"
                min="1"
                max="10"
                value={formData.maxAttempts}
                onChange={handleChange}
                required
              />
              <div className="text-sm text-gray-600">
                Number of times trainees can attempt this assessment
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Creating...' : 'Create Module'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default CreateReadingModule;
