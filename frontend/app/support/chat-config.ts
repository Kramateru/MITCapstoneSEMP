export type ChatRole = 'trainee' | 'trainer' | 'admin'

export function isChatRole(value: unknown): value is ChatRole {
  return value === 'trainee' || value === 'trainer' || value === 'admin'
}

export function getChatWelcomeMessage(role: ChatRole | null): string {
  switch (role) {
    case 'trainee':
      return "Hello. I am St. Peter Buddy. I can help with learning modules, basic St. Peter plan FAQs, and platform navigation."
    case 'trainer':
      return "Hello. I am St. Peter Buddy. I can help with coaching guidance, routing procedures, performance support, and training workflows."
    case 'admin':
      return "Hello. I am St. Peter Buddy. I can help with routing oversight, system health guidance, and sensitive operational summaries."
    default:
      return "Hello. I am St. Peter Buddy. Ask about St. Peter plan routing, learning support, or Speech Enabled BPO Platform issues."
  }
}

export function getChatQuickPrompts(role: ChatRole | null): string[] {
  switch (role) {
    case 'trainee':
      return [
        'Where do I open my learning modules?',
        'Which questions should be routed to Sales?',
        'How do I report a platform issue?',
      ]
    case 'trainer':
      return [
        'Which requests go to Customer Accounts?',
        'How should I coach trainees on claims routing?',
        'Where can I review trainee performance?',
      ]
    case 'admin':
      return [
        'What should be tagged to Claims?',
        'How do I review routing oversight?',
        'What system issues should go to IT Support?',
      ]
    default:
      return ['I am Trainee', 'I am Trainer', 'I am Admin']
  }
}

export function getChatPlaceholder(role: ChatRole | null): string {
  if (!role) {
    return 'Enter your role or ask a routing question'
  }
  return 'Ask St. Peter Buddy about plans, routing, or platform support'
}
