'use client'

import {
    Award,
    BarChart3,
    BookOpenCheck,
    CheckCircle2,
    ClipboardList,
    Download,
    Loader2,
    MessageSquarePlus,
    Plus,
    RefreshCw,
    Save,
    Sparkles,
    Target,
    Trash2,
    Users,
} from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
    AssessmentWorkspaceHero,
    EmptyState,
    MetricCard,
    PaginationBar,
    formatDateLabel,
    formatDateTimeLabel,
    formatDurationLabel,
    getAttemptTone,
} from '@/app/components/assessment/shared/assessment-ui'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/app/components/ui/alert-dialog'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Checkbox } from '@/app/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/app/components/ui/select'
import { Switch } from '@/app/components/ui/switch'
import { Textarea } from '@/app/components/ui/textarea'
import {
    archiveAssessmentCategory,
    coachAssessmentAttemptRequest,
    createAssessmentDefinition,
    createAssessmentAssignment,
    createAssessmentCategory,
    createAssessmentQuestion,
    deleteAssessmentDefinition,
    deleteAssessmentAssignment,
    deleteAssessmentQuestion,
    downloadTrainerAssessmentCsv,
    fetchTrainerAssessmentBootstrap,
    openTrainerAssessmentStream,
    updateAssessmentDefinition,
    updateAssessmentAssignment,
    updateAssessmentCategory,
    updateAssessmentQuestion,
} from '@/app/lib/assessment/client'
import { normalizeAssessmentAnswer } from '@/app/lib/assessment/scoring'
import type {
    AssessmentRecord,
    AssessmentQuestionRecord,
    AssignmentRecord,
    AttemptRecord,
    CategoryRecord,
    TrainerBootstrapResponse,
} from '@/app/lib/assessment/types'

type ManagementRole = 'trainer'
type ManagementSection =
  | 'builder'
  | 'questions'
  | 'assessment-list'
  | 'assignment-status'
  | 'results'

type CategoryDraft = {
  id?: string | null
  title: string
  description: string
  passingScore: string
}

type AssessmentDraft = {
  id?: string | null
  categoryId: string
  title: string
  description: string
  type: 'multiple_choice' | 'fill_blank' | 'mixed'
  isPublished: boolean
}

type QuestionDraft = {
  id?: string | null
  categoryId: string
  assessmentId: string
  questionNumber: string
  questionText: string
  choices: [string, string, string, string]
  correctAnswer: string
  difficulty: '' | 'easy' | 'medium' | 'hard'
  explanation: string
  points: string
}

type AssignmentDraft = {
  id?: string | null
  categoryId: string
  assessmentId: string
  title: string
  description: string
  targetType: 'batch' | 'wave' | 'trainee'
  targetId: string
  waveNumber: string
  dueAt: string
  assignmentMode: 'selected_questions' | 'entire_category' | 'random_subset'
  questionIds: string[]
  randomQuestionCount: string
  passingScore: string
  maximumAttempts: string
  timeLimitMinutes: string
  shuffleChoices: boolean
  shuffleQuestions: boolean
}

type CoachingDraft = {
  feedback: string
  trainerNote: string
  actionItems: string
}

type AssignmentStatusFilter = 'all' | 'assigned' | 'in_progress' | 'completed' | 'passed' | 'failed'

type DeleteTarget =
  | { kind: 'category'; record: CategoryRecord }
  | { kind: 'assessment'; record: AssessmentRecord }
  | { kind: 'question'; record: AssessmentQuestionRecord }
  | { kind: 'assignment'; record: AssignmentRecord }

const DEFAULT_PASSING_SCORE = '90'
const QUESTION_CHOICE_KEYS = ['A', 'B', 'C', 'D'] as const
const SECTION_ANCHORS: Record<ManagementSection, string> = {
  builder: 'assessment-builder',
  questions: 'assessment-questions',
  'assessment-list': 'assessment-list',
  'assignment-status': 'assessment-assignment-status',
  results: 'assessment-results',
}

function getSections(role: ManagementRole) {
  return [
    {
      id: 'builder' as const,
      label: 'Create/Edit Assessment',
      description: 'Manage categories, assessment definitions, and the one-page assessment library.',
      icon: <ClipboardList className="size-4" />,
    },
    {
      id: 'questions' as const,
      label: 'Question Management',
      description: 'Manually add, edit, search, and filter multiple-choice questions by assessment.',
      icon: <BookOpenCheck className="size-4" />,
    },
    {
      id: 'assessment-list' as const,
      label: 'Assessment List',
      description: 'Review the full assessment catalog with question counts, publishing state, and quick actions.',
      icon: <ClipboardList className="size-4" />,
    },
    {
      id: 'assignment-status' as const,
      label: 'Assigned Assessment Status',
      description: 'Assign assessments to trainees, batches, or waves and monitor progress.',
      icon: <Users className="size-4" />,
    },
    {
      id: 'results' as const,
      label: 'Trainee Results Summary',
      description: 'Review attempt history, pass/fail results, certificates, and coaching notes.',
      icon: <CheckCircle2 className="size-4" />,
    },
  ]
}

function normalizeSection(role: ManagementRole, value: string | null): ManagementSection {
  const legacyMap: Record<string, ManagementSection> = {
    dashboard: 'builder',
    categories: 'builder',
    'question-bank': 'questions',
    assignments: 'assignment-status',
  }
  const mappedValue = value ? (legacyMap[value] || value) : value
  const availableSections = getSections(role)
  return availableSections.some((section) => section.id === mappedValue)
    ? (mappedValue as ManagementSection)
    : 'builder'
}

function createEmptyCategoryDraft(): CategoryDraft {
  return {
    title: '',
    description: '',
    passingScore: DEFAULT_PASSING_SCORE,
  }
}

function createEmptyAssessmentDraft(categoryId = ''): AssessmentDraft {
  return {
    categoryId,
    title: '',
    description: '',
    type: 'multiple_choice',
    isPublished: true,
  }
}

function createQuestionDraft(categoryId = '', assessmentId = ''): QuestionDraft {
  return {
    categoryId,
    assessmentId,
    questionNumber: '',
    questionText: '',
    choices: ['', '', '', ''],
    correctAnswer: '',
    difficulty: '',
    explanation: '',
    points: '1',
  }
}

function resolveQuestionChoiceKey(answer: string, choices: string[]) {
  const normalizedAnswer = normalizeAssessmentAnswer(answer)
  if (!normalizedAnswer) {
    return ''
  }

  const matchingChoiceIndex = choices.findIndex(
    (choice) => normalizeAssessmentAnswer(choice) === normalizedAnswer,
  )
  if (matchingChoiceIndex >= 0) {
    return QUESTION_CHOICE_KEYS[matchingChoiceIndex]
  }

  if (/^[a-d]$/i.test(normalizedAnswer)) {
    return normalizedAnswer.toUpperCase()
  }

  const choiceAliasMatch = normalizedAnswer.match(/^choice\s*([1-4])$/i)
  if (!choiceAliasMatch) {
    return ''
  }

  return QUESTION_CHOICE_KEYS[Number(choiceAliasMatch[1]) - 1] || ''
}

function getAssignmentStatusFilterValue(statusLabel?: string | null): Exclude<AssignmentStatusFilter, 'all'> {
  if (statusLabel === 'Passed') {
    return 'passed'
  }

  if (statusLabel === 'Failed') {
    return 'failed'
  }

  if (statusLabel === 'Completed') {
    return 'completed'
  }

  if (statusLabel === 'In Progress') {
    return 'in_progress'
  }

  return 'assigned'
}

function getAssignmentStatusBadgeClassName(statusLabel?: string | null) {
  if (statusLabel === 'Passed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (statusLabel === 'Failed') {
    return 'border-rose-200 bg-rose-50 text-rose-700'
  }

  if (statusLabel === 'Completed') {
    return 'border-violet-200 bg-violet-50 text-violet-700'
  }

  if (statusLabel === 'In Progress') {
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }

  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function createAssignmentDraft(
  categoryId = '',
  passingScore = DEFAULT_PASSING_SCORE,
  assessmentId = '',
): AssignmentDraft {
  return {
    categoryId,
    assessmentId,
    title: '',
    description: '',
    targetType: 'batch',
    targetId: '',
    waveNumber: '',
    dueAt: '',
    assignmentMode: 'entire_category',
    questionIds: [],
    randomQuestionCount: '',
    passingScore,
    maximumAttempts: '',
    timeLimitMinutes: '',
    shuffleChoices: true,
    shuffleQuestions: false,
  }
}

function toQuestionDraft(question: AssessmentQuestionRecord): QuestionDraft {
  return {
    id: question.id,
    categoryId: question.categoryId || '',
    assessmentId: question.assessmentId || '',
    questionNumber: String(question.questionNumber || question.orderIndex + 1),
    questionText: question.questionText,
    choices: [
      question.options[0] || '',
      question.options[1] || '',
      question.options[2] || '',
      question.options[3] || '',
    ],
    correctAnswer: resolveQuestionChoiceKey(question.correctAnswer, question.options) || question.correctAnswer,
    difficulty: question.difficulty || '',
    explanation: question.explanation || '',
    points: String(question.pointValue || 1),
  }
}

function toAssignmentDraft(record: AssignmentRecord): AssignmentDraft {
  return {
    id: record.id,
    categoryId: record.categoryId,
    assessmentId: record.assessmentId || '',
    title: record.title || record.categoryTitle,
    description: record.description || '',
    targetType: record.targetType,
    targetId: record.targetType === 'batch' ? (record.batchId || '') : record.targetType === 'trainee' ? (record.traineeId || '') : '',
    waveNumber: record.waveNumber ? String(record.waveNumber) : '',
    dueAt: record.dueAt ? record.dueAt.slice(0, 10) : '',
    assignmentMode: record.assignmentMode || 'entire_category',
    questionIds: record.selectedQuestionIds || [],
    randomQuestionCount: record.randomQuestionCount ? String(record.randomQuestionCount) : '',
    passingScore: String(record.passingScore || 90),
    maximumAttempts: record.maximumAttempts ? String(record.maximumAttempts) : '',
    timeLimitMinutes: record.timeLimitMinutes ? String(record.timeLimitMinutes) : '',
    shuffleChoices: record.shuffleChoices ?? true,
    shuffleQuestions: record.shuffleQuestions ?? false,
  }
}

function toCategoryDraft(record: CategoryRecord): CategoryDraft {
  return {
    id: record.id,
    title: record.title,
    description: record.description || '',
    passingScore: String(record.passingScore),
  }
}

function toAssessmentDraft(record: AssessmentRecord): AssessmentDraft {
  return {
    id: record.id,
    categoryId: record.categoryId,
    title: record.title,
    description: record.description || '',
    type: record.type,
    isPublished: record.isPublished,
  }
}

function getQuestionBankForCategory(workspace: TrainerBootstrapResponse | null, categoryId: string) {
  return (workspace?.questions || []).filter((question) => question.categoryId === categoryId)
}

function getQuestionBankForAssessment(workspace: TrainerBootstrapResponse | null, assessmentId: string) {
  return (workspace?.questions || []).filter((question) => question.assessmentId === assessmentId)
}

function formatTargetLabel(assignment: AssignmentRecord) {
  return `${assignment.targetType === 'trainee' ? 'Trainee' : assignment.targetType === 'wave' ? 'Wave' : 'Batch'}: ${assignment.targetLabel}`
}

export function TrainerAssessmentStudio({
  role = 'trainer',
}: {
  role?: ManagementRole
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [workspace, setWorkspace] = useState<TrainerBootstrapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [liveStatus, setLiveStatus] = useState('Connecting live assessment updates...')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [questionSearch, setQuestionSearch] = useState('')
  const [questionCategoryFilter, setQuestionCategoryFilter] = useState('all')
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all')
  const [questionPage, setQuestionPage] = useState(1)
  const [assessmentListSearch, setAssessmentListSearch] = useState('')
  const [assessmentListCategoryFilter, setAssessmentListCategoryFilter] = useState('all')
  const [assessmentListPage, setAssessmentListPage] = useState(1)
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [assignmentTargetFilter, setAssignmentTargetFilter] = useState<'all' | 'batch' | 'wave' | 'trainee'>('all')
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<AssignmentStatusFilter>('all')
  const [assignmentPage, setAssignmentPage] = useState(1)
  const [resultsSearch, setResultsSearch] = useState('')
  const [resultsCategoryFilter, setResultsCategoryFilter] = useState('all')
  const [resultsBatchFilter, setResultsBatchFilter] = useState('all')
  const [resultsWaveFilter, setResultsWaveFilter] = useState('all')
  const [resultsTraineeFilter, setResultsTraineeFilter] = useState('all')
  const [resultsStatusFilter, setResultsStatusFilter] = useState<'all' | 'pass' | 'fail'>('all')
  const [resultsDateFrom, setResultsDateFrom] = useState('')
  const [resultsDateTo, setResultsDateTo] = useState('')
  const [resultsPage, setResultsPage] = useState(1)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(createEmptyCategoryDraft)
  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false)
  const [assessmentDraft, setAssessmentDraft] = useState<AssessmentDraft>(createEmptyAssessmentDraft)
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false)
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>(createQuestionDraft())
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft>(createAssignmentDraft())
  const [assignmentQuestionSearch, setAssignmentQuestionSearch] = useState('')
  const [coachingTarget, setCoachingTarget] = useState<AttemptRecord | null>(null)
  const [coachingDraft, setCoachingDraft] = useState<CoachingDraft>({
    feedback: '',
    trainerNote: '',
    actionItems: '',
  })
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [saving, setSaving] = useState(false)

  const scrollToSection = useCallback((section: ManagementSection) => {
    const element = document.getElementById(SECTION_ANCHORS[section])
    if (!element) {
      return
    }

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [])

  const syncSection = useCallback((nextSection: ManagementSection) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('section', nextSection)
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false })
    window.setTimeout(() => {
      scrollToSection(nextSection)
    }, 40)
  }, [pathname, router, scrollToSection, searchParams])

  const needsAssessmentSessionRefresh = /credentials are invalid|invalid api key|service-role key/i.test(error)

  const refreshWorkspace = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError('')
      const payload = await fetchTrainerAssessmentBootstrap()
      setWorkspace(payload)
    } catch (loadError) {
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the assessment studio.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshWorkspace()
  }, [refreshWorkspace])

  useEffect(() => {
    if (loading) {
      return undefined
    }

    const normalizedSection = normalizeSection(role, searchParams.get('section'))
    const timerId = window.setTimeout(() => {
      scrollToSection(normalizedSection)
    }, 80)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [loading, role, scrollToSection, searchParams])

  useEffect(() => {
    if (!workspace?.categories.length) {
      setSelectedCategoryId('')
      return
    }

    setSelectedCategoryId((current) =>
      workspace.categories.some((category) => category.id === current)
        ? current
        : workspace.categories[0].id,
    )
  }, [workspace?.categories])

  useEffect(() => {
    if (!workspace) {
      return
    }

    let stream: EventSource | null = null
    try {
      stream = openTrainerAssessmentStream()
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; status?: string }
          if (payload.type === 'status' && payload.status) {
            setLiveStatus(`Supabase realtime: ${payload.status.toLowerCase().replace(/_/g, ' ')}`)
            return
          }

          if (
            payload.type === 'category_changed'
            || payload.type === 'question_changed'
            || payload.type === 'assignment_changed'
            || payload.type === 'attempt_changed'
            || payload.type === 'coaching_changed'
            || payload.type === 'certificate_changed'
          ) {
            setLiveStatus('Live update received. Refreshing the assessment studio...')
            void refreshWorkspace('refresh')
          }
        } catch {
          setLiveStatus('Assessment update received.')
        }
      }
      stream.onerror = () => {
        setLiveStatus('Realtime stream disconnected. Manual refresh is still available.')
      }
    } catch (streamError) {
      console.error(streamError)
      setLiveStatus('Realtime stream unavailable. Manual refresh is still available.')
    }

    return () => {
      stream?.close()
    }
  }, [refreshWorkspace, workspace])

  const categories = useMemo(() => workspace?.categories || [], [workspace?.categories])
  const questions = useMemo(() => workspace?.questions || [], [workspace?.questions])
  const assignments = useMemo(() => workspace?.assignments || [], [workspace?.assignments])
  const attempts = useMemo(() => workspace?.attempts || [], [workspace?.attempts])
  const certificates = useMemo(() => workspace?.certificates || [], [workspace?.certificates])
  const analytics = workspace?.analytics

  const attemptById = useMemo(() => new Map(attempts.map((attempt) => [attempt.id, attempt])), [attempts])
  const availableBatchOptionsForAssignment = useMemo(() => {
    const ownerId = categories.find((category) => category.id === assignmentDraft.categoryId)?.createdBy
    return (workspace?.batches || []).filter((batch) => !ownerId || !batch.createdBy || batch.createdBy === ownerId)
  }, [assignmentDraft.categoryId, categories, workspace?.batches])
  const availableWaveOptions = useMemo(() => {
    if (!workspace?.batches?.length) {
      return []
    }

    const ownerId = categories.find((category) => category.id === assignmentDraft.categoryId)?.createdBy
    const waveMap = new Map<number, { batchCount: number; traineeCount: number }>()

    for (const batch of workspace.batches) {
      if (batch.waveNumber === null || batch.waveNumber === undefined) {
        continue
      }
      if (ownerId && batch.createdBy && batch.createdBy !== ownerId) {
        continue
      }

      const current = waveMap.get(batch.waveNumber) || { batchCount: 0, traineeCount: 0 }
      current.batchCount += 1
      current.traineeCount += batch.traineeCount || 0
      waveMap.set(batch.waveNumber, current)
    }

    return Array.from(waveMap.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([waveNumber, meta]) => ({
        waveNumber,
        label: `Wave ${waveNumber}`,
        batchCount: meta.batchCount,
        traineeCount: meta.traineeCount,
      }))
  }, [assignmentDraft.categoryId, categories, workspace?.batches])

  const filteredCategories = useMemo(() => {
    const normalizedSearch = categorySearch.trim().toLowerCase()
    if (!normalizedSearch) {
      return categories
    }

    return categories.filter((category) => {
      const haystack = [
        category.title,
        category.description || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [categories, categorySearch])

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = questionSearch.trim().toLowerCase()

    return questions.filter((question) => {
      if (questionCategoryFilter !== 'all' && question.categoryId !== questionCategoryFilter) {
        return false
      }

      if (questionDifficultyFilter !== 'all' && question.difficulty !== questionDifficultyFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        question.categoryName || '',
        question.assessmentTitle || '',
        question.questionText,
        ...question.options,
        question.correctAnswer,
        question.explanation || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [questionCategoryFilter, questionDifficultyFilter, questionSearch, questions])

  const questionPageCount = Math.max(1, Math.ceil(filteredQuestions.length / 6))
  const paginatedQuestions = useMemo(() => {
    const currentPage = Math.min(questionPage, questionPageCount)
    const startIndex = (currentPage - 1) * 6
    return filteredQuestions.slice(startIndex, startIndex + 6)
  }, [filteredQuestions, questionPage, questionPageCount])

  const assessmentLibraryRecords = useMemo(() => categories.flatMap((category) =>
    category.assessments.map((assessment) => ({
      assessment,
      category,
      questionCount: getQuestionBankForAssessment(workspace, assessment.id).length,
      assignmentCount: assignments.filter((assignmentRecord) => assignmentRecord.assessmentId === assessment.id && assignmentRecord.isActive).length,
    }))), [assignments, categories, workspace])

  const filteredAssessmentLibrary = useMemo(() => {
    const normalizedSearch = assessmentListSearch.trim().toLowerCase()

    return assessmentLibraryRecords.filter(({ assessment, category }) => {
      if (assessmentListCategoryFilter !== 'all' && category.id !== assessmentListCategoryFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        assessment.title,
        assessment.description || '',
        category.title,
        assessment.type,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [assessmentLibraryRecords, assessmentListCategoryFilter, assessmentListSearch])

  const assessmentListPageCount = Math.max(1, Math.ceil(filteredAssessmentLibrary.length / 6))
  const paginatedAssessmentLibrary = useMemo(() => {
    const currentPage = Math.min(assessmentListPage, assessmentListPageCount)
    const startIndex = (currentPage - 1) * 6
    return filteredAssessmentLibrary.slice(startIndex, startIndex + 6)
  }, [assessmentListPage, assessmentListPageCount, filteredAssessmentLibrary])

  const filteredAssignments = useMemo(() => {
    const normalizedSearch = assignmentSearch.trim().toLowerCase()

    return assignments.filter((assignment) => {
      if (assignmentTargetFilter !== 'all' && assignment.targetType !== assignmentTargetFilter) {
        return false
      }

      const progressStatus = getAssignmentStatusFilterValue(assignment.statusLabel)

      if (assignmentStatusFilter !== 'all' && progressStatus !== assignmentStatusFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        assignment.title || '',
        assignment.categoryTitle,
        assignment.assessmentTitle || '',
        assignment.targetLabel,
        assignment.description || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [assignmentSearch, assignmentStatusFilter, assignmentTargetFilter, assignments])

  const assignmentPageCount = Math.max(1, Math.ceil(filteredAssignments.length / 5))
  const paginatedAssignments = useMemo(() => {
    const currentPage = Math.min(assignmentPage, assignmentPageCount)
    const startIndex = (currentPage - 1) * 5
    return filteredAssignments.slice(startIndex, startIndex + 5)
  }, [assignmentPage, assignmentPageCount, filteredAssignments])

  const filteredAttempts = useMemo(() => {
    const normalizedSearch = resultsSearch.trim().toLowerCase()

    return attempts.filter((attempt) => {
      if (resultsCategoryFilter !== 'all' && attempt.categoryId !== resultsCategoryFilter) {
        return false
      }

      if (resultsBatchFilter !== 'all' && attempt.batchId !== resultsBatchFilter) {
        return false
      }

      if (resultsWaveFilter !== 'all' && String(attempt.waveNumber ?? '') !== resultsWaveFilter) {
        return false
      }

      if (resultsTraineeFilter !== 'all' && attempt.traineeId !== resultsTraineeFilter) {
        return false
      }

      if (resultsStatusFilter !== 'all' && attempt.status !== resultsStatusFilter) {
        return false
      }

      const attemptDate = new Date(attempt.completedAt || attempt.submittedAt)
      if (resultsDateFrom) {
        const minDate = new Date(resultsDateFrom)
        if (attemptDate < minDate) {
          return false
        }
      }
      if (resultsDateTo) {
        const maxDate = new Date(resultsDateTo)
        maxDate.setHours(23, 59, 59, 999)
        if (attemptDate > maxDate) {
          return false
        }
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        attempt.traineeName,
        attempt.traineeEmail || '',
        attempt.categoryTitle,
        attempt.assessmentTitle,
        attempt.batchName || '',
        attempt.certificateCode || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [
    attempts,
    resultsBatchFilter,
    resultsCategoryFilter,
    resultsDateFrom,
    resultsDateTo,
    resultsSearch,
    resultsStatusFilter,
    resultsTraineeFilter,
    resultsWaveFilter,
  ])

  const resultsPageCount = Math.max(1, Math.ceil(filteredAttempts.length / 6))
  const paginatedAttempts = useMemo(() => {
    const currentPage = Math.min(resultsPage, resultsPageCount)
    const startIndex = (currentPage - 1) * 6
    return filteredAttempts.slice(startIndex, startIndex + 6)
  }, [filteredAttempts, resultsPage, resultsPageCount])

  const selectedAssignmentAssessment = useMemo(
    () => categories
      .find((category) => category.id === assignmentDraft.categoryId)
      ?.assessments.find((assessment) => assessment.id === assignmentDraft.assessmentId)
      || null,
    [assignmentDraft.assessmentId, assignmentDraft.categoryId, categories],
  )

  const assignmentPoolQuestions = assignmentDraft.assessmentId
    ? getQuestionBankForAssessment(workspace, assignmentDraft.assessmentId)
    : getQuestionBankForCategory(workspace, assignmentDraft.categoryId)
  const filteredAssignmentPoolQuestions = useMemo(() => {
    const normalizedSearch = assignmentQuestionSearch.trim().toLowerCase()
    if (!normalizedSearch) {
      return assignmentPoolQuestions
    }

    return assignmentPoolQuestions.filter((question) => {
      const haystack = [question.questionText, ...question.options].join(' ').toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [assignmentPoolQuestions, assignmentQuestionSearch])

  const openCategoryDialog = (category?: CategoryRecord) => {
    setCategoryDraft(category ? toCategoryDraft(category) : createEmptyCategoryDraft())
    setCategoryDialogOpen(true)
  }

  const openAssessmentDialog = (assessment?: AssessmentRecord, preferredCategoryId?: string) => {
    const draftCategoryId = assessment?.categoryId || preferredCategoryId || selectedCategoryId || categories[0]?.id || ''
    setAssessmentDraft(assessment ? toAssessmentDraft(assessment) : createEmptyAssessmentDraft(draftCategoryId))
    setAssessmentDialogOpen(true)
  }

  const openQuestionDialog = (question?: AssessmentQuestionRecord) => {
    if (question) {
      setQuestionDraft(toQuestionDraft(question))
      setQuestionDialogOpen(true)
      return
    }

    const draftCategoryId = selectedCategoryId || categories[0]?.id || ''
    const draftAssessmentId = categories.find((category) => category.id === draftCategoryId)?.assessments[0]?.id || ''
    setQuestionDraft(createQuestionDraft(draftCategoryId, draftAssessmentId))
    setQuestionDialogOpen(true)
  }

  const openAssignmentDialog = (
    assignment?: AssignmentRecord,
    preferredCategoryId?: string,
    preferredAssessmentId?: string,
  ) => {
    const draftCategoryId = assignment?.categoryId || preferredCategoryId || selectedCategoryId || categories[0]?.id || ''
    const draftCategory = categories.find((category) => category.id === draftCategoryId)
    const draftAssessmentId = assignment?.assessmentId || preferredAssessmentId || draftCategory?.assessments[0]?.id || ''
    const draftAssessment = draftCategory?.assessments.find((assessment) => assessment.id === draftAssessmentId) || null
    const baseDraft = assignment
      ? {
          ...toAssignmentDraft(assignment),
          assessmentId: assignment.assessmentId || draftAssessmentId,
        }
      : {
          ...createAssignmentDraft(draftCategoryId, String(draftCategory?.passingScore || 90), draftAssessmentId),
          title: draftAssessment?.title || (draftCategory ? `${draftCategory.title} Assessment` : ''),
        }
    setAssignmentDraft(baseDraft)
    setAssignmentQuestionSearch('')
    setAssignmentDialogOpen(true)
  }

  const handleSaveCategory = async () => {
    if (!categoryDraft.title.trim()) {
      toast.error('Category title is required.')
      return
    }

    setSaving(true)
    try {
      if (categoryDraft.id) {
        await updateAssessmentCategory(categoryDraft.id, {
          title: categoryDraft.title.trim(),
          description: categoryDraft.description.trim(),
          passingScore: Number(categoryDraft.passingScore) || 90,
        })
        toast.success('Category updated.')
      } else {
        await createAssessmentCategory({
          title: categoryDraft.title.trim(),
          description: categoryDraft.description.trim(),
          passingScore: Number(categoryDraft.passingScore) || 90,
        })
        toast.success('Category created.')
      }
      setCategoryDialogOpen(false)
      await refreshWorkspace('refresh')
    } catch (saveError) {
      console.error(saveError)
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save the category.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAssessment = async () => {
    if (!assessmentDraft.categoryId || !assessmentDraft.title.trim()) {
      toast.error('Category and assessment title are required.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        categoryId: assessmentDraft.categoryId,
        title: assessmentDraft.title.trim(),
        description: assessmentDraft.description.trim(),
        type: assessmentDraft.type,
        isPublished: assessmentDraft.isPublished,
      }

      if (assessmentDraft.id) {
        await updateAssessmentDefinition(assessmentDraft.id, {
          title: payload.title,
          description: payload.description,
          type: payload.type,
          isPublished: payload.isPublished,
        })
        toast.success('Assessment updated.')
      } else {
        await createAssessmentDefinition(payload)
        toast.success('Assessment created.')
      }

      setAssessmentDialogOpen(false)
      await refreshWorkspace('refresh')
    } catch (saveError) {
      console.error(saveError)
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save the assessment.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAssessment = async (assessment: AssessmentRecord) => {
    setSaving(true)
    try {
      await deleteAssessmentDefinition(assessment.id)
      toast.success('Assessment deleted.')
      await refreshWorkspace('refresh')
    } catch (deleteError) {
      console.error(deleteError)
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete the assessment.')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveCategory = async (category: CategoryRecord) => {
    setSaving(true)
    try {
      await archiveAssessmentCategory(category.id)
      toast.success('Category archived.')
      await refreshWorkspace('refresh')
    } catch (archiveError) {
      console.error(archiveError)
      toast.error(archiveError instanceof Error ? archiveError.message : 'Unable to archive the category.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveQuestion = async () => {
    if (!questionDraft.categoryId || !questionDraft.assessmentId || !questionDraft.questionText.trim()) {
      toast.error('Category, assessment, and question text are required.')
      return
    }

    const sanitizedChoices = questionDraft.choices.map((choice) => choice.trim())
    if (sanitizedChoices.some((choice) => !choice)) {
      toast.error('All four answer choices are required.')
      return
    }

    const resolvedCorrectAnswer = resolveQuestionChoiceKey(questionDraft.correctAnswer, sanitizedChoices)
    if (!resolvedCorrectAnswer) {
      toast.error('Select which choice is the correct answer.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        categoryId: questionDraft.categoryId,
        assessmentId: questionDraft.assessmentId,
        questionNumber: Number(questionDraft.questionNumber) || 0,
        questionText: questionDraft.questionText.trim(),
        questionType: 'multiple_choice' as const,
        options: sanitizedChoices,
        correctAnswer: resolvedCorrectAnswer,
        difficulty: questionDraft.difficulty || null,
        explanation: questionDraft.explanation.trim(),
        points: Math.max(1, Number(questionDraft.points) || 1),
        orderIndex: Math.max((Number(questionDraft.questionNumber) || 1) - 1, 0),
      }

      if (questionDraft.id) {
        await updateAssessmentQuestion(questionDraft.id, payload)
        toast.success('Question updated.')
      } else {
        await createAssessmentQuestion(payload)
        toast.success('Question created.')
      }

      setQuestionDialogOpen(false)
      await refreshWorkspace('refresh')
    } catch (saveError) {
      console.error(saveError)
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save the question.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteQuestion = async (question: AssessmentQuestionRecord) => {
    setSaving(true)
    try {
      await deleteAssessmentQuestion(question.id)
      toast.success('Question deleted.')
      await refreshWorkspace('refresh')
    } catch (deleteError) {
      console.error(deleteError)
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete the question.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAssignment = async () => {
    if (!assignmentDraft.categoryId || !assignmentDraft.assessmentId || !assignmentDraft.title.trim()) {
      toast.error('Category, assessment, and assignment title are required.')
      return
    }

    if (assignmentDraft.targetType === 'wave' ? !assignmentDraft.waveNumber : !assignmentDraft.targetId) {
      toast.error('Select a batch, wave, or trainee target.')
      return
    }

    if (assignmentDraft.assignmentMode === 'selected_questions' && !assignmentDraft.questionIds.length) {
      toast.error('Select at least one question for selected-question mode.')
      return
    }

    if (assignmentDraft.assignmentMode === 'random_subset' && !(Number(assignmentDraft.randomQuestionCount) > 0)) {
      toast.error('Provide how many questions should be drawn in random-subset mode.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        categoryId: assignmentDraft.categoryId,
        assessmentId: assignmentDraft.assessmentId,
        title: assignmentDraft.title.trim(),
        description: assignmentDraft.description.trim(),
        targetType: assignmentDraft.targetType,
        batchId: assignmentDraft.targetType === 'batch' ? assignmentDraft.targetId : null,
        waveNumber: assignmentDraft.targetType === 'wave' ? Number(assignmentDraft.waveNumber) || null : null,
        traineeId: assignmentDraft.targetType === 'trainee' ? assignmentDraft.targetId : null,
        dueAt: assignmentDraft.dueAt ? new Date(`${assignmentDraft.dueAt}T00:00:00`).toISOString() : null,
        assignmentMode: assignmentDraft.assignmentMode,
        questionIds: assignmentDraft.questionIds,
        randomQuestionCount: assignmentDraft.assignmentMode === 'random_subset'
          ? Number(assignmentDraft.randomQuestionCount) || null
          : null,
        passingScore: Number(assignmentDraft.passingScore) || 90,
        maximumAttempts: assignmentDraft.maximumAttempts ? Number(assignmentDraft.maximumAttempts) : null,
        timeLimitMinutes: assignmentDraft.timeLimitMinutes ? Number(assignmentDraft.timeLimitMinutes) : null,
        shuffleChoices: assignmentDraft.shuffleChoices,
        shuffleQuestions: assignmentDraft.shuffleQuestions,
      }

      if (assignmentDraft.id) {
        await updateAssessmentAssignment(assignmentDraft.id, payload)
        toast.success('Assignment updated.')
      } else {
        await createAssessmentAssignment(payload)
        toast.success('Assignment created.')
      }

      setAssignmentDialogOpen(false)
      await refreshWorkspace('refresh')
    } catch (saveError) {
      console.error(saveError)
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save the assignment.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAssignment = async (assignment: AssignmentRecord) => {
    setSaving(true)
    try {
      await deleteAssessmentAssignment(assignment.id)
      toast.success('Assignment deleted.')
      await refreshWorkspace('refresh')
    } catch (deleteError) {
      console.error(deleteError)
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete the assignment.')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return
    }

    try {
      if (deleteTarget.kind === 'category') {
        await handleArchiveCategory(deleteTarget.record)
      } else if (deleteTarget.kind === 'assessment') {
        await handleDeleteAssessment(deleteTarget.record)
      } else if (deleteTarget.kind === 'question') {
        await handleDeleteQuestion(deleteTarget.record)
      } else {
        await handleDeleteAssignment(deleteTarget.record)
      }
    } finally {
      setDeleteTarget(null)
    }
  }

  const openCoachingDialog = (attempt: AttemptRecord) => {
    setCoachingTarget(attempt)
    setCoachingDraft({
      feedback: attempt.feedback || '',
      trainerNote: attempt.trainerNote || '',
      actionItems: '',
    })
  }

  const handleSaveCoaching = async () => {
    if (!coachingTarget || !coachingDraft.feedback.trim()) {
      toast.error('Coaching feedback is required.')
      return
    }

    setSaving(true)
    try {
      await coachAssessmentAttemptRequest({
        attemptId: coachingTarget.id,
        feedback: coachingDraft.feedback.trim(),
        trainerNote: coachingDraft.trainerNote.trim(),
        actionItems: coachingDraft.actionItems.trim(),
        visibility: 'shared',
      })
      setCoachingTarget(null)
      toast.success('Coaching note saved.')
      await refreshWorkspace('refresh')
    } catch (saveError) {
      console.error(saveError)
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save coaching feedback.')
    } finally {
      setSaving(false)
    }
  }

  const handleExportCsv = async () => {
    try {
      await downloadTrainerAssessmentCsv()
      toast.success('Assessment report exported.')
    } catch (downloadError) {
      console.error(downloadError)
      toast.error(downloadError instanceof Error ? downloadError.message : 'Unable to export the CSV report.')
    }
  }

  useEffect(() => {
    setQuestionPage(1)
  }, [questionSearch, questionCategoryFilter, questionDifficultyFilter])

  useEffect(() => {
    setAssessmentListPage(1)
  }, [assessmentListCategoryFilter, assessmentListSearch])

  useEffect(() => {
    setAssignmentPage(1)
  }, [assignmentSearch, assignmentStatusFilter, assignmentTargetFilter])

  useEffect(() => {
    setResultsPage(1)
  }, [
    resultsSearch,
    resultsCategoryFilter,
    resultsBatchFilter,
    resultsWaveFilter,
    resultsTraineeFilter,
    resultsStatusFilter,
    resultsDateFrom,
    resultsDateTo,
  ])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading assessment studio...
      </div>
    )
  }

  if (!workspace) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle>Assessment studio unavailable</CardTitle>
          <CardDescription>
            The assessment workspace could not be loaded right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <div className="text-sm text-amber-900">{error}</div> : null}
          {needsAssessmentSessionRefresh ? (
            <div className="mt-3 text-sm text-amber-900">
              Sign out and sign back in once to refresh the secure assessment session, then retry this page.
            </div>
          ) : null}
          <Button type="button" className="mt-4" onClick={() => void refreshWorkspace('refresh')} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <AssessmentWorkspaceHero
        eyebrow="Trainer Assessment Studio"
        title="Assessment Studio"
        description="Create assessment categories, maintain the question bank, assign categories to trainees, batches, or waves, and review trainee results in one Supabase-connected workflow."
        actions={(
          <Button type="button" variant="outline" onClick={() => void refreshWorkspace('refresh')} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        )}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
        {liveStatus}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Categories"
          value={String(categories.length)}
          hint={`${analytics?.totalQuestions || 0} questions`}
          icon={<ClipboardList className="size-4 text-sky-600" />}
        />
        <MetricCard
          label="Assignments"
          value={String(analytics?.totalAssignments || assignments.length)}
          hint={`${analytics?.activeAssignments || 0} active`}
          icon={<Users className="size-4 text-amber-600" />}
        />
        <MetricCard
          label="Attempts"
          value={String(analytics?.totalAttempts || attempts.length)}
          hint={`${(analytics?.averageScore || 0).toFixed(2)}% average`}
          icon={<CheckCircle2 className="size-4 text-emerald-600" />}
        />
        <MetricCard
          label="Pass Rate"
          value={`${(analytics?.passRate || 0).toFixed(2)}%`}
          hint="Overall module"
          icon={<BarChart3 className="size-4 text-violet-600" />}
        />
        <MetricCard
          label="Certificates"
          value={String(analytics?.certificatesIssued || certificates.length)}
          hint="Completion unlocks"
          icon={<Award className="size-4 text-amber-600" />}
        />
      </div>

      <section id={SECTION_ANCHORS.builder} className="scroll-mt-24 space-y-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Create / Edit Assessment</div>
          <div className="text-sm text-slate-600">Use the category list to manage trainer-owned assessment categories and open the related workflows.</div>
        </div>
        <div className="max-w-[380px]">
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Category List</CardTitle>
                  <CardDescription>Search a category, review its assessment library, and assign assessments to trainees, batches, or waves.</CardDescription>
                </div>
                <Button type="button" size="sm" onClick={() => openCategoryDialog()}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Search categories"
              />

              {filteredCategories.map((category) => (
                <div
                  key={category.id}
                  className={`rounded-2xl border p-4 transition ${
                    selectedCategoryId === category.id
                      ? 'border-sky-400 bg-sky-50 shadow-sm'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    className="w-full text-left"
                  >
                    <div className="font-semibold text-slate-950">{category.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{category.description || 'No description yet.'}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{category.assessments.length} assessments</span>
                      <span>{category.questionCount || 0} questions</span>
                      <span>{category.assignmentCount} assignments</span>
                      <span>Pass at {category.passingScore}%</span>
                    </div>
                  </button>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => openAssignmentDialog(undefined, category.id)}>
                      <Users className="size-4" />
                      Assign
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedCategoryId(category.id)
                        openCategoryDialog(category)
                      }}
                    >
                      <Save className="size-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => {
                        setSelectedCategoryId(category.id)
                        setDeleteTarget({ kind: 'category', record: category })
                      }}
                    >
                      <Trash2 className="size-4" />
                      Archive
                    </Button>
                  </div>
                </div>
              ))}

              {!filteredCategories.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No categories match the current search.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <section id={SECTION_ANCHORS.questions} className="scroll-mt-24 space-y-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question Management</div>
          <div className="text-sm text-slate-600">Search, edit, validate, and maintain the question bank with live assessment metadata.</div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <CardTitle>Question Bank</CardTitle>
                <CardDescription>Search, filter, edit, and review the assessment-based multiple-choice inventory.</CardDescription>
              </div>
              <Button type="button" onClick={() => openQuestionDialog()}>
                <Plus className="size-4" />
                Add Question
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
              <Input
                value={questionSearch}
                onChange={(event) => setQuestionSearch(event.target.value)}
                placeholder="Search category, assessment, question, choice, or answer"
              />
              <Select value={questionCategoryFilter} onValueChange={setQuestionCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={questionDifficultyFilter} onValueChange={(value: 'all' | 'easy' | 'medium' | 'hard') => setQuestionDifficultyFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All difficulty</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              {paginatedQuestions.map((question) => (
                <div key={question.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-950">
                          Q{question.questionNumber || question.orderIndex + 1}. {question.questionText}
                        </div>
                        <Badge variant="outline">{question.categoryName || 'Category'}</Badge>
                        {question.assessmentTitle ? <Badge variant="outline">{question.assessmentTitle}</Badge> : null}
                        {question.difficulty ? <Badge variant="outline">{question.difficulty}</Badge> : null}
                        {question.pointValue ? <Badge variant="outline">{question.pointValue} pt{question.pointValue === 1 ? '' : 's'}</Badge> : null}
                        <Badge variant="outline">{question.answerCount || 0} answers</Badge>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {question.options.map((option, index) => (
                          <div key={`${question.id}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{String.fromCharCode(65 + index)}.</span> {option}
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>Correct: {question.correctAnswer}</span>
                        <span>Accuracy: {(question.accuracyRate || 0).toFixed(2)}%</span>
                        <span>Miss rate: {(question.missRate || 0).toFixed(2)}%</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openQuestionDialog(question)}>
                        <Save className="size-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() => setDeleteTarget({ kind: 'question', record: question })}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {!paginatedQuestions.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No question bank records match the current filters.
                </div>
              ) : null}
            </div>

            <PaginationBar
              currentPage={Math.min(questionPage, questionPageCount)}
              totalPages={questionPageCount}
              itemCountLabel={`Showing ${paginatedQuestions.length} of ${filteredQuestions.length} questions`}
              onPrevious={() => setQuestionPage((current) => Math.max(current - 1, 1))}
              onNext={() => setQuestionPage((current) => Math.min(current + 1, questionPageCount))}
            />
          </CardContent>
        </Card>
      </section>

      <section id={SECTION_ANCHORS['assessment-list']} className="scroll-mt-24 space-y-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assessment List</div>
          <div className="text-sm text-slate-600">Review every assessment definition across categories, along with question counts, publishing state, and quick actions.</div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <CardTitle>Assessment Catalog</CardTitle>
                <CardDescription>Search the full assessment library and jump into editing, question management, or assignment from one list.</CardDescription>
              </div>
              <Button type="button" onClick={() => openAssessmentDialog(undefined, selectedCategoryId || categories[0]?.id || '')}>
                <Plus className="size-4" />
                New Assessment
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
              <Input
                value={assessmentListSearch}
                onChange={(event) => setAssessmentListSearch(event.target.value)}
                placeholder="Search title, description, category, or type"
              />
              <Select value={assessmentListCategoryFilter} onValueChange={setAssessmentListCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              {paginatedAssessmentLibrary.map(({ assessment, category, questionCount, assignmentCount }) => (
                <div key={assessment.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-950">{assessment.title}</div>
                        <Badge variant="outline">{category.title}</Badge>
                        <Badge variant="outline">{assessment.type.replace(/_/g, ' ')}</Badge>
                        <Badge className={assessment.isPublished ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}>
                          {assessment.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-600">{assessment.description || 'No assessment description provided yet.'}</div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <DetailLine label="Questions" value={String(questionCount)} />
                        <DetailLine label="Assignments" value={String(assignmentCount)} />
                        <DetailLine label="Passing Score" value={`${category.passingScore}%`} />
                        <DetailLine label="Updated" value={formatDateLabel(assessment.updatedAt)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openAssessmentDialog(assessment)}>
                        <Save className="size-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedCategoryId(category.id)
                          setQuestionSearch(assessment.title)
                          syncSection('questions')
                        }}
                      >
                        <BookOpenCheck className="size-4" />
                        Questions
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openAssignmentDialog(undefined, category.id, assessment.id)}
                      >
                        <Users className="size-4" />
                        Assign
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() => setDeleteTarget({ kind: 'assessment', record: assessment })}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {!paginatedAssessmentLibrary.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No assessments match the current filters.
                </div>
              ) : null}
            </div>

            <PaginationBar
              currentPage={Math.min(assessmentListPage, assessmentListPageCount)}
              totalPages={assessmentListPageCount}
              itemCountLabel={`Showing ${paginatedAssessmentLibrary.length} of ${filteredAssessmentLibrary.length} assessments`}
              onPrevious={() => setAssessmentListPage((current) => Math.max(current - 1, 1))}
              onNext={() => setAssessmentListPage((current) => Math.min(current + 1, assessmentListPageCount))}
            />
          </CardContent>
        </Card>
      </section>

      <section id={SECTION_ANCHORS['assignment-status']} className="scroll-mt-24 space-y-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigned Assessment Status</div>
          <div className="text-sm text-slate-600">Track live assignment progress, completion, passing outcomes, and certificate issuance in one list.</div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <CardTitle>Assigned Assessment Status</CardTitle>
                <CardDescription>Create or edit batch, wave, and trainee assignments with question pool controls.</CardDescription>
              </div>
              <Button type="button" onClick={() => openAssignmentDialog()}>
                <Plus className="size-4" />
                New Assignment
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
              <Input
                value={assignmentSearch}
                onChange={(event) => setAssignmentSearch(event.target.value)}
                placeholder="Search category, assessment, title, or target"
              />
              <Select value={assignmentTargetFilter} onValueChange={(value: 'all' | 'batch' | 'wave' | 'trainee') => setAssignmentTargetFilter(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All targets</SelectItem>
                  <SelectItem value="batch">Batch / Wave</SelectItem>
                  <SelectItem value="wave">Wave</SelectItem>
                  <SelectItem value="trainee">Trainee</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assignmentStatusFilter} onValueChange={(value: AssignmentStatusFilter) => setAssignmentStatusFilter(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All progress</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              {paginatedAssignments.map((assignment) => (
                <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-950">{assignment.title || assignment.categoryTitle}</div>
                        <Badge variant="outline">{assignment.categoryTitle}</Badge>
                        {assignment.assessmentTitle ? <Badge variant="outline">{assignment.assessmentTitle}</Badge> : null}
                        <Badge variant="outline">{assignment.assignmentMode === 'entire_category' ? 'entire assessment' : assignment.assignmentMode?.replace(/_/g, ' ') || 'entire assessment'}</Badge>
                        <Badge variant="outline">{assignment.questionCount || 0} questions</Badge>
                        <Badge className={getAssignmentStatusBadgeClassName(assignment.statusLabel)}>
                          {assignment.statusLabel || 'Assigned'}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-600">{assignment.description || 'No assignment notes provided.'}</div>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>{formatTargetLabel(assignment)}</span>
                        <span>Due {formatDateLabel(assignment.dueAt)}</span>
                        <span>Pass at {assignment.passingScore || 90}%</span>
                        <span>{assignment.timeLimitMinutes ? `${assignment.timeLimitMinutes} min timer` : 'Untimed'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openAssignmentDialog(assignment)}>
                        <Save className="size-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() => setDeleteTarget({ kind: 'assignment', record: assignment })}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <MetricCard label="Assigned" value={String(assignment.assignedTrainees || 0)} hint="Target trainees" icon={<Users className="size-4 text-sky-600" />} />
                    <MetricCard label="Completed" value={String(assignment.completedTrainees || 0)} hint="Submitted attempts" icon={<CheckCircle2 className="size-4 text-emerald-600" />} />
                    <MetricCard label="Passed" value={String(assignment.passedTrainees || 0)} hint={`${(assignment.averageScore || 0).toFixed(2)}% average`} icon={<Award className="size-4 text-violet-600" />} />
                    <MetricCard label="Certificates" value={String(assignment.certificateCount || 0)} hint={`${(assignment.retakeRate || 0).toFixed(2)}% retake rate`} icon={<Sparkles className="size-4 text-amber-600" />} />
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                      <span>Completion</span>
                      <span>
                        {assignment.assignedTrainees
                          ? Math.round(((assignment.completedTrainees || 0) / Math.max(assignment.assignedTrainees, 1)) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <Progress
                      value={assignment.assignedTrainees
                        ? Number((((assignment.completedTrainees || 0) / Math.max(assignment.assignedTrainees, 1)) * 100).toFixed(2))
                        : 0}
                      className="h-2"
                    />
                  </div>
                </div>
              ))}

              {!paginatedAssignments.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No assignments match the current filters.
                </div>
              ) : null}
            </div>

            <PaginationBar
              currentPage={Math.min(assignmentPage, assignmentPageCount)}
              totalPages={assignmentPageCount}
              itemCountLabel={`Showing ${paginatedAssignments.length} of ${filteredAssignments.length} assignments`}
              onPrevious={() => setAssignmentPage((current) => Math.max(current - 1, 1))}
              onNext={() => setAssignmentPage((current) => Math.min(current + 1, assignmentPageCount))}
            />
          </CardContent>
        </Card>
      </section>

      <section id={SECTION_ANCHORS.results} className="scroll-mt-24 space-y-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Trainee Results Summary</div>
          <div className="text-sm text-slate-600">Review filtered trainee results, coaching notes, AI summaries, and exportable assessment outcomes.</div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <CardTitle>Results and Evaluations</CardTitle>
                <CardDescription>Filter by batch, wave, category, trainee, status, and date range.</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={() => void handleExportCsv()}>
                <Download className="size-4" />
                Export Results CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_180px_220px_170px]">
              <Input
                value={resultsSearch}
                onChange={(event) => setResultsSearch(event.target.value)}
                placeholder="Search trainee, assessment, category, or certificate"
              />
              <Select value={resultsCategoryFilter} onValueChange={setResultsCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultsBatchFilter} onValueChange={setResultsBatchFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Batch / Wave" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All batches</SelectItem>
                  {(workspace.batches || []).map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.waveNumber ? `${batch.name} | Wave ${batch.waveNumber}` : batch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultsWaveFilter} onValueChange={setResultsWaveFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Wave" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All waves</SelectItem>
                  {(workspace.waves || []).map((wave) => (
                    <SelectItem key={`wave-${wave.waveNumber}`} value={String(wave.waveNumber)}>
                      {wave.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultsTraineeFilter} onValueChange={setResultsTraineeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Trainee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trainees</SelectItem>
                  {(workspace.trainees || []).map((trainee) => (
                    <SelectItem key={trainee.id} value={trainee.id}>
                      {trainee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultsStatusFilter} onValueChange={(value: 'all' | 'pass' | 'fail') => setResultsStatusFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="date" value={resultsDateFrom} onChange={(event) => setResultsDateFrom(event.target.value)} />
                <Input type="date" value={resultsDateTo} onChange={(event) => setResultsDateTo(event.target.value)} />
              </div>
            </div>

            <div className="space-y-4">
              {paginatedAttempts.map((attempt) => (
                <div key={attempt.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-950">{attempt.traineeName}</div>
                        <Badge className={getAttemptTone(attempt.status)}>
                          {attempt.status === 'pass' ? 'Pass' : 'Fail'}
                        </Badge>
                        {attempt.certificateCode ? <Badge variant="outline">{attempt.certificateCode}</Badge> : null}
                      </div>
                      <div className="text-sm text-slate-600">
                        {attempt.categoryTitle} | {attempt.assessmentTitle} | Attempt #{attempt.attemptNo}
                      </div>
                      <div className="text-xs text-slate-500">
                        {attempt.batchName || 'Direct assignment'} | {formatDateTimeLabel(attempt.completedAt || attempt.submittedAt)}
                      </div>
                      <div className="text-sm text-slate-700">
                        {attempt.analysis?.summary || attempt.feedback || 'Assessment result saved.'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openCoachingDialog(attempt)}>
                        <MessageSquarePlus className="size-4" />
                        Coach
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <MetricCard label="Score" value={`${attempt.score.toFixed(2)}%`} hint={`Target ${attempt.passingScore || 90}%`} icon={<BarChart3 className="size-4 text-sky-600" />} />
                    <MetricCard label="Correct" value={String(attempt.correctAnswers ?? attempt.questionResults.filter((result) => result.isCorrect).length)} hint={`${attempt.totalQuestions || attempt.questionResults.length} total`} icon={<CheckCircle2 className="size-4 text-emerald-600" />} />
                    <MetricCard label="Time Spent" value={formatDurationLabel(attempt.timeSpentSeconds)} hint="Attempt duration" icon={<Target className="size-4 text-amber-600" />} />
                    <MetricCard label="Analysis Source" value={attempt.analysis?.source === 'ai' ? 'AI' : 'Rules'} hint="Narrative feedback" icon={<Sparkles className="size-4 text-violet-600" />} />
                  </div>

                  {(attempt.analysis?.strengths?.length || attempt.analysis?.improvements?.length || attempt.analysis?.recommendations?.length) ? (
                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <MiniAnalysisBlock title="Strengths" items={attempt.analysis?.strengths || []} tone="emerald" />
                      <MiniAnalysisBlock title="Improvements" items={attempt.analysis?.improvements || []} tone="amber" />
                      <MiniAnalysisBlock title="Recommendations" items={attempt.analysis?.recommendations || []} tone="sky" />
                    </div>
                  ) : null}
                </div>
              ))}

              {!paginatedAttempts.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No results match the selected filters.
                </div>
              ) : null}
            </div>

            <PaginationBar
              currentPage={Math.min(resultsPage, resultsPageCount)}
              totalPages={resultsPageCount}
              itemCountLabel={`Showing ${paginatedAttempts.length} of ${filteredAttempts.length} attempts`}
              onPrevious={() => setResultsPage((current) => Math.max(current - 1, 1))}
              onNext={() => setResultsPage((current) => Math.min(current + 1, resultsPageCount))}
            />
          </CardContent>
        </Card>
      </section>





      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{categoryDraft.id ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>Define the category name, description, and passing score requirement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category Name</Label>
              <Input className="mt-2" value={categoryDraft.title} onChange={(event) => setCategoryDraft((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-2" rows={4} value={categoryDraft.description} onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div>
              <Label>Passing Score</Label>
              <Input className="mt-2" type="number" min={0} max={100} value={categoryDraft.passingScore} onChange={(event) => setCategoryDraft((current) => ({ ...current, passingScore: event.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveCategory()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Category
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assessmentDialogOpen} onOpenChange={setAssessmentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{assessmentDraft.id ? 'Edit Assessment' : 'Create Assessment'}</DialogTitle>
            <DialogDescription>Choose the category, define the assessment title, and control its publish state.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={assessmentDraft.categoryId} onValueChange={(value) => setAssessmentDraft((current) => ({ ...current, categoryId: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assessment Title</Label>
              <Input className="mt-2" value={assessmentDraft.title} onChange={(event) => setAssessmentDraft((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-2" rows={4} value={assessmentDraft.description} onChange={(event) => setAssessmentDraft((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Assessment Type</Label>
                <Select value={assessmentDraft.type} onValueChange={(value: AssessmentDraft['type']) => setAssessmentDraft((current) => ({ ...current, type: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="fill_blank">Fill in the Blank</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Published</div>
                    <div className="text-xs text-slate-500">Published assessments are ready to be assigned.</div>
                  </div>
                  <Switch checked={assessmentDraft.isPublished} onCheckedChange={(value) => setAssessmentDraft((current) => ({ ...current, isPublished: value }))} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setAssessmentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveAssessment()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Assessment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{questionDraft.id ? 'Edit Question' : 'Create Question Item'}</DialogTitle>
            <DialogDescription>Select a category and assessment, enter the answer choices, and define the scoring metadata.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Category</Label>
                <Select
                  value={questionDraft.categoryId}
                  onValueChange={(value) => {
                    const nextAssessmentId = categories.find((category) => category.id === value)?.assessments[0]?.id || ''
                    setQuestionDraft((current) => ({ ...current, categoryId: value, assessmentId: nextAssessmentId }))
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assessment</Label>
                <Select value={questionDraft.assessmentId} onValueChange={(value) => setQuestionDraft((current) => ({ ...current, assessmentId: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select assessment" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.find((category) => category.id === questionDraft.categoryId)?.assessments || []).map((assessment) => (
                      <SelectItem key={assessment.id} value={assessment.id}>
                        {assessment.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Question Number</Label>
                <Input className="mt-2" type="number" min={1} value={questionDraft.questionNumber} onChange={(event) => setQuestionDraft((current) => ({ ...current, questionNumber: event.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Question Text</Label>
              <Textarea className="mt-2" rows={4} value={questionDraft.questionText} onChange={(event) => setQuestionDraft((current) => ({ ...current, questionText: event.target.value }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {questionDraft.choices.map((choice, index) => (
                <div key={`choice-${index}`}>
                  <Label>Choice {index + 1}</Label>
                  <Input
                    className="mt-2"
                    value={choice}
                    onChange={(event) =>
                      setQuestionDraft((current) => {
                        const nextChoices = [...current.choices] as QuestionDraft['choices']
                        nextChoices[index] = event.target.value
                        return { ...current, choices: nextChoices }
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Correct Answer</Label>
                <Select
                  value={questionDraft.correctAnswer || 'none'}
                  onValueChange={(value) => setQuestionDraft((current) => ({ ...current, correctAnswer: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select the correct choice" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select the correct choice</SelectItem>
                    {QUESTION_CHOICE_KEYS.map((choiceKey, index) => {
                      const choiceLabel = questionDraft.choices[index]?.trim()
                      return (
                        <SelectItem key={choiceKey} value={choiceKey} disabled={!choiceLabel}>
                          {choiceKey}. {choiceLabel || `Choice ${index + 1} (enter text first)`}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={questionDraft.difficulty || 'none'} onValueChange={(value) => setQuestionDraft((current) => ({ ...current, difficulty: value === 'none' ? '' : value as QuestionDraft['difficulty'] }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Optional difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No difficulty</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Points</Label>
              <Input className="mt-2" type="number" min={1} value={questionDraft.points} onChange={(event) => setQuestionDraft((current) => ({ ...current, points: event.target.value }))} />
            </div>
            <div>
              <Label>Explanation</Label>
              <Textarea className="mt-2" rows={4} value={questionDraft.explanation} onChange={(event) => setQuestionDraft((current) => ({ ...current, explanation: event.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setQuestionDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveQuestion()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Question
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{assignmentDraft.id ? 'Edit Assessment Assignment' : 'Assign Assessment to Trainee or Batch'}</DialogTitle>
            <DialogDescription>Choose the delivery target, linked assessment, question pool rules, and completion settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <div>
                <Label>Category</Label>
                <Select
                  value={assignmentDraft.categoryId}
                  onValueChange={(value) => {
                    const nextCategory = categories.find((category) => category.id === value)
                    const nextAssessmentId = nextCategory?.assessments[0]?.id || ''
                    setAssignmentDraft((current) => ({
                      ...current,
                      categoryId: value,
                      assessmentId: nextAssessmentId,
                      questionIds: [],
                      targetId: '',
                      waveNumber: '',
                      passingScore: String(nextCategory?.passingScore || 90),
                      title: nextCategory?.assessments.find((assessment) => assessment.id === nextAssessmentId)?.title
                        || current.title,
                    }))
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assessment</Label>
                <Select
                  value={assignmentDraft.assessmentId}
                  onValueChange={(value) => {
                    const nextAssessment = categories
                      .find((category) => category.id === assignmentDraft.categoryId)
                      ?.assessments.find((assessment) => assessment.id === value)
                    setAssignmentDraft((current) => ({
                      ...current,
                      assessmentId: value,
                      questionIds: [],
                      title: current.id ? current.title : (nextAssessment?.title || current.title),
                    }))
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select assessment" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.find((category) => category.id === assignmentDraft.categoryId)?.assessments || []).map((assessment) => (
                      <SelectItem key={assessment.id} value={assessment.id}>
                        {assessment.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assignment Title</Label>
                <Input className="mt-2" value={assignmentDraft.title} onChange={(event) => setAssignmentDraft((current) => ({ ...current, title: event.target.value }))} />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea className="mt-2" rows={3} value={assignmentDraft.description} onChange={(event) => setAssignmentDraft((current) => ({ ...current, description: event.target.value }))} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div>
                <Label>Target Type</Label>
                <Select
                  value={assignmentDraft.targetType}
                  onValueChange={(value: 'batch' | 'wave' | 'trainee') =>
                    setAssignmentDraft((current) => ({
                      ...current,
                      targetType: value,
                      targetId: '',
                      waveNumber: value === 'wave' ? current.waveNumber : '',
                    }))
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="batch">Batch</SelectItem>
                    <SelectItem value="wave">Wave</SelectItem>
                    <SelectItem value="trainee">Trainee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  {assignmentDraft.targetType === 'batch'
                    ? 'Batch'
                    : assignmentDraft.targetType === 'wave'
                      ? 'Wave'
                      : 'Trainee'}
                </Label>
                {assignmentDraft.targetType === 'wave' ? (
                  <Select value={assignmentDraft.waveNumber || 'none'} onValueChange={(value) => setAssignmentDraft((current) => ({ ...current, waveNumber: value === 'none' ? '' : value }))}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select wave" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select wave</SelectItem>
                      {availableWaveOptions.map((wave) => (
                        <SelectItem key={`assignment-wave-${wave.waveNumber}`} value={String(wave.waveNumber)}>
                          {wave.label} ({wave.traineeCount} trainees)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={assignmentDraft.targetId} onValueChange={(value) => setAssignmentDraft((current) => ({ ...current, targetId: value }))}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder={`Select ${assignmentDraft.targetType === 'batch' ? 'batch' : 'trainee'}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignmentDraft.targetType === 'batch'
                        ? availableBatchOptionsForAssignment
                            .map((batch) => (
                              <SelectItem key={batch.id} value={batch.id}>
                                {batch.waveNumber ? `${batch.name} | Wave ${batch.waveNumber}` : batch.name}
                              </SelectItem>
                            ))
                        : (workspace.trainees || []).map((trainee) => (
                            <SelectItem key={trainee.id} value={trainee.id}>
                              {trainee.fullName} ({trainee.batchNames[0] || 'No batch'})
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Assignment Mode</Label>
                <Select value={assignmentDraft.assignmentMode} onValueChange={(value: AssignmentDraft['assignmentMode']) => setAssignmentDraft((current) => ({ ...current, assignmentMode: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entire_category">Entire Assessment</SelectItem>
                    <SelectItem value="selected_questions">Selected Questions</SelectItem>
                    <SelectItem value="random_subset">Random Subset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-4">
              <div>
                <Label>Due Date</Label>
                <Input className="mt-2" type="date" value={assignmentDraft.dueAt} onChange={(event) => setAssignmentDraft((current) => ({ ...current, dueAt: event.target.value }))} />
              </div>
              <div>
                <Label>Passing Score</Label>
                <Input className="mt-2" type="number" min={0} max={100} value={assignmentDraft.passingScore} onChange={(event) => setAssignmentDraft((current) => ({ ...current, passingScore: event.target.value }))} />
              </div>
              <div>
                <Label>Maximum Attempts</Label>
                <Input className="mt-2" type="number" min={1} value={assignmentDraft.maximumAttempts} onChange={(event) => setAssignmentDraft((current) => ({ ...current, maximumAttempts: event.target.value }))} />
              </div>
              <div>
                <Label>Timer (Minutes)</Label>
                <Input className="mt-2" type="number" min={1} value={assignmentDraft.timeLimitMinutes} onChange={(event) => setAssignmentDraft((current) => ({ ...current, timeLimitMinutes: event.target.value }))} />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-950">Randomization</div>
                    <div className="text-sm text-slate-600">Shuffle answer choices and optionally question order each attempt.</div>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-900">Shuffle answer choices</div>
                      <div className="text-xs text-slate-500">Randomize choice order on every attempt.</div>
                    </div>
                    <Switch checked={assignmentDraft.shuffleChoices} onCheckedChange={(value) => setAssignmentDraft((current) => ({ ...current, shuffleChoices: value }))} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-900">Shuffle question order</div>
                      <div className="text-xs text-slate-500">Serve questions in a different order each time.</div>
                    </div>
                    <Switch checked={assignmentDraft.shuffleQuestions} onCheckedChange={(value) => setAssignmentDraft((current) => ({ ...current, shuffleQuestions: value }))} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="font-semibold text-slate-950">Question Pool</div>
                <div className="mt-2 text-sm text-slate-600">
                  {assignmentDraft.assignmentMode === 'entire_category'
                    ? `All active questions from ${selectedAssignmentAssessment?.title || 'the selected assessment'} will be used.`
                    : assignmentDraft.assignmentMode === 'selected_questions'
                      ? `Pick the exact questions to include from ${selectedAssignmentAssessment?.title || 'the selected assessment'}.`
                      : `Optionally narrow the ${selectedAssignmentAssessment?.title || 'selected assessment'} pool below, then define how many questions are drawn per attempt.`}
                </div>
                {assignmentDraft.assignmentMode === 'random_subset' ? (
                  <div className="mt-4">
                    <Label>Random Question Count</Label>
                    <Input className="mt-2" type="number" min={1} value={assignmentDraft.randomQuestionCount} onChange={(event) => setAssignmentDraft((current) => ({ ...current, randomQuestionCount: event.target.value }))} />
                  </div>
                ) : null}
              </div>
            </div>

            {assignmentDraft.assignmentMode !== 'entire_category' ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="font-semibold text-slate-950">Selectable Questions</div>
                    <div className="text-sm text-slate-600">
                      {assignmentDraft.assignmentMode === 'selected_questions'
                        ? 'These selected questions become the exact assessment set.'
                        : 'These selected questions define the pool for random draws. Leave blank to use the full assessment pool.'}
                    </div>
                  </div>
                  <Input
                    className="max-w-sm"
                    value={assignmentQuestionSearch}
                    onChange={(event) => setAssignmentQuestionSearch(event.target.value)}
                    placeholder="Search questions in this assessment"
                  />
                </div>
                <ScrollArea className="mt-4 h-[260px] pr-4">
                  <div className="space-y-3">
                    {filteredAssignmentPoolQuestions.map((question) => {
                      const isChecked = assignmentDraft.questionIds.includes(question.id)
                      return (
                        <label key={question.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setAssignmentDraft((current) => ({
                                ...current,
                                questionIds: checked
                                  ? [...current.questionIds, question.id]
                                  : current.questionIds.filter((questionId) => questionId !== question.id),
                              }))
                            }}
                          />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium text-slate-950">
                                Q{question.questionNumber || question.orderIndex + 1}. {question.questionText}
                              </div>
                              {question.pointValue ? <Badge variant="outline">{question.pointValue} pt{question.pointValue === 1 ? '' : 's'}</Badge> : null}
                            </div>
                            <div className="text-xs text-slate-500">
                              Correct answer: {question.correctAnswer}
                              {question.difficulty ? ` | ${question.difficulty}` : ''}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                    {!filteredAssignmentPoolQuestions.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                        No questions are available for the selected assessment and search.
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setAssignmentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveAssignment()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Assignment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!coachingTarget} onOpenChange={(open) => !open && setCoachingTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Coach Attempt</DialogTitle>
            <DialogDescription>
              Add shared coaching feedback for {coachingTarget?.traineeName || 'this trainee'}.
            </DialogDescription>
          </DialogHeader>
          {coachingTarget ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="Trainee" value={coachingTarget.traineeName} icon={<Users className="size-4 text-sky-600" />} />
                <MetricCard label="Score" value={`${coachingTarget.score.toFixed(2)}%`} icon={<BarChart3 className="size-4 text-emerald-600" />} />
                <MetricCard label="Status" value={coachingTarget.status.toUpperCase()} icon={<CheckCircle2 className="size-4 text-amber-600" />} />
              </div>
              <div>
                <Label>Feedback</Label>
                <Textarea className="mt-2" rows={4} value={coachingDraft.feedback} onChange={(event) => setCoachingDraft((current) => ({ ...current, feedback: event.target.value }))} />
              </div>
              <div>
                <Label>Trainer Note</Label>
                <Textarea className="mt-2" rows={3} value={coachingDraft.trainerNote} onChange={(event) => setCoachingDraft((current) => ({ ...current, trainerNote: event.target.value }))} />
              </div>
              <div>
                <Label>Action Items</Label>
                <Textarea className="mt-2" rows={3} value={coachingDraft.actionItems} onChange={(event) => setCoachingDraft((current) => ({ ...current, actionItems: event.target.value }))} />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setCoachingTarget(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleSaveCoaching()} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save Coaching Note
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === 'category' ? 'Archive category?' : 'Delete item?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'category'
                ? `Archive "${deleteTarget.record.title}" and remove it from the active trainer workspace. Existing Supabase records remain available for reporting.`
                : deleteTarget?.kind === 'assessment'
                  ? `Delete "${deleteTarget.record.title}" from the assessment library. This cannot be undone.`
                  : deleteTarget?.kind === 'question'
                    ? `Delete question ${deleteTarget.record.questionNumber || deleteTarget.record.orderIndex + 1} from the question bank. This cannot be undone.`
                    : deleteTarget?.kind === 'assignment'
                      ? `Delete "${deleteTarget.record.title || deleteTarget.record.categoryTitle}" and remove trainee access to this assignment.`
                      : 'Confirm this destructive action before continuing.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={deleteTarget?.kind === 'category' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}
              disabled={saving}
              onClick={() => void handleConfirmDelete()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {deleteTarget?.kind === 'category' ? 'Archive Category' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DetailLine({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  )
}

function MiniAnalysisBlock({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'emerald' | 'amber' | 'sky'
}) {
  const toneClassName =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/80'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/80'
        : 'border-sky-200 bg-sky-50/80'

  return (
    <div className={`rounded-2xl border p-4 ${toneClassName}`}>
      <div className="font-semibold text-slate-950">{title}</div>
      {items.length ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item} className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-700">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-600">No notes recorded yet.</div>
      )}
    </div>
  )
}
