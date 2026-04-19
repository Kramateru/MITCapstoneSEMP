'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Edit,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { del, get, post, put } from '@/app/utils/api';

export interface MCQQuestion {
  id: string;
  categoryId: string;
  categoryName: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string | null;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  canManage: boolean;
  createdById?: string;
  createdBy?: string;
  createdDate?: string;
  updatedDate?: string;
}

export interface MCQCategory {
  id: string;
  name: string;
  description?: string | null;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  passingThreshold: number;
  questionCount: number;
  selectedQuestionCount?: number;
  canManage: boolean;
  createdById?: string;
  createdBy?: string;
  createdRole?: string;
  createdDate?: string;
  updatedDate?: string;
}

type ApiCategory = {
  id: string;
  name: string;
  description?: string | null;
  difficulty?: 'basic' | 'intermediate' | 'advanced';
  passing_threshold?: number;
  question_count?: number;
  selected_question_count?: number;
  created_by?: string | null;
  created_by_name?: string | null;
  created_by_role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ApiQuestion = {
  id: string;
  category_id: string;
  category_name?: string | null;
  question_text: string;
  options: Record<string, string>;
  correct_option?: string;
  explanation?: string | null;
  kip_weight?: number;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CertificationSettingsPayload = {
  mcq_passing_threshold?: number;
};

type CategoryFormState = {
  name: string;
  description: string;
  difficulty: MCQCategory['difficulty'];
  passingThreshold: number;
};

type QuestionFormState = {
  categoryId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
};

const emptyCategoryForm = (passingThreshold = 90): CategoryFormState => ({
  name: '',
  description: '',
  difficulty: 'basic',
  passingThreshold,
});

const emptyQuestionForm = (): QuestionFormState => ({
  categoryId: '',
  question: '',
  options: ['', '', '', ''],
  correctAnswer: 0,
  explanation: '',
});

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
};

type MCQManagerProps = {
  scope?: 'owned' | 'all';
  onDataChanged?: () => void | Promise<void>;
};

export default function MCQManager({ scope = 'owned', onDataChanged }: MCQManagerProps) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [categories, setCategories] = useState<MCQCategory[]>([]);
  const [defaultPassingThreshold, setDefaultPassingThreshold] = useState(90);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState<QuestionFormState>(emptyQuestionForm());
  const [newCategory, setNewCategory] = useState<CategoryFormState>(emptyCategoryForm());
  const [editingCategory, setEditingCategory] = useState<CategoryFormState>(emptyCategoryForm());
  const [editingQuestion, setEditingQuestion] = useState<QuestionFormState>(emptyQuestionForm());

  const difficultyLabel = (difficulty: MCQQuestion['difficulty']) => {
    if (difficulty === 'basic') return 'Basic';
    if (difficulty === 'intermediate') return 'Intermediate';
    return 'Advanced';
  };

  const manageableCategories = useMemo(
    () => categories.filter((category) => category.canManage),
    [categories],
  );

  const loadData = async (showRefreshToast = false) => {
    try {
      setIsLoading(true);
      setIsRefreshing(true);
      setLoadError('');

      const [settingsResponse, catResponse, questionResponse] = await Promise.all([
        get<CertificationSettingsPayload>('/api/certification/settings').catch(() => null),
        get<{ count: number; categories: ApiCategory[] }>('/api/certification/mcq/categories', { scope }),
        get<{ count: number; questions: ApiQuestion[] }>('/api/certification/mcq/questions', { scope }),
      ]);
      const nextPassingThreshold = Math.max(
        typeof settingsResponse?.mcq_passing_threshold === 'number'
          ? settingsResponse.mcq_passing_threshold
          : 90,
        90,
      );
      setDefaultPassingThreshold(nextPassingThreshold);
      const mappedCategories: MCQCategory[] = (catResponse.categories || []).map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        difficulty: cat.difficulty || 'basic',
        passingThreshold:
          typeof cat.passing_threshold === 'number' ? Math.max(cat.passing_threshold, 90) : 90,
        questionCount: typeof cat.question_count === 'number' ? cat.question_count : 0,
        selectedQuestionCount:
          typeof cat.selected_question_count === 'number' ? cat.selected_question_count : 0,
        canManage: user?.user_role === 'admin' || cat.created_by === user?.user_id,
        createdById: cat.created_by || undefined,
        createdBy: cat.created_by_name || 'Unknown user',
        createdRole: cat.created_by_role || '',
        createdDate: formatDate(cat.created_at),
        updatedDate: formatDate(cat.updated_at),
      }));
      setCategories(mappedCategories);
      const categoryById = mappedCategories.reduce<Record<string, MCQCategory>>((acc, category) => {
        acc[category.id] = category;
        return acc;
      }, {});

      const mappedQuestions: MCQQuestion[] = (questionResponse.questions || []).map((question) => {
        const correctAnswer = 'ABCD'.indexOf((question.correct_option || 'A').toUpperCase());
        const category = categoryById[question.category_id];
        return {
          id: question.id,
          categoryId: question.category_id,
          categoryName: question.category_name || category?.name || 'Uncategorized',
          question: question.question_text,
          options: ['A', 'B', 'C', 'D'].map((key) => question.options?.[key] || ''),
          correctAnswer: correctAnswer >= 0 ? correctAnswer : 0,
          explanation: question.explanation,
          difficulty: category?.difficulty || 'basic',
          canManage: user?.user_role === 'admin' || question.created_by === user?.user_id,
          createdById: question.created_by || undefined,
          createdBy: question.created_by_name || 'Database',
          createdDate: formatDate(question.created_at),
          updatedDate: formatDate(question.updated_at),
        };
      });
      setQuestions(mappedQuestions);

      setNewQuestion((current) => ({
        ...current,
        categoryId:
          current.categoryId && mappedCategories.some((category) => category.id === current.categoryId && category.canManage)
            ? current.categoryId
            : mappedCategories.find((category) => category.canManage)?.id || '',
      }));
      setNewCategory((current) =>
        current.name.trim() || current.description.trim()
          ? current
          : { ...current, passingThreshold: nextPassingThreshold },
      );

      if (showRefreshToast) {
        toast.success('Assessment category and question bank refreshed successfully.');
      }
    } catch (error) {
      console.error(error);
      setLoadError('Unable to load assessment category data. Please try again.');
      if (showRefreshToast) {
        toast.error('Failed to refresh the assessment category data.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, user?.user_id, user?.user_role]);

  const categoriesById = useMemo(
    () =>
      categories.reduce<Record<string, MCQCategory>>((acc, category) => {
        acc[category.id] = category;
        return acc;
      }, {}),
    [categories],
  );

  const resetCreateQuestionForm = () =>
    setNewQuestion({
      ...emptyQuestionForm(),
      categoryId: manageableCategories[0]?.id || '',
    });

  const openCreateQuestionForm = (categoryId?: string) => {
    if (!manageableCategories.length) {
      toast.error('Create your own category first before adding questions.');
      return;
    }
    const requestedCategory = categoryId
      ? manageableCategories.find((category) => category.id === categoryId)
      : null;
    setNewQuestion({
      ...emptyQuestionForm(),
      categoryId: requestedCategory?.id || manageableCategories[0]?.id || '',
    });
    setIsCreating(true);
  };

  const startCategoryEdit = (category: MCQCategory) => {
    if (!category.canManage) {
      toast.error('This category is read-only in your trainer view.');
      return;
    }
    setEditingCategoryId(category.id);
    setEditingCategory({
      name: category.name,
      description: category.description || '',
      difficulty: category.difficulty,
      passingThreshold: category.passingThreshold,
    });
  };

  const cancelCategoryEdit = () => {
    setEditingCategoryId(null);
    setEditingCategory(emptyCategoryForm(defaultPassingThreshold));
  };

  const startQuestionEdit = (question: MCQQuestion) => {
    if (!question.canManage) {
      toast.error('This question is read-only in your trainer view.');
      return;
    }
    setEditingQuestionId(question.id);
    setEditingQuestion({
      categoryId: question.categoryId,
      question: question.question,
      options: [...question.options],
      correctAnswer: question.correctAnswer,
      explanation: question.explanation || '',
    });
  };

  const cancelQuestionEdit = () => {
    setEditingQuestionId(null);
    setEditingQuestion(emptyQuestionForm());
  };

  const handleRefresh = async () => {
    await loadData(true);
  };

  const handleCreateQuestion = async () => {
    if (
      !newQuestion.categoryId ||
      !newQuestion.question.trim() ||
      newQuestion.options.some((option) => !option.trim())
    ) {
      toast.error('Please fill in the category, question, and all answer options.');
      return;
    }

    try {
      await post('/api/certification/mcq/questions', {
        category_id: newQuestion.categoryId,
        question_text: newQuestion.question.trim(),
        option_a: newQuestion.options[0].trim(),
        option_b: newQuestion.options[1].trim(),
        option_c: newQuestion.options[2].trim(),
        option_d: newQuestion.options[3].trim(),
        correct_option: 'ABCD'[newQuestion.correctAnswer] || 'A',
        explanation: newQuestion.explanation.trim() || undefined,
      });
      toast.success('Question bank item saved to the database.');
      resetCreateQuestionForm();
      setIsCreating(false);
      await loadData();
      await onDataChanged?.();
    } catch (error) {
      console.error(error);
      toast.error('Failed to create the question bank item.');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error('Please provide a category name.');
      return;
    }

    try {
      await post('/api/certification/mcq/categories', {
        name: newCategory.name.trim(),
        description: newCategory.description.trim() || undefined,
        difficulty: newCategory.difficulty,
        passing_threshold: newCategory.passingThreshold,
      });
      toast.success('Assessment category saved to the database.');
      setNewCategory(emptyCategoryForm(defaultPassingThreshold));
      setIsCreatingCategory(false);
      await loadData();
      await onDataChanged?.();
    } catch (error) {
      console.error(error);
      toast.error('Failed to create the category.');
    }
  };

  const handleSaveCategory = async (categoryId: string) => {
    if (!editingCategory.name.trim()) {
      toast.error('Category name is required.');
      return;
    }

    try {
      await put(`/api/certification/mcq/categories/${categoryId}`, {
        name: editingCategory.name.trim(),
        description: editingCategory.description.trim() || '',
        difficulty: editingCategory.difficulty,
        passing_threshold: editingCategory.passingThreshold,
      });
      toast.success('Category updated successfully.');
      cancelCategoryEdit();
      await loadData();
      await onDataChanged?.();
    } catch (error) {
      console.error(error);
      toast.error('Failed to update the category.');
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    if (!window.confirm(`Delete the category "${categoryName}" and its questions?`)) {
      return;
    }

    try {
      await del(`/api/certification/mcq/categories/${categoryId}`);
      toast.success('Category deleted successfully.');
      if (editingCategoryId === categoryId) {
        cancelCategoryEdit();
      }
      await loadData();
      await onDataChanged?.();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete the category.');
    }
  };

  const handleSaveQuestion = async (questionId: string) => {
    if (
      !editingQuestion.categoryId ||
      !editingQuestion.question.trim() ||
      editingQuestion.options.some((option) => !option.trim())
    ) {
      toast.error('Please complete the category, question, and all options.');
      return;
    }

    try {
      await put(`/api/certification/mcq/questions/${questionId}`, {
        category_id: editingQuestion.categoryId,
        question_text: editingQuestion.question.trim(),
        option_a: editingQuestion.options[0].trim(),
        option_b: editingQuestion.options[1].trim(),
        option_c: editingQuestion.options[2].trim(),
        option_d: editingQuestion.options[3].trim(),
        correct_option: 'ABCD'[editingQuestion.correctAnswer] || 'A',
        explanation: editingQuestion.explanation.trim() || '',
      });
      toast.success('Question updated successfully.');
      cancelQuestionEdit();
      await loadData();
      await onDataChanged?.();
    } catch (error) {
      console.error(error);
      toast.error('Failed to update the question.');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this question from the question bank?')) {
      return;
    }

    try {
      await del(`/api/certification/mcq/questions/${questionId}`);
      toast.success('Question deleted successfully.');
      if (editingQuestionId === questionId) {
        cancelQuestionEdit();
      }
      await loadData();
      await onDataChanged?.();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete the question.');
    }
  };

  const handleDuplicateQuestion = async (question: MCQQuestion) => {
    try {
      await post('/api/certification/mcq/questions', {
        category_id: question.categoryId,
        question_text: `${question.question} (Copy)`,
        option_a: question.options[0],
        option_b: question.options[1],
        option_c: question.options[2],
        option_d: question.options[3],
        correct_option: 'ABCD'[question.correctAnswer] || 'A',
        explanation: question.explanation || undefined,
      });
      toast.success('Question duplicated successfully.');
      await loadData();
      await onDataChanged?.();
    } catch (error) {
      console.error(error);
      toast.error('Failed to duplicate the question.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl">
            <ClipboardList className="size-8 text-blue-600" />
            Assessment Category and Question Bank
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {scope === 'all'
              ? 'Browse every active assessment category and question-bank item saved in the database. You can edit only the records you created.'
              : 'Create trainer-owned assessment categories, build the question bank, and keep the saved counts synced with the live database.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setNewCategory(emptyCategoryForm(defaultPassingThreshold));
              setIsCreatingCategory(true);
            }}
            variant="outline"
          >
            <Plus className="mr-2 size-4" />
            New Category
          </Button>
          <Button onClick={() => openCreateQuestionForm()} disabled={!manageableCategories.length}>
            <Plus className="mr-2 size-4" />
            New Question
          </Button>
        </div>
      </div>

      <Card className="border-sky-200 bg-sky-50/70">
        <CardContent className="pt-6 text-sm text-slate-700">
          {scope === 'all'
            ? 'The manager below shows the full active question bank from the database. Trainer-owned records remain editable, while other records stay visible as read-only references.'
            : 'Best workflow: create the assessment category first, then add or move questions under that category. The cards below show the question-bank count and the saved category question-set count for each trainer-managed category.'}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{questions.length}</div>
            <p className="text-sm text-gray-500">Total Questions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{categories.length}</div>
            <p className="text-sm text-gray-500">Saved Categories</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">
              {questions.filter((question) => question.difficulty === 'basic').length}
            </div>
            <p className="text-sm text-gray-500">Basic Questions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">
              {questions.filter((question) => question.difficulty === 'advanced').length}
            </div>
            <p className="text-sm text-gray-500">Advanced Questions</p>
          </CardContent>
        </Card>
      </div>

      {isCreatingCategory && (
        <Card className="border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Create New Category</span>
              <Button size="sm" variant="ghost" onClick={() => setIsCreatingCategory(false)}>
                <X className="size-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Category Name *</Label>
              <Input
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="e.g., Grammar for Customer Service"
              />
            </div>
            <div>
              <Label>Difficulty *</Label>
              <Select
                value={newCategory.difficulty}
                onValueChange={(value) =>
                  setNewCategory({
                    ...newCategory,
                    difficulty: value as MCQCategory['difficulty'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Passing Threshold (%)</Label>
              <Input
                type="number"
                min={90}
                max={100}
                value={newCategory.passingThreshold}
                onChange={(e) =>
                  setNewCategory({
                    ...newCategory,
                    passingThreshold: Math.min(Math.max(Number(e.target.value) || 90, 90), 100),
                  })
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newCategory.description}
                onChange={(e) =>
                  setNewCategory({ ...newCategory, description: e.target.value })
                }
                placeholder="Brief description of this category"
              />
            </div>
            <Button onClick={handleCreateCategory}>
              <Save className="mr-2 size-4" />
              Save Category
            </Button>
          </CardContent>
        </Card>
      )}

      {isCreating && (
        <Card className="border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Create New Question Bank Item</span>
              <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
                <X className="size-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Saved Category *</Label>
              <Select
                value={newQuestion.categoryId}
                onValueChange={(value) => setNewQuestion({ ...newQuestion, categoryId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {manageableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Question *</Label>
              <Textarea
                value={newQuestion.question}
                onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                placeholder="Enter the multiple-choice question here"
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Answer Options *</Label>
              {newQuestion.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Badge variant="outline" className="w-8">
                    {String.fromCharCode(65 + index)}
                  </Badge>
                  <Input
                    value={option}
                    onChange={(e) => {
                      const nextOptions = [...newQuestion.options];
                      nextOptions[index] = e.target.value;
                      setNewQuestion({ ...newQuestion, options: nextOptions });
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  />
                  <input
                    type="radio"
                    name="newCorrectAnswer"
                    checked={newQuestion.correctAnswer === index}
                    onChange={() =>
                      setNewQuestion({ ...newQuestion, correctAnswer: index })
                    }
                    className="size-4"
                  />
                  <Label className="text-sm">Correct</Label>
                </div>
              ))}
            </div>

            <div>
              <Label>Explanation</Label>
              <Textarea
                value={newQuestion.explanation}
                onChange={(e) =>
                  setNewQuestion({ ...newQuestion, explanation: e.target.value })
                }
                placeholder="Explain the correct answer"
              />
            </div>

            <Button onClick={handleCreateQuestion}>
              <Save className="mr-2 size-4" />
              Save Question
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{scope === 'all' ? 'Database Category Bank' : 'Category Bank'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categories.map((category) => {
              const isEditing = editingCategoryId === category.id;
              return (
                <div key={category.id} className="rounded-lg border p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <Label>Category Name</Label>
                        <Input
                          value={editingCategory.name}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              name: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Difficulty</Label>
                        <Select
                          value={editingCategory.difficulty}
                          onValueChange={(value) =>
                            setEditingCategory({
                              ...editingCategory,
                              difficulty: value as MCQCategory['difficulty'],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basic">Basic</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Passing Threshold (%)</Label>
                        <Input
                          type="number"
                          min={90}
                          max={100}
                          value={editingCategory.passingThreshold}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              passingThreshold: Math.min(Math.max(Number(e.target.value) || 90, 90), 100),
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea
                          value={editingCategory.description}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              description: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleSaveCategory(category.id)}>
                          <Save className="mr-2 size-4" />
                          Save Changes
                        </Button>
                        <Button variant="outline" onClick={cancelCategoryEdit}>
                          <X className="mr-2 size-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-gray-900">{category.name}</h4>
                          <Badge variant="outline">
                            Difficulty: {difficultyLabel(category.difficulty)}
                          </Badge>
                          <Badge variant="outline">
                            Passing: {category.passingThreshold}%
                          </Badge>
                          <Badge>{category.questionCount} bank items</Badge>
                          <Badge variant="outline">{category.selectedQuestionCount || 0} saved to category</Badge>
                          {!category.canManage ? <Badge variant="secondary">Read Only</Badge> : null}
                        </div>
                        <p className="text-sm text-gray-500">
                          {category.description || 'No description provided.'}
                        </p>
                        <div className="text-xs text-gray-500">
                          Created: {category.createdDate} | Updated: {category.updatedDate}
                        </div>
                      </div>
                      {category.canManage ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openCreateQuestionForm(category.id)}
                          >
                            <Plus className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startCategoryEdit(category)}
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteCategory(category.id, category.name)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            {!categories.length && (
              <div className="text-sm text-gray-500">
                {scope === 'all'
                  ? 'No active categories are saved in the database yet.'
                  : 'No trainer categories have been saved yet. Create the category first, then add question-bank items under it.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{scope === 'all' ? 'All Database Questions' : 'Question Bank'}</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-3 pr-4">
              {questions.map((question, index) => {
                const isEditing = editingQuestionId === question.id;
                const category = categoriesById[question.categoryId];
                return (
                  <Card key={question.id} className="border">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{question.categoryName}</Badge>
                            <Badge
                              className={
                                question.difficulty === 'basic'
                                  ? 'bg-green-600'
                                  : question.difficulty === 'intermediate'
                                    ? 'bg-yellow-600'
                                    : 'bg-red-600'
                              }
                            >
                              {difficultyLabel(question.difficulty)}
                            </Badge>
                            {!question.canManage ? <Badge variant="secondary">Read Only</Badge> : null}
                          </div>
                          <h4 className="font-medium">
                            Q{index + 1}. {question.question}
                          </h4>
                          <div className="mt-2 text-xs text-gray-500">
                            Saved under {category?.name || question.categoryName} | Created by{' '}
                            {question.createdBy || 'Database'} | Updated {question.updatedDate}
                          </div>
                        </div>
                        {question.canManage ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDuplicateQuestion(question)}
                            >
                              <Copy className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startQuestionEdit(question)}
                            >
                              <Edit className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteQuestion(question.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isEditing ? (
                        <div className="space-y-4">
                          <div>
                            <Label>Category</Label>
                            <Select
                              value={editingQuestion.categoryId}
                              onValueChange={(value) =>
                                setEditingQuestion({
                                  ...editingQuestion,
                                  categoryId: value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                {manageableCategories.map((categoryOption) => (
                                  <SelectItem key={categoryOption.id} value={categoryOption.id}>
                                    {categoryOption.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Question</Label>
                            <Textarea
                              value={editingQuestion.question}
                              onChange={(e) =>
                                setEditingQuestion({
                                  ...editingQuestion,
                                  question: e.target.value,
                                })
                              }
                              className="min-h-[80px]"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Options</Label>
                            {editingQuestion.options.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex items-center gap-2">
                                <Badge variant="outline" className="w-8">
                                  {String.fromCharCode(65 + optionIndex)}
                                </Badge>
                                <Input
                                  value={option}
                                  onChange={(e) => {
                                    const nextOptions = [...editingQuestion.options];
                                    nextOptions[optionIndex] = e.target.value;
                                    setEditingQuestion({
                                      ...editingQuestion,
                                      options: nextOptions,
                                    });
                                  }}
                                />
                                <input
                                  type="radio"
                                  name={`editCorrectAnswer-${question.id}`}
                                  checked={editingQuestion.correctAnswer === optionIndex}
                                  onChange={() =>
                                    setEditingQuestion({
                                      ...editingQuestion,
                                      correctAnswer: optionIndex,
                                    })
                                  }
                                  className="size-4"
                                />
                                <Label className="text-sm">Correct</Label>
                              </div>
                            ))}
                          </div>
                          <div>
                            <Label>Explanation</Label>
                            <Textarea
                              value={editingQuestion.explanation}
                              onChange={(e) =>
                                setEditingQuestion({
                                  ...editingQuestion,
                                  explanation: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => handleSaveQuestion(question.id)}>
                              <Save className="mr-2 size-4" />
                              Save Changes
                            </Button>
                            <Button variant="outline" onClick={cancelQuestionEdit}>
                              <X className="mr-2 size-4" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => (
                              <div
                                key={optionIndex}
                                className={`flex items-start gap-2 rounded p-2 ${
                                  optionIndex === question.correctAnswer
                                    ? 'border border-green-200 bg-green-50'
                                    : 'bg-gray-50'
                                }`}
                              >
                                <Badge variant="outline" className="mt-0.5">
                                  {String.fromCharCode(65 + optionIndex)}
                                </Badge>
                                <span className="flex-1 text-sm">{option}</span>
                                {optionIndex === question.correctAnswer && (
                                  <CheckCircle2 className="size-4 text-green-600" />
                                )}
                              </div>
                            ))}
                          </div>
                          {question.explanation && (
                            <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
                              <p className="text-sm">
                                <strong>Explanation:</strong> {question.explanation}
                              </p>
                            </div>
                          )}
                          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                            <span>Created: {question.createdDate}</span>
                            <span>Updated: {question.updatedDate}</span>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {!questions.length && !isLoading && (
                <div className="text-sm text-gray-500">
                  {scope === 'all'
                    ? 'No active questions are saved in the database yet.'
                    : 'No questions are saved yet. Create a category and add your first question-bank item.'}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {isLoading && <div className="text-sm text-gray-500">Loading assessment category data...</div>}
      {loadError && <div className="text-sm text-red-600">{loadError}</div>}
    </div>
  );
}
