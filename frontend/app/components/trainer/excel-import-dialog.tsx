'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ExcelImportDialogProps {
  onImport: (data: any) => void;
}

export default function ExcelImportDialog({ onImport }: ExcelImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    valid: boolean;
    rows: number;
    errors: string[];
    warnings: string[];
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls') || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        validateFile(selectedFile);
      } else {
        toast.error('Please select a valid Excel file (.xlsx, .xls, or .csv)');
      }
    }
  };

  const validateFile = (file: File) => {
    setIsProcessing(true);
    
    // Simulate file validation
    setTimeout(() => {
      const mockValidation = {
        valid: true,
        rows: Math.floor(Math.random() * 50) + 10,
        errors: [],
        warnings: [
          'Row 15: Missing expected keyword for Agent response',
          'Row 23: Bot response exceeds recommended length (>200 characters)'
        ]
      };
      
      setValidationResults(mockValidation);
      setIsProcessing(false);
      
      if (mockValidation.valid) {
        toast.success(`File validated successfully. Found ${mockValidation.rows} dialogue rows.`);
      }
    }, 2000);
  };

  const handleImport = () => {
    if (file && validationResults?.valid) {
      setIsProcessing(true);
      
      // Simulate import process
      setTimeout(() => {
        onImport({
          fileName: file.name,
          rows: validationResults.rows,
          timestamp: new Date().toISOString()
        });
        
        toast.success(`Successfully imported ${validationResults.rows} dialogue turns`);
        setOpen(false);
        setFile(null);
        setValidationResults(null);
        setIsProcessing(false);
      }, 1500);
    }
  };

  const downloadTemplate = () => {
    toast.success('Template downloaded to your Downloads folder');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4 mr-2" />
          Excel Import
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Scenarios from Excel</DialogTitle>
          <DialogDescription>
            Import 50+ dialogue turns from a pre-formatted Excel template
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Template Download Section */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-600 rounded">
                <FileSpreadsheet className="size-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="mb-2">First time importing?</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Download our standard template to ensure your data is formatted correctly.
                </p>
                <Button onClick={downloadTemplate} variant="outline" size="sm">
                  <Download className="size-4 mr-2" />
                  Download Template
                </Button>
              </div>
            </div>
          </div>

          {/* Template Structure Info */}
          <Alert>
            <AlertDescription>
              <h4 className="mb-2">Template Structure:</h4>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-3 gap-4 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                  <div>
                    <strong>Column A:</strong> Node ID
                  </div>
                  <div>
                    <strong>Column B:</strong> Speaker (Bot/Agent)
                  </div>
                  <div>
                    <strong>Column C:</strong> Dialogue Content
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                  <div>
                    <strong>Column D:</strong> Expected Keywords
                  </div>
                  <div>
                    <strong>Column E:</strong> Parent Node (for branching)
                  </div>
                  <div>
                    <strong>Column F:</strong> Branch Condition
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* File Upload Section */}
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
              <input
                type="file"
                id="excel-upload"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="excel-upload" className="cursor-pointer">
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
                    <Upload className="size-8 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="mb-1">
                      {file ? file.name : 'Click to select Excel file'}
                    </p>
                    <p className="text-sm text-gray-500">
                      Supported formats: .xlsx, .xls, .csv
                    </p>
                  </div>
                  {!file && (
                    <Button variant="outline" size="sm" type="button">
                      Browse Files
                    </Button>
                  )}
                </div>
              </label>
            </div>

            {/* Validation Results */}
            {isProcessing && (
              <div className="text-center py-4">
                <div className="inline-block size-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Validating file structure...</p>
              </div>
            )}

            {validationResults && !isProcessing && (
              <div className="space-y-3">
                {validationResults.valid && (
                  <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <CheckCircle2 className="size-5 text-green-600 mt-0.5" />
                    <div>
                      <h4 className="mb-1">Validation Passed</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Found {validationResults.rows} dialogue turns ready to import
                      </p>
                    </div>
                  </div>
                )}

                {validationResults.errors.length > 0 && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <h4 className="text-sm mb-2">Errors:</h4>
                    <ul className="text-xs space-y-1 text-red-600 dark:text-red-400">
                      {validationResults.errors.map((error, index) => (
                        <li key={index}>- {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {validationResults.warnings.length > 0 && (
                  <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <AlertTriangle className="size-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm mb-2">Warnings:</h4>
                      <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                        {validationResults.warnings.map((warning, index) => (
                          <li key={index}>- {warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Import Tips */}
          <Alert>
            <AlertDescription>
              <h4 className="text-sm mb-2">Import Tips:</h4>
              <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                <li>- Ensure all mandatory columns are filled</li>
                <li>- Use unique Node IDs for each dialogue turn</li>
                <li>- For branching logic, reference Parent Node IDs correctly</li>
                <li>- Expected Keywords should be comma-separated</li>
                <li>- Maximum 100 dialogue turns per import</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => {
            setOpen(false);
            setFile(null);
            setValidationResults(null);
          }}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport}
            disabled={!file || !validationResults?.valid || isProcessing}
          >
            {isProcessing ? 'Importing...' : 'Import Scenario'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
