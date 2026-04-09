import type {
  AssessmentQuestionRecord,
  AssessmentQuestionType,
  AttemptQuestionResult,
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

export function scoreAssessmentSubmission(
  questions: AssessmentQuestionRecord[],
  answers: Record<string, string>,
) {
  const questionResults: AttemptQuestionResult[] = questions.map((question) => {
    const userAnswer = answers[question.id] || ''
    const isCorrect = compareAnswers(question.questionType, userAnswer, question.correctAnswer)

    return {
      questionId: question.id,
      questionText: question.questionText,
      questionType: question.questionType,
      userAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect,
      explanation: question.explanation,
    }
  })

  const correctAnswers = questionResults.filter((result) => result.isCorrect).length
  const totalQuestions = questionResults.length
  const score = totalQuestions > 0 ? Number(((correctAnswers / totalQuestions) * 100).toFixed(2)) : 0

  return {
    correctAnswers,
    totalQuestions,
    score,
    questionResults,
  }
}
