'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  CheckCircle2,
  XCircle,
  Award,
  FileText,
  Mic,
  ClipboardCheck,
  AlertCircle,
  Download,
  Eye,
  Calendar,
  User
} from 'lucide-react';
import { toast } from 'sonner';

interface TraineeAssessmentData {
  traineeId: string;
  traineeName: string;
  assessmentDate: string;
  unitOfCompetency: string;
  asrAccuracy: number;
  mcqScore: number;
  mcqTotal: number;
  performanceCriteria: {
    id: string;
    criteria: string;
    status: 'met' | 'not-met' | 'pending';
  }[];
  trainerRemarks: string;
  certificationStatus: 'pending' | 'competent' | 'not-yet-competent';
}

const mockAssessmentData: TraineeAssessmentData = {
  traineeId: 'TRN-2024-001',
  traineeName: 'Maria Santos',
  assessmentDate: '2024-01-15',
  unitOfCompetency: 'Provide Effective Customer Service (TRS712201)',
  asrAccuracy: 92,
  mcqScore: 18,
  mcqTotal: 20,
  performanceCriteria: [
    { id: 'pc-1', criteria: 'Customer is greeted in a polite and friendly manner', status: 'met' },
    { id: 'pc-2', criteria: "Customer's needs are identified through effective questioning", status: 'met' },
    { id: 'pc-3', criteria: 'Opportunity to provide additional information is maximized', status: 'not-met' },
    { id: 'pc-4', criteria: 'Courteous and helpful service is provided', status: 'met' },
    { id: 'pc-5', criteria: 'Customer inquiry is handled promptly', status: 'met' },
  ],
  trainerRemarks: '',
  certificationStatus: 'pending'
};

export default function TrainerGradingPanel() {
  const [selectedAssessment, setSelectedAssessment] = useState<TraineeAssessmentData>(mockAssessmentData);
  const [trainerRemarks, setTrainerRemarks] = useState('');
  const [selectedVerdict, setSelectedVerdict] = useState<'competent' | 'not-yet-competent' | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const metCriteria = selectedAssessment.performanceCriteria.filter(pc => pc.status === 'met').length;
  const totalCriteria = selectedAssessment.performanceCriteria.length;
  const criteriaPercentage = (metCriteria / totalCriteria) * 100;
  const mcqPercentage = (selectedAssessment.mcqScore / selectedAssessment.mcqTotal) * 100;

  // Check if trainee meets minimum requirements
  const meetsRequirements = 
    selectedAssessment.asrAccuracy >= 80 && 
    mcqPercentage >= 80 && 
    criteriaPercentage === 100;

  const handleVerdictClick = (verdict: 'competent' | 'not-yet-competent') => {
    setSelectedVerdict(verdict);
    setShowConfirmation(true);
  };

  const handleSubmitVerdict = () => {
    if (!trainerRemarks.trim()) {
      toast.error('Please provide trainer remarks before submitting verdict');
      return;
    }

    // Simulate database update
    const verdictData = {
      traineeId: selectedAssessment.traineeId,
      verdict: selectedVerdict,
      trainerRemarks: trainerRemarks,
      isCertified: selectedVerdict === 'competent',
      completionDate: new Date().toISOString(),
      timestamp: Date.now()
    };

    console.log('Submitting verdict to database:', verdictData);

    if (selectedVerdict === 'competent') {
      toast.success(' Trainee marked as COMPETENT! Certificate will be generated.', {
        duration: 5000
      });
    } else {
      toast.success('Trainee marked as NOT YET COMPETENT. Feedback has been sent.', {
        duration: 5000
      });
    }

    setShowConfirmation(false);
    setSelectedVerdict(null);
  };

  const handleGenerateCertificate = () => {
    toast.success('Generating certificate record...', {
      duration: 3000
    });
    // Certificate generation logic will be triggered
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl flex items-center gap-3">
            <ClipboardCheck className="size-8 text-blue-600" />
            Trainer Grading & Verdict Panel
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Review trainee performance and provide the final competency verdict
          </p>
        </div>
      </div>

      {/* Trainee Information Card */}
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <User className="size-5" />
              Trainee Assessment Summary
            </span>
            <Badge variant="outline" className="text-xs">
              {selectedAssessment.traineeId}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Trainee Name</p>
              <p className="font-medium">{selectedAssessment.traineeName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Assessment Date</p>
              <p className="font-medium flex items-center gap-2">
                <Calendar className="size-4" />
                {selectedAssessment.assessmentDate}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Unit of Competency</p>
              <p className="font-medium text-sm">{selectedAssessment.unitOfCompetency}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assessment Results */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ASR Accuracy */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mic className="size-4 text-purple-600" />
              ASR Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{selectedAssessment.asrAccuracy}%</div>
            <div className="flex items-center gap-2 mt-2">
              {selectedAssessment.asrAccuracy >= 80 ? (
                <>
                  <CheckCircle2 className="size-4 text-green-600" />
                  <span className="text-sm text-green-600">Meets Standard (80%)</span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-red-600" />
                  <span className="text-sm text-red-600">Below Standard (&lt;80%)</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* MCQ Score */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="size-4 text-blue-600" />
              MCQ Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {selectedAssessment.mcqScore}/{selectedAssessment.mcqTotal}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {mcqPercentage >= 80 ? (
                <>
                  <CheckCircle2 className="size-4 text-green-600" />
                  <span className="text-sm text-green-600">
                    Passed ({mcqPercentage.toFixed(0)}%)
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-red-600" />
                  <span className="text-sm text-red-600">
                    Failed ({mcqPercentage.toFixed(0)}%)
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Performance Criteria */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="size-4 text-orange-600" />
              Performance Criteria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metCriteria}/{totalCriteria}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {criteriaPercentage === 100 ? (
                <>
                  <CheckCircle2 className="size-4 text-green-600" />
                  <span className="text-sm text-green-600">All Criteria Met</span>
                </>
              ) : (
                <>
                  <AlertCircle className="size-4 text-yellow-600" />
                  <span className="text-sm text-yellow-600">
                    {criteriaPercentage.toFixed(0)}% Complete
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Eligibility Check */}
      <Card className={meetsRequirements ? 'border-green-200 bg-green-50 dark:bg-green-950/30' : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30'}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            {meetsRequirements ? (
              <CheckCircle2 className="size-6 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="size-6 text-yellow-600 mt-0.5" />
            )}
            <div>
              <h3 className="font-medium">
                {meetsRequirements ? 'Trainee Meets Minimum Requirements' : 'Requirements Not Fully Met'}
              </h3>
              <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                {meetsRequirements 
                  ? 'This trainee has met all minimum requirements (ASR 80%, MCQ 80%, All Performance Criteria). You may proceed with competency verdict.'
                  : 'This trainee has not met all minimum requirements. Review the assessment results before providing a verdict.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Criteria Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance Criteria Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2 pr-4">
              {selectedAssessment.performanceCriteria.map((pc) => (
                <div key={pc.id} className="flex items-start gap-2 text-sm p-2 border rounded">
                  {pc.status === 'met' ? (
                    <CheckCircle2 className="size-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : pc.status === 'not-met' ? (
                    <XCircle className="size-4 text-red-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="size-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  )}
                  <span className={pc.status === 'not-met' ? 'text-red-600' : ''}>
                    {pc.criteria}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Separator />

      {/* Trainer's Remarks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trainer's Remarks (Required)</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Provide detailed feedback on the trainee's performance, strengths, and areas for improvement
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={trainerRemarks}
            onChange={(e) => setTrainerRemarks(e.target.value)}
            placeholder="Enter your detailed remarks here...&#10;&#10;Example:&#10;- Demonstrated excellent active listening skills&#10;- Shows strong empathy in customer interactions&#10;- Needs improvement in cross-selling techniques&#10;- Recommended additional practice in product knowledge"
            className="min-h-[150px]"
          />
          <p className="text-xs text-gray-500 mt-2">
            {trainerRemarks.length} characters
          </p>
        </CardContent>
      </Card>

      {/* Verdict Buttons */}
      {!showConfirmation && (
        <Card className="border-2 border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Final Competency Verdict</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Select the final verdict based on your assessment. This will update the trainee's certification status.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button
                size="lg"
                className="h-24 text-xl bg-green-600 hover:bg-green-700"
                onClick={() => handleVerdictClick('competent')}
                disabled={!trainerRemarks.trim()}
              >
                <CheckCircle2 className="size-8 mr-3" />
                <div className="text-left">
                  <div className="font-bold">COMPETENT</div>
                  <div className="text-xs font-normal">Trainee has demonstrated competency</div>
                </div>
              </Button>

              <Button
                size="lg"
                variant="destructive"
                className="h-24 text-xl"
                onClick={() => handleVerdictClick('not-yet-competent')}
                disabled={!trainerRemarks.trim()}
              >
                <XCircle className="size-8 mr-3" />
                <div className="text-left">
                  <div className="font-bold">NOT YET COMPETENT</div>
                  <div className="text-xs font-normal">Trainee requires further training</div>
                </div>
              </Button>
            </div>
            {!trainerRemarks.trim() && (
              <p className="text-sm text-red-600 mt-3 flex items-center gap-2">
                <AlertCircle className="size-4" />
                Please provide trainer remarks before submitting a verdict
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <Card className="border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-6 text-blue-600" />
              Confirm Verdict
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
              <p className="font-medium mb-2">You are about to mark:</p>
              <p className="text-lg">
                <strong>{selectedAssessment.traineeName}</strong> as{' '}
                <Badge className={selectedVerdict === 'competent' ? 'bg-green-600' : 'bg-red-600'}>
                  {selectedVerdict === 'competent' ? 'COMPETENT' : 'NOT YET COMPETENT'}
                </Badge>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Unit: {selectedAssessment.unitOfCompetency}
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
              <p className="font-medium mb-2">Trainer's Remarks:</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{trainerRemarks}</p>
            </div>

            {selectedVerdict === 'competent' && (
              <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-lg border border-green-300">
                <p className="text-sm text-green-800 dark:text-green-200">
                   This action will:
                </p>
                <ul className="text-sm text-green-700 dark:text-green-300 mt-2 ml-4 space-y-1 list-disc">
                  <li>Update trainee's <code>is_certified</code> status to <strong>True</strong></li>
                  <li>Record completion date: <strong>{new Date().toLocaleDateString()}</strong></li>
                  <li>Generate a certificate record for the trainee</li>
                  <li>Send notification to trainee</li>
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                size="lg"
                className="flex-1"
                onClick={handleSubmitVerdict}
              >
                <CheckCircle2 className="size-5 mr-2" />
                Confirm & Submit Verdict
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setShowConfirmation(false);
                  setSelectedVerdict(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
