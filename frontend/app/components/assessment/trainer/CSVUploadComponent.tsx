'use client'

import { Button } from '@/app/components/ui/button'
import { Card } from '@/app/components/ui/card'
import {
    downloadCSVTemplate,
    uploadQuestionsCSV,
} from '@/app/lib/assessment/redesign-service'
import { AlertCircle, CheckCircle, Download, Upload, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'

interface CSVUploadComponentProps {
  categoryId: string
  categoryName: string
  onUploadSuccess?: () => void
}

interface UploadResult {
  status: string
  total_rows: number
  successful: number
  failed: number
  created_question_ids: string[]
  errors: Array<{ row: number; question_number: string | number; error: string }>
  message: string
}

export function CSVUploadComponent({
  categoryId,
  categoryName,
  onUploadSuccess,
}: CSVUploadComponentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownloadTemplate() {
    try {
      const { template, filename } = await downloadCSVTemplate()
      
      // Create blob and download
      const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to download template:', err)
      setError('Failed to download template')
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      setError('File size must be less than 5MB')
      return
    }

    try {
      setUploading(true)
      setError(null)
      setResult(null)
      setShowErrors(false)

      const uploadResult = await uploadQuestionsCSV(categoryId, file)
      setResult(uploadResult)

      // Call success callback
      if (onUploadSuccess && uploadResult.successful > 0) {
        onUploadSuccess()
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to upload CSV file'
      setError(errorMsg)
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold mb-4">Bulk Upload Questions</h3>
        <p className="text-sm text-gray-600 mb-4">
          Category: <span className="font-medium">{categoryName}</span>
        </p>

        <div className="space-y-3">
          {/* Download Template Button */}
          <Button
            onClick={handleDownloadTemplate}
            variant="outline"
            className="w-full gap-2"
            disabled={uploading}
          >
            <Download size={18} />
            Download CSV Template
          </Button>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Select CSV File
            </label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                disabled={uploading}
                className="flex-1 px-3 py-2 border rounded file:bg-blue-500 file:text-white file:border-none file:px-3 file:py-1 file:rounded file:cursor-pointer"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-2"
              >
                <Upload size={18} />
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Maximum file size: 5MB. Supported format: CSV
            </p>
          </div>
        </div>
      </Card>

      {/* Error Alert */}
      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex gap-3">
            <XCircle className="text-red-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-medium text-red-800">Upload Failed</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Upload Results */}
      {result && (
        <Card
          className={`p-6 border-2 ${
            result.failed === 0
              ? 'border-green-200 bg-green-50'
              : 'border-yellow-200 bg-yellow-50'
          }`}
        >
          <div className="flex items-start gap-3 mb-4">
            {result.failed === 0 ? (
              <CheckCircle className="text-green-600 flex-shrink-0" size={24} />
            ) : (
              <AlertCircle className="text-yellow-600 flex-shrink-0" size={24} />
            )}
            <div>
              <h4 className="font-semibold">
                {result.failed === 0
                  ? 'Upload Successful'
                  : 'Upload Completed with Errors'}
              </h4>
              <p className="text-sm">{result.message}</p>
            </div>
          </div>

          {/* Results Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded p-3">
              <div className="text-xs font-medium text-gray-600">
                Total Rows
              </div>
              <div className="text-2xl font-bold">{result.total_rows}</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-xs font-medium text-green-600">
                Successful
              </div>
              <div className="text-2xl font-bold text-green-600">
                {result.successful}
              </div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-xs font-medium text-red-600">Failed</div>
              <div className="text-2xl font-bold text-red-600">
                {result.failed}
              </div>
            </div>
          </div>

          {/* Errors Section */}
          {result.failed > 0 && (
            <div>
              <button
                onClick={() => setShowErrors(!showErrors)}
                className="text-sm text-blue-600 hover:underline mb-2"
              >
                {showErrors ? 'Hide' : 'Show'} Error Details ({result.errors.length})
              </button>

              {showErrors && result.errors.length > 0 && (
                <div className="bg-white rounded border border-red-200 max-h-64 overflow-y-auto">
                  {result.errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="px-4 py-3 border-b border-red-100 last:border-b-0 text-sm"
                    >
                      <p className="font-medium text-red-700">
                        Row {err.row} (Question #
                        {err.question_number})
                      </p>
                      <p className="text-red-600 text-xs mt-1">{err.error}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload Success Stats */}
          {result.successful > 0 && (
            <div className="mt-4 p-3 bg-white rounded border border-green-200">
              <p className="text-sm font-medium text-green-700">
                ✓ Successfully uploaded {result.successful} question
                {result.successful !== 1 ? 's' : ''}
              </p>
              {result.created_question_ids.length > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  Question IDs: {result.created_question_ids.slice(0, 3).join(', ')}
                  {result.created_question_ids.length > 3 ? '...' : ''}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* CSV Format Guide */}
      <Card className="p-4 bg-gray-50">
        <h4 className="font-semibold text-sm mb-3">CSV Format Guide</h4>
        <div className="text-sm space-y-2 text-gray-700">
          <p>
            <span className="font-medium">Required Columns:</span>
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>
              <span className="font-medium">Question Number</span> - Integer (e.g.,
              1, 2, 3)
            </li>
            <li>
              <span className="font-medium">Question</span> - The question text
            </li>
            <li>
              <span className="font-medium">Choice 1-4</span> - Four answer options
            </li>
            <li>
              <span className="font-medium">Correct Answer</span> - A, B, C, or D
            </li>
          </ul>
          <div className="mt-3 p-2 bg-white rounded border border-gray-200">
            <p className="text-xs font-mono">
              Example: 1, What is 2+2?, 3, 4, 5, 6, B
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
