export type ModuleType = 'video' | 'quiz' | 'flashcard' | 'infographic' | 'case_study' | 'audio';
export type Difficulty = 'basic' | 'intermediate' | 'advanced';
export type FeedbackCategory = 'pronunciation' | 'fluency' | 'grammar' | 'empathy' | 'clarity';
export type AssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'certified';

export interface TopicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface MicrolearningModule {
  id: string;
  title: string;
  description: string | null;
  category: FeedbackCategory;
  module_type: ModuleType;
  duration_minutes: number;
  passing_score: number;
  skill_focus: string | null;
  content_url: string | null;
  content_data: Record<string, any>;
  difficulty: Difficulty;
  exercise_count: number;
  assignment_count: number;
  topic_category_id: string | null;
  topic_category_name: string | null;
  audio_url?: string | null;
  audio_transcript?: string | null;
  audio_tts_url?: string | null;
  audio_duration_seconds?: number | null;
  audio_language?: string | null;
  media_requirement?: 'video' | 'audio' | 'none' | string | null;
  media_ready?: boolean;
  media_status?: string | null;
}

export interface Batch {
  id: string;
  name: string;
  wave_number?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export interface Batch {
  id: string;
  name: string;
  wave_number?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  users?: User[];
}

export interface User {
  id: string;
  email: string;
  full_name: string;
}

export interface TrainerReportOverview {
  summary: {
    topic_category_count: number;
    module_count: number;
    assignment_count: number;
    certified_count: number;
    average_score: number;
    pass_rate: number;
  };
  batch_progress: Array<{
    batch_id: string | null;
    batch_label: string;
    trainee_count: number;
    assignment_count: number;
    certified_count: number;
    average_score: number;
    pass_rate: number;
  }>;
  trainee_progress: Array<{
    trainee_id: string | null;
    trainee_name: string;
    batch_label: string;
    assignment_count: number;
    completed_count: number;
    certified_count: number;
    average_score: number;
    pass_rate: number;
  }>;
  recent_certificates: Array<{
    certificate_id: string;
    certificate_no: string;
    trainee_name: string | null;
    module_title: string | null;
    issued_at: string | null;
  }>;
  assignments: Array<{
    id: string;
    title: string | null;
    trainee_name: string | null;
    user_id: string | null;
    batch_id: string | null;
    batch_label: string | null;
    status: AssignmentStatus;
    completion_percentage: number;
    average_score: number;
    completed_exercises: number;
    certificate_id: string | null;
  }>;
}

export interface CategoryFormState {
  name: string;
  description: string;
}

export interface ModuleFormState {
  title: string;
  description: string;
  feedback_category: FeedbackCategory;
  module_type: ModuleType;
  duration_minutes: number;
  passing_score: number;
  skill_focus: string;
  content_url: string;
  asset_record_id: string;
  asset_storage_path: string;
  asset_bucket_name: string;
  asset_content_type: string;
  asset_signed_url_required: boolean;
  difficulty: Difficulty;
  topic_category_id: string;
  // Video specific
  video_questions: Array<{
    timestamp?: number;
    question: string;
    type: 'open_ended' | 'multiple_choice';
    stt_enabled: boolean;
    options?: string[];
    correct_option?: string;
    sample_answer?: string;
    required_keywords?: string;
  }>;
  // Quiz specific
  quiz_questions: Array<{
    question: string;
    options: string[];
    correct_option: string;
  }>;
  // Flashcard specific
  flashcards: Array<{
    front: string;
    back: string;
  }>;
  // Infographic specific
  infographic_questions: Array<{
    question: string;
    type: 'multiple_choice';
    options: string[];
    correct_option: string;
  }>;
  // Case Study specific
  case_study_content: string;
  case_study_questions: Array<{
    question: string;
    type: 'open_ended' | 'multiple_choice';
    stt_enabled: boolean;
    options?: string[];
    correct_option?: string;
    sample_answer?: string;
    required_keywords?: string;
  }>;
  // Audio specific metadata
  audio_content_id: string;
  audio_storage_path: string;
  audio_transcript_provider: string;
  audio_tts_url: string;
  audio_captions_url: string;
  audio_duration_seconds: number;
  audio_language: string;
  audio_summary_text: string;
}

export const NONE_VALUE = '__none__';

export const CATEGORY_STYLES: Record<FeedbackCategory, string> = {
  pronunciation: 'bg-sky-100 text-sky-700 border-sky-200',
  fluency: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  grammar: 'bg-amber-100 text-amber-700 border-amber-200',
  empathy: 'bg-rose-100 text-rose-700 border-rose-200',
  clarity: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

export const STATUS_STYLES: Record<AssignmentStatus, string> = {
  assigned: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
  certified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export function emptyModuleForm(): ModuleFormState {
  return {
    title: '',
    description: '',
    feedback_category: 'clarity',
    module_type: 'video',
    duration_minutes: 5,
    passing_score: 80,
    skill_focus: '',
    content_url: '',
    asset_record_id: '',
    asset_storage_path: '',
    asset_bucket_name: '',
    asset_content_type: '',
    asset_signed_url_required: false,
    difficulty: 'basic',
    topic_category_id: '',
    video_questions: [],
    quiz_questions: [],
    flashcards: [],
    infographic_questions: [],
    case_study_content: '',
    case_study_questions: [],
    audio_content_id: '',
    audio_storage_path: '',
    audio_transcript_provider: '',
    audio_tts_url: '',
    audio_captions_url: '',
    audio_duration_seconds: 0,
    audio_language: 'en-US',
    audio_summary_text: '',
  };
}

export function splitToList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildContentData(form: ModuleFormState) {
  switch (form.module_type) {
    case 'video':
      return {
        asset_url: form.content_url || undefined,
        asset_record_id: form.asset_record_id || undefined,
        asset_storage_path: form.asset_storage_path || undefined,
        asset_bucket: form.asset_bucket_name || undefined,
        asset_content_type: form.asset_content_type || undefined,
        storage_backend: form.asset_storage_path
          ? 'supabase_storage'
          : form.asset_record_id
            ? 'supabase_postgres'
            : undefined,
        signed_url_required: form.asset_storage_path
          ? form.asset_signed_url_required !== false
          : undefined,
        video_questions: form.video_questions.map(q => ({
          question: q.question,
          type: q.type,
          stt_enabled: q.stt_enabled,
          options: q.options || [],
          correct_option: q.correct_option || '',
          sample_answer: q.sample_answer || '',
          required_keywords: splitToList(q.required_keywords || ''),
        })),
      };
    case 'quiz':
      return {
        questions: form.quiz_questions.map(q => ({
          question: q.question,
          options: q.options,
          correct_option: q.correct_option,
        })),
      };
    case 'flashcard':
      return {
        cards: form.flashcards.map(card => ({
          front: card.front,
          back: card.back,
        })),
      };
    case 'infographic':
      return {
        asset_url: form.content_url || undefined,
        asset_record_id: form.asset_record_id || undefined,
        asset_storage_path: form.asset_storage_path || undefined,
        asset_bucket: form.asset_bucket_name || undefined,
        asset_content_type: form.asset_content_type || undefined,
        storage_backend: form.asset_storage_path
          ? 'supabase_storage'
          : form.asset_record_id
            ? 'supabase_postgres'
            : undefined,
        signed_url_required: form.asset_storage_path
          ? form.asset_signed_url_required !== false
          : undefined,
        questions: form.infographic_questions.map(q => ({
          question: q.question,
          type: q.type,
          options: q.options,
          correct_option: q.correct_option,
        })),
      };
    case 'case_study':
      return {
        content: form.case_study_content,
        questions: form.case_study_questions.map(q => ({
          question: q.question,
          type: q.type,
          stt_enabled: q.stt_enabled,
          options: q.options || [],
          correct_option: q.correct_option || '',
          sample_answer: q.sample_answer || '',
          required_keywords: splitToList(q.required_keywords || ''),
        })),
      };
    case 'audio':
      return {
        asset_url: form.content_url || undefined,
        audio_url: form.content_url || undefined,
        content: form.case_study_content,
        transcript: form.case_study_content,
        transcript_text: form.case_study_content,
        captions_text: form.case_study_content,
        summary: form.audio_summary_text || undefined,
        summary_text: form.audio_summary_text || undefined,
        audio_summary: form.audio_summary_text || undefined,
        audio_content_id: form.audio_content_id || undefined,
        audio_storage_path: form.audio_storage_path || undefined,
        transcript_provider: form.audio_transcript_provider || undefined,
        signed_url_required: true,
        tts_url: form.audio_tts_url || undefined,
        captions_url: form.audio_captions_url || undefined,
        audio_duration_seconds: form.audio_duration_seconds || undefined,
        audio_language: form.audio_language || 'en-US',
        questions: form.case_study_questions.map(q => ({
          question: q.question,
          type: q.type,
          stt_enabled: q.stt_enabled,
          options: q.options || [],
          correct_option: q.correct_option || '',
          sample_answer: q.sample_answer || '',
          required_keywords: splitToList(q.required_keywords || ''),
        })),
      };
    default:
      return {};
  }
}

export function moduleToForm(module: MicrolearningModule): ModuleFormState {
  const form = emptyModuleForm();
  const content = module.content_data || {};

  const baseForm = {
    ...form,
    title: module.title || '',
    description: module.description || '',
    feedback_category: module.category || 'clarity',
    module_type: module.module_type || 'video',
    duration_minutes: module.duration_minutes || 5,
    passing_score: module.passing_score || 80,
    skill_focus: module.skill_focus || '',
    content_url: module.content_url || content.asset_url || '',
    asset_record_id: content.asset_record_id || '',
    asset_storage_path: content.asset_storage_path || '',
    asset_bucket_name: content.asset_bucket || '',
    asset_content_type: content.asset_content_type || '',
    asset_signed_url_required: Boolean(
      content.asset_storage_path && content.signed_url_required !== false,
    ),
    difficulty: module.difficulty || 'basic',
    topic_category_id: module.topic_category_id || '',
    audio_content_id: content.audio_content_id || '',
    audio_storage_path: content.audio_storage_path || '',
    audio_transcript_provider: content.transcript_provider || '',
    audio_tts_url: module.audio_tts_url || content.tts_url || '',
    audio_captions_url: content.captions_url || '',
    audio_duration_seconds: module.audio_duration_seconds || content.audio_duration_seconds || 0,
    audio_language: module.audio_language || content.audio_language || 'en-US',
    audio_summary_text: content.summary_text || content.audio_summary || content.summary || '',
  };

  switch (module.module_type) {
    case 'video':
      const savedVideoQuestions =
        content.video_timestamp_questions ||
        content.questions ||
        content.video_questions ||
        [];
      return {
        ...baseForm,
        video_questions: savedVideoQuestions.map((q: any) => ({
          timestamp: typeof q.timestamp === 'number' ? q.timestamp : undefined,
          question: q.question || '',
          type: q.type || 'open_ended',
          stt_enabled: q.stt_enabled || false,
          options: q.options || [],
          correct_option: q.correct_option || '',
          sample_answer: q.sample_answer || '',
          required_keywords: Array.isArray(q.required_keywords) ? q.required_keywords.join(', ') : '',
        })),
      };
    case 'quiz':
      return {
        ...baseForm,
        quiz_questions: (content.questions || []).map((q: any) => ({
          question: q.question || '',
          options: q.options || [],
          correct_option: q.correct_option || '',
        })),
      };
    case 'flashcard':
      return {
        ...baseForm,
        flashcards: (content.cards || []).map((card: any) => ({
          front: card.front || '',
          back: card.back || '',
        })),
      };
    case 'infographic':
      return {
        ...baseForm,
        infographic_questions: (content.questions || []).map((q: any) => ({
          question: q.question || '',
          type: q.type || 'multiple_choice',
          options: q.options || [],
          correct_option: q.correct_option || '',
        })),
      };
    case 'case_study':
      return {
        ...baseForm,
        case_study_content: content.content || '',
        case_study_questions: (content.questions || []).map((q: any) => ({
          question: q.question || '',
          type: q.type || 'open_ended',
          stt_enabled: q.stt_enabled || false,
          options: q.options || [],
          correct_option: q.correct_option || '',
          sample_answer: q.sample_answer || '',
          required_keywords: Array.isArray(q.required_keywords) ? q.required_keywords.join(', ') : '',
        })),
      };
    case 'audio':
      return {
        ...baseForm,
        case_study_content:
          module.audio_transcript ||
          content.transcript_text ||
          content.transcript ||
          content.captions_text ||
          content.content ||
          '',
        case_study_questions: (
          content.questions ||
          content.audio_questions ||
          content.case_study_questions ||
          []
        ).map((q: any) => ({
          question: q.question || '',
          type: q.type || 'open_ended',
          stt_enabled: q.stt_enabled || false,
          options: q.options || [],
          correct_option: q.correct_option || '',
          sample_answer: q.sample_answer || '',
          required_keywords: Array.isArray(q.required_keywords) ? q.required_keywords.join(', ') : '',
        })),
      };
    default:
      return baseForm;
  }
}

export function formatLabel(value?: string | null) {
  if (!value) return 'Not set';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatDate(value?: string | null) {
  if (!value) return 'No date';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
