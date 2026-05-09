import type {
  AssessmentQuestionRecord,
  AssessmentQuestionType,
  AttemptAnalysisSummary,
  AttemptQuestionResult,
  QuestionDifficulty,
} from './types'

export function normalizeAssessmentAnswer(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

function compareAnswers(
  questionType: AssessmentQuestionType,
  userAnswer: string,
  correctAnswer: string,
) {
  if (questionType === 'fill_blank') {
    return normalizeAssessmentAnswer(userAnswer) === normalizeAssessmentAnswer(correctAnswer)
  }

  return normalizeAssessmentAnswer(userAnswer) === normalizeAssessmentAnswer(correctAnswer)
}

export function shuffleChoices(choices: string[]) {
  const nextChoices = [...choices]

  for (let index = nextChoices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = nextChoices[index]
    nextChoices[index] = nextChoices[swapIndex]
    nextChoices[swapIndex] = current
  }

  return nextChoices
}

function difficultyLabel(difficulty?: QuestionDifficulty | null) {
  if (!difficulty) {
    return 'all question'
  }

  return `${difficulty} question`
}

export function buildAttemptAnalysisSummary({
  categoryId,
  categoryTitle,
  score,
  questionResults,
}: {
  categoryId: string
  categoryTitle: string
  score: number
  questionResults: AttemptQuestionResult[]
}): AttemptAnalysisSummary {
  const strengths: string[] = []
  const improvements: string[] = []
  const recommendations: string[] = []

  const missedQuestions = questionResults.filter((result) => !result.isCorrect)
  const correctQuestions = questionResults.filter((result) => result.isCorrect)

  const difficultyStats = new Map<
    string,
    {
      difficulty?: QuestionDifficulty | null
      total: number
      correct: number
    }
  >()

  for (const result of questionResults) {
    const key = result.difficulty || 'unspecified'
    const current = difficultyStats.get(key) || {
      difficulty: result.difficulty,
      total: 0,
      correct: 0,
    }
    current.total += 1
    current.correct += result.isCorrect ? 1 : 0
    difficultyStats.set(key, current)
  }

  if (score >= 95) {
    strengths.push('Consistently accurate responses across the assigned question set.')
    strengths.push('Ready for certification-level follow-through with minimal coaching.')
  } else if (score >= 90) {
    strengths.push('Passed the category threshold with strong answer accuracy.')
    strengths.push('Demonstrated reliable recall on most assessed topics.')
  } else if (correctQuestions.length) {
    strengths.push(`Answered ${correctQuestions.length} question${correctQuestions.length === 1 ? '' : 's'} correctly.`)
  }

  if (!missedQuestions.length) {
    recommendations.push('Move to the next assigned category or use a practice retake to reinforce speed and confidence.')
  } else {
    const topMisses = missedQuestions
      .slice(0, 3)
      .map((result) => `Review question ${result.questionNumber}: ${result.questionText}`)

    improvements.push(
      `Focus on ${missedQuestions.length} missed question${missedQuestions.length === 1 ? '' : 's'} from ${categoryTitle}.`,
    )
    improvements.push(...topMisses)

    const weakestDifficulty = Array.from(difficultyStats.values())
      .sort((left, right) => {
        const leftScore = left.correct / Math.max(left.total, 1)
        const rightScore = right.correct / Math.max(right.total, 1)
        return leftScore - rightScore
      })[0]

    if (weakestDifficulty && weakestDifficulty.total > 0) {
      recommendations.push(
        `Spend extra study time on ${difficultyLabel(weakestDifficulty.difficulty)}s before the next attempt.`,
      )
    }

    recommendations.push('Use the explanations from missed items to build a short coaching or review checklist.')
  }

  if (score < 90) {
    recommendations.push('Schedule a retake after targeted review to reach the 90% passing requirement.')
  }

  const summary = score >= 90
    ? `${categoryTitle} was passed with a score of ${score.toFixed(2)}%.`
    : `${categoryTitle} needs additional review after a score of ${score.toFixed(2)}%.`

  return {
    source: 'rules',
    summary,
    strengths,
    improvements,
    recommendations,
    categoryBreakdown: [
      {
        categoryId,
        categoryTitle,
        totalQuestions: questionResults.length,
        correctAnswers: correctQuestions.length,
        score,
      },
    ],
  }
}

export function scoreAssessmentSubmission(
  questions: AssessmentQuestionRecord[],
  answers: Record<string, string>,
  optionsByQuestionId?: Record<string, string[]>,
) {
  const questionResults: AttemptQuestionResult[] = questions.map((question) => {
    const userAnswer = answers[question.id] || ''
    const isCorrect = compareAnswers(question.questionType, userAnswer, question.correctAnswer)
    const orderedChoices = optionsByQuestionId?.[question.id] || question.options || question.choices || []

    return {
      questionId: question.id,
      questionNumber: question.questionNumber,
      questionText: question.questionText,
      questionType: question.questionType,
      difficulty: question.difficulty,
      options: orderedChoices,
      choiceOrder: orderedChoices,
      userAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect,
      explanation: question.explanation,
    }
  })

  const correctAnswers = questionResults.filter((result) => result.isCorrect).length
  const totalQuestions = questionResults.length
  const incorrectAnswers = Math.max(totalQuestions - correctAnswers, 0)
  const score = totalQuestions > 0 ? Number(((correctAnswers / totalQuestions) * 100).toFixed(2)) : 0

  return {
    correctAnswers,
    incorrectAnswers,
    totalQuestions,
    score,
    questionResults,
  }
}
