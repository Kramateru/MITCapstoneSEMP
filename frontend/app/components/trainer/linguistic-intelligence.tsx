'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Heart, MessageSquare, Ban, Plus, X, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function LinguisticIntelligence() {
  const [empathyPhrases, setEmpathyPhrases] = useState([
    'I understand how frustrating that must be',
    'I realize how important this is to you',
    'I appreciate your patience',
    'Let me help you with that right away',
    'I can see why you would be concerned'
  ]);
  const [probingQuestions, setProbingQuestions] = useState([
    'Can you tell me more about what happened?',
    'When did you first notice this issue?',
    'What steps have you already tried?',
    'How is this affecting your experience?'
  ]);
  const [forbiddenWords, setForbiddenWords] = useState([
    'I can\'t',
    'No way',
    'That\'s impossible',
    'You should have',
    'Actually',
    'Basically',
    'Honestly'
  ]);

  const [newEmpathy, setNewEmpathy] = useState('');
  const [newProbing, setNewProbing] = useState('');
  const [newForbidden, setNewForbidden] = useState('');

  const addEmpathyPhrase = () => {
    if (newEmpathy.trim()) {
      setEmpathyPhrases([...empathyPhrases, newEmpathy.trim()]);
      setNewEmpathy('');
      toast.success('Empathy phrase added');
    }
  };

  const addProbingQuestion = () => {
    if (newProbing.trim()) {
      setProbingQuestions([...probingQuestions, newProbing.trim()]);
      setNewProbing('');
      toast.success('Probing question added');
    }
  };

  const addForbiddenWord = () => {
    if (newForbidden.trim()) {
      setForbiddenWords([...forbiddenWords, newForbidden.trim()]);
      setNewForbidden('');
      toast.success('Forbidden word/phrase added');
    }
  };

  const removeEmpathy = (index: number) => {
    setEmpathyPhrases(empathyPhrases.filter((_, i) => i !== index));
  };

  const removeProbing = (index: number) => {
    setProbingQuestions(probingQuestions.filter((_, i) => i !== index));
  };

  const removeForbidden = (index: number) => {
    setForbiddenWords(forbiddenWords.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    toast.success('Linguistic intelligence settings saved successfully');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl mb-2">Linguistic Intelligence Workspace</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Configure AI-powered speech recognition for empathy, probing questions, and forbidden phrases
          </p>
        </div>
        <Button onClick={handleSave}>
          <Save className="size-4 mr-2" />
          Save All Changes
        </Button>
      </div>

      <Tabs defaultValue="empathy" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="empathy">
            <Heart className="size-4 mr-2" />
            Empathy Library
          </TabsTrigger>
          <TabsTrigger value="probing">
            <MessageSquare className="size-4 mr-2" />
            Probing Questions
          </TabsTrigger>
          <TabsTrigger value="forbidden">
            <Ban className="size-4 mr-2" />
            Forbidden Words
          </TabsTrigger>
        </TabsList>

        {/* Empathy Library Tab */}
        <TabsContent value="empathy">
          <Card>
            <CardHeader>
              <CardTitle>Empathy Library</CardTitle>
              <CardDescription>
                Add phrases that the ASR must identify as "Empathy" statements. These phrases demonstrate understanding and emotional connection with customers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter an empathy phrase (e.g., 'I understand your concern')"
                    value={newEmpathy}
                    onChange={(e) => setNewEmpathy(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addEmpathyPhrase()}
                  />
                </div>
                <Button onClick={addEmpathyPhrase}>
                  <Plus className="size-4 mr-2" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Current Empathy Phrases ({empathyPhrases.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {empathyPhrases.map((phrase, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="px-3 py-1.5 text-sm flex items-center gap-2"
                    >
                      <Heart className="size-3 text-pink-600" />
                      {phrase}
                      <button
                        onClick={() => removeEmpathy(index)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className="text-sm mb-2">How it works:</h4>
                <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                  <li>- The ASR will scan agent responses for these phrases</li>
                  <li>- Using empathy phrases increases the "Empathy Score" in assessments</li>
                  <li>- Agents receive positive feedback when they use these phrases naturally</li>
                  <li>- Add variations and synonyms for better detection coverage</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Probing Questions Tab */}
        <TabsContent value="probing">
          <Card>
            <CardHeader>
              <CardTitle>Probing Questions</CardTitle>
              <CardDescription>
                Define mandatory questions that agents must ask to properly resolve customer issues and gather necessary information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter a probing question (e.g., 'Could you describe the problem?')"
                    value={newProbing}
                    onChange={(e) => setNewProbing(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addProbingQuestion()}
                  />
                </div>
                <Button onClick={addProbingQuestion}>
                  <Plus className="size-4 mr-2" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Mandatory Probing Questions ({probingQuestions.length})</Label>
                <div className="space-y-2">
                  {probingQuestions.map((question, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg bg-white dark:bg-gray-900"
                    >
                      <div className="flex items-center gap-3">
                        <MessageSquare className="size-4 text-blue-600" />
                        <span className="text-sm">{question}</span>
                      </div>
                      <button
                        onClick={() => removeProbing(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <h4 className="text-sm mb-2">Best Practices:</h4>
                <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                  <li>- Use open-ended questions that encourage customers to share details</li>
                  <li>- Include questions that help identify root causes</li>
                  <li>- Questions should gather information needed for resolution</li>
                  <li>- Agents must ask at least one probing question to pass assessments</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forbidden Words Tab */}
        <TabsContent value="forbidden">
          <Card>
            <CardHeader>
              <CardTitle>Forbidden Words & Phrases</CardTitle>
              <CardDescription>
                List jargon or negative phrases that trigger immediate score deductions. These words should be avoided in all customer interactions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter a forbidden word or phrase (e.g., 'I don't know')"
                    value={newForbidden}
                    onChange={(e) => setNewForbidden(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addForbiddenWord()}
                  />
                </div>
                <Button onClick={addForbiddenWord} variant="destructive">
                  <Plus className="size-4 mr-2" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Forbidden Words/Phrases ({forbiddenWords.length})</Label>
                <div className="flex flex-wrap gap-2">
                  {forbiddenWords.map((word, index) => (
                    <Badge
                      key={index}
                      variant="destructive"
                      className="px-3 py-1.5 text-sm flex items-center gap-2"
                    >
                      <Ban className="size-3" />
                      {word}
                      <button
                        onClick={() => removeForbidden(index)}
                        className="ml-1 hover:text-white"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <h4 className="text-sm mb-2">Common Categories:</h4>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <p className="text-xs mb-2">Negative Phrases:</p>
                    <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                      <li>- "I can't help you"</li>
                      <li>- "That's not my job"</li>
                      <li>- "You should have..."</li>
                      <li>- "That's impossible"</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs mb-2">Filler Words:</p>
                    <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                      <li>- "Um", "Uh", "Like"</li>
                      <li>- "Actually", "Basically"</li>
                      <li>- "Honestly", "Literally"</li>
                      <li>- "You know", "I mean"</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
