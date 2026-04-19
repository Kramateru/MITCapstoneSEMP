export type ModuleType = 'video' | 'quiz' | 'flashcard' | 'infographic' | 'case_study';
export type Difficulty = 'basic' | 'intermediate' | 'advanced';
export type FeedbackCategory = 'pronunciation' | 'fluency' | 'grammar' | 'empathy' | 'clarity';
export type AssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'certified';

export interface AssessmentMethod {
  id: string;
  name: string;
  summary: string | null;
}

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
  assessment_method_id: string | null;
}

export interface MicrolearningAssignment {
  id: string;
  title: string;
  module_type: ModuleType;
  topic_category_name: string | null;
  trainee_name: string | null;
  batch_label: string | null;
  status: AssignmentStatus;
  average_score: number;
  is_passed: boolean;
  certificate_id: string | null;
  due_date: string | null;
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
  category: FeedbackCategory;
  module_type: ModuleType;
  duration_minutes: number;
  passing_score: number;
  skill_focus: string;
  content_url: string;
  difficulty: Difficulty;
  assessment_method_id: string;
  topic_category_id: string;
  practice_prompt: string;
  quiz_question: string;
  mastery_prompt: string;
  reflection_prompt: string;
  analysis_prompt: string;
  root_cause_question: string;
  sample_answer: string;
  required_keywords: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  correct_option: 'A' | 'B' | 'C' | '';
  feedback_a: string;
  feedback_b: string;
  feedback_c: string;
  card_front: string;
  card_back: string;
  power_phrases: string;
  wall_phrases: string;
  transcript: string;
}

export interface ModuleTemplatePreset {
  key: string;
  module_type: ModuleType;
  feature_name: string;
  seed_title: string;
  description: string;
  form: ModuleFormState;
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
    category: 'grammar',
    module_type: 'quiz',
    duration_minutes: 5,
    passing_score: 80,
    skill_focus: '',
    content_url: '',
    difficulty: 'basic',
    assessment_method_id: '',
    topic_category_id: '',
    practice_prompt: '',
    quiz_question: '',
    mastery_prompt: '',
    reflection_prompt: '',
    analysis_prompt: '',
    root_cause_question: '',
    sample_answer: '',
    required_keywords: '',
    question: '',
    option_a: '',
    option_b: '',
    option_c: '',
    correct_option: '',
    feedback_a: '',
    feedback_b: '',
    feedback_c: '',
    card_front: '',
    card_back: '',
    power_phrases: '',
    wall_phrases: '',
    transcript: '',
  };
}

function templateForm(overrides: Partial<ModuleFormState>): ModuleFormState {
  return {
    ...emptyModuleForm(),
    ...overrides,
  };
}

export const MODULE_TEMPLATE_PRESETS: ModuleTemplatePreset[] = [
  {
    key: 'heard-technique',
    module_type: 'video',
    feature_name: 'De-escalation Toolkit',
    seed_title: 'HEARD Technique',
    description: 'Video uploader plus a practice prompt for calming upset customers using the HEARD framework.',
    form: templateForm({
      title: 'HEARD Technique',
      description: 'A de-escalation video module that coaches agents to Hear, Empathize, Apologize, Resolve, and Diagnose.',
      category: 'empathy',
      module_type: 'video',
      duration_minutes: 5,
      passing_score: 80,
      skill_focus: 'De-escalation language under pressure',
      difficulty: 'basic',
      practice_prompt:
        "A customer says, 'I have called three times and no one fixed this.' Deliver a calm HEARD-based response.",
      sample_answer:
        'I understand how frustrating this has been, and I am sorry you had to repeat the concern. I will help you now and explain the next step clearly.',
      required_keywords: 'understand\nsorry\nhelp\nnext step',
    }),
  },
  {
    key: 'spot-the-tone',
    module_type: 'quiz',
    feature_name: 'Spot the Tone',
    seed_title: 'Robotic vs. Empathetic Tone',
    description: 'A three-option quiz builder for comparing robotic and empathetic customer replies.',
    form: templateForm({
      title: 'Robotic vs. Empathetic Tone',
      description: 'A tone-comparison quiz that helps trainees identify the safest BPO response.',
      category: 'empathy',
      module_type: 'quiz',
      duration_minutes: 4,
      passing_score: 80,
      skill_focus: 'Tone selection for upset customers',
      difficulty: 'basic',
      quiz_question:
        "The customer says, 'Your app locked me out before payroll.' Which response is best?",
      option_a: 'That is our security process. Please wait for the reset email.',
      option_b: 'I understand how urgent that is. Let me help you regain access as quickly as possible.',
      option_c: 'Calm down. I just need you to follow the instructions.',
      correct_option: 'B',
      feedback_a: 'This sounds procedural and does not acknowledge urgency.',
      feedback_b: 'Correct. It acknowledges the emotion and moves into action.',
      feedback_c: 'This escalates the conversation and sounds dismissive.',
    }),
  },
  {
    key: 'product-flashcards',
    module_type: 'flashcard',
    feature_name: 'Product Flashcards',
    seed_title: 'API/Technical Reset Steps',
    description: 'A markdown-friendly front/back flashcard editor for technical product explanations.',
    form: templateForm({
      title: 'API/Technical Reset Steps',
      description: 'Flashcards for explaining technical reset sequences in a clear customer-facing order.',
      category: 'clarity',
      module_type: 'flashcard',
      duration_minutes: 6,
      passing_score: 75,
      skill_focus: 'Explaining reset steps in the right order',
      difficulty: 'basic',
      card_front: 'How do you reset an API key?',
      card_back:
        '1. Open **Security Settings**.\n2. Choose **API Keys**.\n3. Select **Reset**.\n4. Copy the new key.\n5. Save the change.',
      mastery_prompt: 'Write the customer-facing explanation for resetting the API key.',
      sample_answer:
        'Please open Security Settings, choose API Keys, select Reset, copy the new key, and save the update.',
      required_keywords: 'security settings\nreset\nnew key\nsave',
    }),
  },
  {
    key: 'empathy-challenge',
    module_type: 'infographic',
    feature_name: 'Empathy Challenge',
    seed_title: 'Power Phrases vs. Wall Phrases',
    description: 'An infographic/image uploader with editable power phrases and customer-safe wording.',
    form: templateForm({
      title: 'Power Phrases vs. Wall Phrases',
      description: 'An empathy infographic that helps agents replace blocking language with supportive phrasing.',
      category: 'empathy',
      module_type: 'infographic',
      duration_minutes: 3,
      passing_score: 80,
      skill_focus: 'Replacing policy walls with power phrases',
      difficulty: 'basic',
      power_phrases:
        'I understand why that feels frustrating.\nThank you for your patience while I check this.\nLet us fix this together.',
      wall_phrases:
        'That is just our policy.\nThere is nothing I can do.\nYou should have read the terms.',
      reflection_prompt: 'Rewrite a wall phrase into a power phrase for a delayed refund case.',
      sample_answer:
        'I understand the delay is frustrating, and I will help by checking the refund now and sharing the next step.',
      required_keywords: 'understand\nhelp\nnext step',
    }),
  },
  {
    key: 'what-went-wrong',
    module_type: 'case_study',
    feature_name: 'What Went Wrong?',
    seed_title: '1-Star Review Audio/Transcript Analysis',
    description: 'An audio-supported case study with transcript, analysis field, and root-cause review.',
    form: templateForm({
      title: '1-Star Review Audio/Transcript Analysis',
      description: 'A case study that helps trainees diagnose where trust was lost in a poor interaction.',
      category: 'clarity',
      module_type: 'case_study',
      duration_minutes: 7,
      passing_score: 80,
      skill_focus: 'Root-cause analysis for call handling',
      difficulty: 'intermediate',
      transcript:
        'Customer: I waited twenty minutes and got disconnected twice.\nAgent: You need to hold because the system is slow.\nCustomer: This is ridiculous.',
      root_cause_question: 'What was the main reason the interaction collapsed?',
      analysis_prompt: 'Write the corrective response the agent should have used after the first complaint.',
      option_a: 'The customer refused to cooperate.',
      option_b: 'The agent failed to acknowledge the frustration and used cold language.',
      option_c: 'The system outage automatically caused a 1-star review.',
      correct_option: 'B',
      feedback_a: 'This shifts responsibility away from the coaching opportunity.',
      feedback_b: 'Correct. The agent ignored the emotion and used language that reduced trust.',
      feedback_c: 'System issues matter, but the agent still had a chance to recover the call.',
      sample_answer:
        'I understand the wait has been frustrating, and I am sorry for the repeated disconnection. I will assist you now and explain the next step before we continue.',
      required_keywords: 'understand\nsorry\nassist\nnext step',
    }),
  },
];

export function splitToList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildContentData(form: ModuleFormState) {
  const options = [form.option_a, form.option_b, form.option_c].map((item) => item.trim());
  const correctOption =
    form.correct_option === 'A' ? options[0] : form.correct_option === 'B' ? options[1] : form.correct_option === 'C' ? options[2] : '';

  if (form.module_type === 'video') {
    return {
      asset_url: form.content_url || undefined,
      practice_prompt: form.practice_prompt,
      sample_answer: form.sample_answer,
      required_keywords: splitToList(form.required_keywords),
    };
  }

  if (form.module_type === 'quiz') {
    return {
      questions: [
        {
          title: form.title,
          question: form.quiz_question,
          options: options.filter(Boolean),
          correct_option: correctOption,
          option_feedback: {
            ...(options[0] ? { [options[0]]: form.feedback_a } : {}),
            ...(options[1] ? { [options[1]]: form.feedback_b } : {}),
            ...(options[2] ? { [options[2]]: form.feedback_c } : {}),
          },
        },
      ],
    };
  }

  if (form.module_type === 'flashcard') {
    return {
      cards: [
        {
          front: form.card_front,
          back: form.card_back,
          mastery_prompt: form.mastery_prompt || `Explain the answer for: ${form.card_front}`,
          mastery_answer: form.sample_answer || form.card_back,
          required_keywords: splitToList(form.required_keywords),
        },
      ],
    };
  }

  if (form.module_type === 'infographic') {
    return {
      asset_url: form.content_url || undefined,
      power_phrases: splitToList(form.power_phrases),
      wall_phrases: splitToList(form.wall_phrases),
      reflection_prompt: form.reflection_prompt,
      sample_answer: form.sample_answer,
      required_keywords: splitToList(form.required_keywords),
    };
  }

  return {
    asset_url: form.content_url || undefined,
    transcript: form.transcript,
    analysis_prompt: form.analysis_prompt,
    sample_answer: form.sample_answer,
    required_keywords: splitToList(form.required_keywords),
    root_cause_question: form.root_cause_question,
    root_cause_options: options.filter(Boolean),
    root_cause_answer: correctOption,
    root_cause_feedback: {
      ...(options[0] ? { [options[0]]: form.feedback_a } : {}),
      ...(options[1] ? { [options[1]]: form.feedback_b } : {}),
      ...(options[2] ? { [options[2]]: form.feedback_c } : {}),
    },
  };
}

export function moduleToForm(module: MicrolearningModule): ModuleFormState {
  const form = emptyModuleForm();
  const content = module.content_data || {};
  const question = Array.isArray(content.questions) ? content.questions[0] || {} : {};
  const card = Array.isArray(content.cards) ? content.cards[0] || {} : {};
  const options = Array.isArray(question.options) ? question.options : Array.isArray(content.root_cause_options) ? content.root_cause_options : [];
  const correct = question.correct_option || content.root_cause_answer;
  const feedback = question.option_feedback || content.root_cause_feedback || {};
  const correctOption = options[0] === correct ? 'A' : options[1] === correct ? 'B' : options[2] === correct ? 'C' : '';

  return {
    ...form,
    title: module.title || '',
    description: module.description || '',
    category: module.category || 'grammar',
    module_type: module.module_type || 'quiz',
    duration_minutes: module.duration_minutes || 5,
    passing_score: module.passing_score || 80,
    skill_focus: module.skill_focus || '',
    content_url: module.content_url || content.asset_url || '',
    difficulty: module.difficulty || 'basic',
    assessment_method_id: module.assessment_method_id || '',
    topic_category_id: module.topic_category_id || '',
    practice_prompt: content.practice_prompt || '',
    quiz_question: question.question || '',
    mastery_prompt: card.mastery_prompt || '',
    reflection_prompt: content.reflection_prompt || '',
    analysis_prompt: content.analysis_prompt || '',
    root_cause_question: content.root_cause_question || '',
    sample_answer: content.sample_answer || card.mastery_answer || '',
    required_keywords: (content.required_keywords || card.required_keywords || []).join('\n'),
    question: question.question || content.reflection_prompt || content.analysis_prompt || '',
    option_a: options[0] || '',
    option_b: options[1] || '',
    option_c: options[2] || '',
    correct_option: correctOption,
    feedback_a: feedback[options[0]] || '',
    feedback_b: feedback[options[1]] || '',
    feedback_c: feedback[options[2]] || '',
    card_front: card.front || '',
    card_back: card.back || '',
    power_phrases: (content.power_phrases || []).join('\n'),
    wall_phrases: (content.wall_phrases || []).join('\n'),
    transcript: content.transcript || '',
  };
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
