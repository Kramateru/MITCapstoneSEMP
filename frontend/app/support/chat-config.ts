export type ChatRole = 'trainee' | 'trainer' | 'admin'

export function isChatRole(value: unknown): value is ChatRole {
  return value === 'trainee' || value === 'trainer' || value === 'admin'
}

export function getChatWelcomeMessage(role: ChatRole | null): string {
  switch (role) {
    case 'trainee':
      return "Hello! I'm St. Peter Buddy. I can help with course access, schedules, assignments, submissions, and progress tracking."
    case 'trainer':
      return "Hello! I'm St. Peter Buddy. I can help with trainee management, grading workflows, content updates, and training reports."
    case 'admin':
      return "Hello! I'm St. Peter Buddy. I can help with user management, system configuration, permissions, analytics, and maintenance."
    default:
      return "Hello! I'm St. Peter Buddy. How can I assist you with the system today?"
  }
}

export function getChatQuickPrompts(role: ChatRole | null): string[] {
  switch (role) {
    case 'trainee':
      return [
        'How do I access my training modules?',
        'Where can I track my progress?',
        'How do I use the speech recognition feature?',
      ]
    case 'trainer':
      return [
        'How do I grade trainees?',
        'Where can I review trainee sessions?',
        'How do I create training modules?',
      ]
    case 'admin':
      return [
        'How do I create user accounts?',
        'Where can I update system settings?',
        'How do I view system-wide reports?',
      ]
    default:
      return ['I am Trainee', 'I am Trainer', 'I am Admin']
  }
}

export function getChatPlaceholder(role: ChatRole | null): string {
  if (!role) {
    return 'Enter your role or ask a system question'
  }
  return 'Ask St. Peter Buddy a question'
}
