'use client';

import {
    Award,
    BookOpen,
    ClipboardList,
    Home,
    LineChart,
    MessageSquare,
    Mic,
    Settings
} from 'lucide-react';

export const traineeSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainee/dashboard', section: 'Workspace' },
  { label: 'Microlearning Hub', icon: <BookOpen size={20} />, href: '/trainee/microlearning', section: 'Learning' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainee/assessment', section: 'Learning' },
  { label: 'Call Simulations', icon: <Mic size={20} />, href: '/trainee/call-simulation', section: 'Learning' },
  { label: 'My Coaching', icon: <MessageSquare size={20} />, href: '/trainee/coaching', section: 'Learning' },
  { label: 'My Progress', icon: <LineChart size={20} />, href: '/trainee/progress', section: 'Performance' },
  { label: 'Certificates', icon: <Award size={20} />, href: '/trainee/certificates', section: 'Performance' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainee/settings', section: 'Account' },
];
