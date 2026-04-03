'use client';

import React, { useCallback, useEffect, useState } from 'react';

interface EmpathyStatement {
  id?: string;
  statement: string;
  category: string;
  language: string;
  is_approved: boolean;
}

interface ProbingQuestion {
  id?: string;
  question: string;
  context: string;
  department?: string;
  difficulty: string;
}

interface ForbiddenWord {
  id?: string;
  word: string;
  reason: string;
  severity: string;
  replacement?: string;
}

interface RequiredKeyword {
  id?: string;
  keyword: string;
  importance: string;
  context: string;
}

interface WorkspaceStats {
  total_empathy_statements: number;
  total_probing_questions: number;
  total_forbidden_words: number;
  total_required_keywords: number;
}

export default function WorkspaceEditor({ workspaceId }: { workspaceId: string }) {
  const [activeTab, setActiveTab] = useState<'empathy' | 'questions' | 'forbidden' | 'keywords'>('empathy');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<WorkspaceStats | null>(null);

  // Empathy Statements
  const [empathyStatements, setEmpathyStatements] = useState<EmpathyStatement[]>([]);
  const [newEmpathy, setNewEmpathy] = useState<EmpathyStatement>({
    statement: '',
    category: 'greeting',
    language: 'en',
    is_approved: true
  });

  // Probing Questions
  const [questions, setQuestions] = useState<ProbingQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState<ProbingQuestion>({
    question: '',
    context: 'clarification',
    difficulty: 'medium'
  });

  // Forbidden Words
  const [forbiddenWords, setForbiddenWords] = useState<ForbiddenWord[]>([]);
  const [newWord, setNewWord] = useState<ForbiddenWord>({
    word: '',
    reason: 'Offensive',
    severity: 'medium'
  });

  // Required Keywords
  const [keywords, setKeywords] = useState<RequiredKeyword[]>([]);
  const [newKeyword, setNewKeyword] = useState<RequiredKeyword>({
    keyword: '',
    importance: 'medium',
    context: ''
  });

  const loadWorkspaceData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspace/${workspaceId}/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setEmpathyStatements(data.empathy_statements || []);
        setQuestions(data.probing_questions || []);
        setForbiddenWords(data.forbidden_words || []);
        setKeywords(data.required_keywords || []);
      }
    } catch (error) {
      console.error('Error loading workspace data:', error);
    }
  }, [workspaceId]);

  const loadStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspace/${workspaceId}/statistics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading workspace stats:', error);
    }
  }, [workspaceId]);

  // Load workspace data
  useEffect(() => {
    loadWorkspaceData();
    loadStats();
  }, [loadStats, loadWorkspaceData]);

  // Empathy Statements Handlers
  const addEmpathyStatement = async () => {
    if (!newEmpathy.statement.trim()) {
      setMessage('Please enter a statement');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspace/${workspaceId}/empathy-statements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newEmpathy)
      });

      if (response.ok) {
        setMessage('Empathy statement added!');
        setNewEmpathy({ statement: '', category: 'greeting', language: 'en', is_approved: true });
        loadWorkspaceData();
        loadStats();
      } else {
        setMessage('Error adding statement');
      }
    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const deleteEmpathyStatement = async (id: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspace/${workspaceId}/empathy-statements/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        loadWorkspaceData();
        loadStats();
      }
    } catch (error) {
      console.error('Error deleting statement:', error);
    } finally {
      setLoading(false);
    }
  };

  // Probing Questions Handlers
  const addProbingQuestion = async () => {
    if (!newQuestion.question.trim()) {
      setMessage('Please enter a question');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspace/${workspaceId}/probing-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newQuestion)
      });

      if (response.ok) {
        setMessage('Question added!');
        setNewQuestion({ question: '', context: 'clarification', difficulty: 'medium' });
        loadWorkspaceData();
        loadStats();
      } else {
        setMessage('Error adding question');
      }
    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Forbidden Words Handlers
  const addForbiddenWord = async () => {
    if (!newWord.word.trim()) {
      setMessage('Please enter a word');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspace/${workspaceId}/forbidden-words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newWord)
      });

      if (response.ok) {
        setMessage('Forbidden word added!');
        setNewWord({ word: '', reason: 'Offensive', severity: 'medium' });
        loadWorkspaceData();
        loadStats();
      } else {
        setMessage('Error adding word');
      }
    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Required Keywords Handlers
  const addRequiredKeyword = async () => {
    if (!newKeyword.keyword.trim()) {
      setMessage('Please enter a keyword');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspace/${workspaceId}/required-keywords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newKeyword)
      });

      if (response.ok) {
        setMessage('Keyword added!');
        setNewKeyword({ keyword: '', importance: 'medium', context: '' });
        loadWorkspaceData();
        loadStats();
      } else {
        setMessage('Error adding keyword');
      }
    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 border-red-200';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200';
      case 'low':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Workspace NLP Configuration</h1>
          <p className="mt-2 text-gray-600">Manage empathy statements, questions, and keywords</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Empathy Statements</p>
              <p className="text-2xl font-bold text-blue-600">{stats.total_empathy_statements}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Probing Questions</p>
              <p className="text-2xl font-bold text-green-600">{stats.total_probing_questions}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Forbidden Words</p>
              <p className="text-2xl font-bold text-red-600">{stats.total_forbidden_words}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Required Keywords</p>
              <p className="text-2xl font-bold text-purple-600">{stats.total_required_keywords}</p>
            </div>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg ${message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            {['empathy', 'questions', 'forbidden', 'keywords'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as 'empathy' | 'questions' | 'forbidden' | 'keywords')}
                className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'empathy' ? 'Empathy Statements' : 
                 tab === 'questions' ? 'Probing Questions' :
                 tab === 'forbidden' ? 'Forbidden Words' :
                 'Required Keywords'}
              </button>
            ))}
          </nav>
        </div>

        {/* Empathy Statements Tab */}
        {activeTab === 'empathy' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Add Empathy Statement</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Statement</label>
                  <textarea
                    value={newEmpathy.statement}
                    onChange={(e) => setNewEmpathy({ ...newEmpathy, statement: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="e.g., I understand how frustrating this situation must be..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <select
                      value={newEmpathy.category}
                      onChange={(e) => setNewEmpathy({ ...newEmpathy, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="greeting">Greeting</option>
                      <option value="acknowledgment">Acknowledgment</option>
                      <option value="validation">Validation</option>
                      <option value="apology">Apology</option>
                      <option value="reassurance">Reassurance</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                    <select
                      value={newEmpathy.language}
                      onChange={(e) => setNewEmpathy({ ...newEmpathy, language: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={addEmpathyStatement}
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Adding...' : 'Add Statement'}
                </button>
              </div>
            </div>

            {/* Empathy Statements List */}
            <div className="space-y-3">
              {empathyStatements.map((stmt) => (
                <div key={stmt.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{stmt.statement}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                          {stmt.category}
                        </span>
                        <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                          {stmt.language.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => stmt.id && deleteEmpathyStatement(stmt.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Probing Questions Tab */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Add Probing Question</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
                  <textarea
                    value={newQuestion.question}
                    onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="e.g., Can you tell me more about when this issue started?"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Context</label>
                    <select
                      value={newQuestion.context}
                      onChange={(e) => setNewQuestion({ ...newQuestion, context: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="clarification">Clarification</option>
                      <option value="root_cause">Root Cause</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="escalation">Escalation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty</label>
                    <select
                      value={newQuestion.difficulty}
                      onChange={(e) => setNewQuestion({ ...newQuestion, difficulty: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={addProbingQuestion}
                  disabled={loading}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {loading ? 'Adding...' : 'Add Question'}
                </button>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                  <p className="font-medium text-gray-900">{q.question}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                      {q.context}
                    </span>
                    <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                      {q.difficulty}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forbidden Words Tab */}
        {activeTab === 'forbidden' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Add Forbidden Word</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Word</label>
                  <input
                    type="text"
                    value={newWord.word}
                    onChange={(e) => setNewWord({ ...newWord, word: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter word to restrict"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                    <select
                      value={newWord.reason}
                      onChange={(e) => setNewWord({ ...newWord, reason: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Offensive">Offensive</option>
                      <option value="Jargon">Jargon</option>
                      <option value="Competitor">Competitor Name</option>
                      <option value="Confidential">Confidential</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
                    <select
                      value={newWord.severity}
                      onChange={(e) => setNewWord({ ...newWord, severity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Replacement</label>
                    <input
                      type="text"
                      value={newWord.replacement || ''}
                      onChange={(e) => setNewWord({ ...newWord, replacement: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Suggested alternative word"
                    />
                  </div>
                </div>

                <button
                  onClick={addForbiddenWord}
                  disabled={loading}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                >
                  {loading ? 'Adding...' : 'Add Word'}
                </button>
              </div>
            </div>

            {/* Forbidden Words List */}
            <div className="space-y-3">
              {forbiddenWords.map((word) => (
                <div key={word.id} className={`rounded-lg shadow p-4 border-l-4 border-red-500 ${getSeverityColor(word.severity)}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{word.word}</p>
                      <p className="text-sm text-gray-600 mt-1">{word.reason}</p>
                      {word.replacement && (
                        <p className="text-sm text-green-700 mt-1"> Use instead: &quot;{word.replacement}&quot;</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      word.severity === 'high' ? 'bg-red-200 text-red-800' :
                      word.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                      'bg-blue-200 text-blue-800'
                    }`}>
                      {word.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Required Keywords Tab */}
        {activeTab === 'keywords' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Add Required Keyword</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Keyword</label>
                  <input
                    type="text"
                    value={newKeyword.keyword}
                    onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., satisfied, resolved, thank you"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Context/Usage</label>
                  <textarea
                    value={newKeyword.context}
                    onChange={(e) => setNewKeyword({ ...newKeyword, context: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                    placeholder="When should this keyword be used?"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Importance</label>
                    <select
                      value={newKeyword.importance}
                      onChange={(e) => setNewKeyword({ ...newKeyword, importance: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={addRequiredKeyword}
                  disabled={loading}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {loading ? 'Adding...' : 'Add Keyword'}
                </button>
              </div>
            </div>

            {/* Keywords List */}
            <div className="space-y-3">
              {keywords.map((kw) => (
                <div key={kw.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">&quot;{kw.keyword}&quot;</p>
                      {kw.context && <p className="text-sm text-gray-600 mt-1">{kw.context}</p>}
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      kw.importance === 'high' ? 'bg-red-100 text-red-800' :
                      kw.importance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {kw.importance.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
