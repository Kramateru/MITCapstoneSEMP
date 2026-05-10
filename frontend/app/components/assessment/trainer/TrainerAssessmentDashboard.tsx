'use client'

import { Button } from '@/app/components/ui/button'
import { Card } from '@/app/components/ui/card'
import {
    createCategory,
    fetchCategories,
    fetchQuestions,
} from '@/app/lib/assessment/redesign-service'
import { useSession } from '@/app/lib/session'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CSVUploadComponent } from './CSVUploadComponent'

export function TrainerAssessmentDashboard() {
  const { user } = useSession()
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [passingScore, setPassingScore] = useState(90)
  
  // Category management
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  useEffect(() => {
    if (user?.id) {
      loadCategories()
    }
  }, [user?.id])

  useEffect(() => {
    if (selectedCategory?.id) {
      loadQuestions()
    }
  }, [selectedCategory?.id])

  async function loadCategories() {
    try {
      setLoading(true)
      const data = await fetchCategories(user!.id)
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadQuestions() {
    if (!selectedCategory?.id) return
    
    try {
      setLoadingQuestions(true)
      const data = await fetchQuestions(selectedCategory.id)
      setQuestions(data)
    } catch (error) {
      console.error('Failed to load questions:', error)
      setQuestions([])
    } finally {
      setLoadingQuestions(false)
    }
  }

  async function handleCreateCategory() {
    if (!categoryName.trim()) {
      alert('Please enter a category name')
      return
    }
    
    try {
      await createCategory({
        category_name: categoryName,
        description: categoryDescription,
        passing_score: passingScore,
        trainer_id: user!.id,
      })
      setCategoryName('')
      setCategoryDescription('')
      setPassingScore(90)
      setShowCategoryForm(false)
      await loadCategories()
    } catch (error) {
      console.error('Failed to create category:', error)
      alert('Failed to create category')
    }
  }

  function handleManageCategory(category: any) {
    setSelectedCategory(category)
  }

  function handleBackToList() {
    setSelectedCategory(null)
    setQuestions([])
  }

  async function handleUploadSuccess() {
    // Reload questions after successful upload
    await loadQuestions()
  }

  if (selectedCategory) {
    return (
      <div className="space-y-6 p-8">
        {/* Header with back button */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleBackToList}
            className="gap-2"
          >
            <ChevronLeft size={18} />
            Back to Categories
          </Button>
          <h1 className="text-3xl font-bold">{selectedCategory.category_name}</h1>
        </div>

        {/* Category Info */}
        <Card className="p-6 bg-blue-50">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600">Description</p>
              <p className="font-medium">{selectedCategory.description || 'No description'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Passing Score</p>
              <p className="font-medium">{selectedCategory.passing_score}%</p>
            </div>
          </div>
        </Card>

        {/* CSV Upload Component */}
        <CSVUploadComponent
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.category_name}
          onUploadSuccess={handleUploadSuccess}
        />

        {/* Questions List */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Questions in this Category</h3>
          
          {loadingQuestions ? (
            <div className="text-gray-500">Loading questions...</div>
          ) : questions.length === 0 ? (
            <div className="text-gray-500">
              No questions yet. Use the CSV upload above to add questions.
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {questions.map((q, idx) => (
                <div 
                  key={q.id}
                  className="p-4 bg-gray-50 rounded border-l-4 border-blue-500"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        Question {q.question_number}: {q.question_text.substring(0, 60)}
                        {q.question_text.length > 60 ? '...' : ''}
                      </p>
                      <div className="text-xs text-gray-600 mt-2 space-y-1">
                        <p>A) {q.option_a}</p>
                        <p>B) {q.option_b}</p>
                        <p>C) {q.option_c}</p>
                        <p>D) {q.option_d}</p>
                      </div>
                      <p className="text-xs font-medium text-blue-600 mt-2">
                        ✓ Correct Answer: {q.correct_answer}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
            <p className="font-medium text-blue-900">
              Total Questions: {questions.length}
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Assessment Management</h1>
        <Button 
          onClick={() => setShowCategoryForm(true)}
          className="gap-2"
        >
          <Plus size={18} />
          New Category
        </Button>
      </div>

      {/* Create Category Form */}
      {showCategoryForm && (
        <Card className="p-6 space-y-4 bg-blue-50">
          <h2 className="text-xl font-bold">Create New Category</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Category Name</label>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="e.g., Customer Service Fundamentals"
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (Optional)</label>
            <textarea
              value={categoryDescription}
              onChange={(e) => setCategoryDescription(e.target.value)}
              placeholder="Brief description of this assessment category"
              className="w-full px-3 py-2 border rounded h-24"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Passing Score (%)</label>
            <input
              type="number"
              value={passingScore}
              onChange={(e) => setPassingScore(parseInt(e.target.value))}
              min="0"
              max="100"
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreateCategory}>Create Category</Button>
            <Button variant="outline" onClick={() => setShowCategoryForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-500">Total Categories</div>
          <div className="text-3xl font-bold">{categories.length}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-gray-500">Total Questions</div>
          <div className="text-3xl font-bold">{questions.length}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-gray-500">Active Assignments</div>
          <div className="text-3xl font-bold">-</div>
        </Card>
      </div>

      {/* Categories List */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Assessment Categories</h2>
        {loading ? (
          <div className="text-gray-500">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="text-gray-500">No categories created yet. Click "New Category" to get started.</div>
        ) : (
          <div className="space-y-4">
            {categories.map(cat => (
              <div 
                key={cat.id}
                className="flex justify-between items-center p-4 bg-gray-50 rounded hover:bg-gray-100 transition"
              >
                <div>
                  <h3 className="font-semibold">{cat.category_name}</h3>
                  <p className="text-sm text-gray-500">{cat.description || 'No description'}</p>
                  <p className="text-xs text-gray-400 mt-1">Passing Score: {cat.passing_score}%</p>
                </div>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => handleManageCategory(cat)}
                >
                  Manage
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
