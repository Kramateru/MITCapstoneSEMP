'use client'

import { Button } from '@/app/components/ui/button'
import { Card } from '@/app/components/ui/card'
import {
    fetchAssignmentQuestions,
    fetchAvailableAssignments,
    submitAssessmentAttempt,
} from '@/app/lib/assessment/redesign-service'
import { useSession } from '@/app/lib/session'
import { useEffect, useState } from 'react'

export function TraineeAssessmentView() {
  const { user } = useSession()
  const [assignments, setAssignments] = useState<any[]>([])
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user?.id) {
      loadAssignments()
    }
  }, [user?.id])

  async function loadAssignments() {
    try {
      setLoading(true)
      const data = await fetchAvailableAssignments(user!.id)
      setAssignments(data)
    } catch (error) {
      console.error('Failed to load assignments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function startAssessment(assignment: any) {
    try {
      setSelectedAssignment(assignment)
      const data = await fetchAssignmentQuestions(assignment.id)
      setQuestions(data)
      setAnswers({})
    } catch (error) {
      console.error('Failed to load questions:', error)
      alert('Failed to load assessment questions')
    }
  }

  async function handleSubmit() {
    // Validate all questions answered
    if (Object.keys(answers).length !== questions.length) {
      alert('Please answer all questions before submitting')
      return
    }

    try {
      setSubmitting(true)
      const result = await submitAssessmentAttempt({
        assignment_id: selectedAssignment.id,
        category_id: selectedAssignment.category_id,
        trainee_id: user!.id,
        attempt_number: 1,
        answers,
        time_spent_seconds: 0,
        question_snapshot: questions,
        choice_snapshot: {},
      })
      setResults(result)
      setSubmitted(true)
    } catch (error) {
      console.error('Failed to submit assessment:', error)
      alert('Failed to submit assessment')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRetake() {
    setSubmitted(false)
    setResults(null)
    setAnswers({})
    if (selectedAssignment) {
      startAssessment(selectedAssignment)
    }
  }

  if (submitted && results) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Card className="p-8 text-center space-y-4">
          <h2 className="text-3xl font-bold">
            {results.passed ? '✅ Assessment Passed!' : '❌ Assessment Failed'}
          </h2>
          <div className="text-5xl font-bold" style={{ color: results.passed ? '#10b981' : '#ef4444' }}>
            {results.score.toFixed(1)}%
          </div>
          <div className="text-lg text-gray-600">
            {results.correct_answers} out of {results.total_questions} correct
          </div>
          
          {results.analysis_summary && (
            <div className="mt-6 p-4 bg-gray-50 rounded space-y-2 text-left">
              <h3 className="font-bold">Analysis Summary</h3>
              <p className="text-sm">
                <strong>Passing Score Required:</strong> {results.analysis_summary.passing_requirement}%
              </p>
              <p className="text-sm">
                <strong>Result:</strong> {results.analysis_summary.pass_fail.toUpperCase()}
              </p>
              {results.analysis_summary.areas_for_improvement?.length > 0 && (
                <p className="text-sm">
                  <strong>Areas for Improvement:</strong> {results.analysis_summary.areas_for_improvement.join(', ')}
                </p>
              )}
              {results.analysis_summary.recommended_topics?.length > 0 && (
                <p className="text-sm">
                  <strong>Recommended Topics:</strong> {results.analysis_summary.recommended_topics.join(', ')}
                </p>
              )}
            </div>
          )}

          {!results.passed && (
            <Button 
              onClick={handleRetake}
              className="w-full mt-6"
            >
              Retake Assessment
            </Button>
          )}

          {results.passed && (
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <p className="text-green-800 font-semibold">🎓 Certificate Issued</p>
              <p className="text-sm text-green-700">You have earned a certificate for this assessment.</p>
            </div>
          )}
        </Card>

        <Button 
          onClick={() => {
            setSelectedAssignment(null)
            setQuestions([])
            setAnswers({})
            setSubmitted(false)
            setResults(null)
          }}
          variant="outline"
          className="w-full"
        >
          Back to Assessments
        </Button>
      </div>
    )
  }

  if (selectedAssignment && questions.length > 0) {
    const answeredCount = Object.keys(answers).length
    const totalCount = questions.length

    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">{selectedAssignment.assignment_title}</h2>
          <div className="text-sm text-gray-600">
            Progress: {answeredCount}/{totalCount} answered
          </div>
        </div>
        
        <div className="w-full bg-gray-200 rounded h-2">
          <div 
            className="bg-blue-600 h-2 rounded transition-all"
            style={{ width: `${(answeredCount / totalCount) * 100}%` }}
          />
        </div>

        {questions.map((q, idx) => (
          <Card key={q.id} className="p-6 space-y-4">
            <div className="font-semibold text-lg">
              Question {idx + 1} of {questions.length}
            </div>
            <div className="text-base">
              {q.question_text}
            </div>
            <div className="space-y-2">
              {q.options.map((option: string, optIdx: number) => (
                <label key={optIdx} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded cursor-pointer border">
                  <input
                    type="radio"
                    name={q.id}
                    value={option}
                    onChange={(e) => setAnswers({...answers, [q.id]: e.target.value})}
                    checked={answers[q.id] === option}
                    className="w-4 h-4"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </Card>
        ))}

        <Button 
          onClick={handleSubmit}
          disabled={submitting || answeredCount !== totalCount}
          className="w-full h-12 text-lg"
        >
          {submitting ? 'Submitting...' : 'Submit Assessment'}
        </Button>

        <Button 
          onClick={() => {
            setSelectedAssignment(null)
            setQuestions([])
            setAnswers({})
          }}
          variant="outline"
          className="w-full"
        >
          Back to Assessments
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Available Assessments</h1>
      
      {loading ? (
        <div className="text-gray-500">Loading assessments...</div>
      ) : assignments.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-gray-600">No assessments assigned yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map(assignment => (
            <Card key={assignment.id} className="p-6 flex justify-between items-center hover:shadow-lg transition-shadow">
              <div>
                <h3 className="font-bold text-lg">{assignment.assignment_title}</h3>
                <p className="text-sm text-gray-600">
                  Category: {assignment.category?.category_name}
                </p>
                {assignment.assignment_description && (
                  <p className="text-sm text-gray-500 mt-1">{assignment.assignment_description}</p>
                )}
              </div>
              <Button onClick={() => startAssessment(assignment)}>
                Start Assessment
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
