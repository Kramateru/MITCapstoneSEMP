'use client';

import {
    Award,
    BookOpen,
    ClipboardList,
    Home,
    LineChart,
    MessageSquare,
    Mic,
    Settings,
    UserRound
} from 'lucide-react';

export const traineeSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainee/dashboard', section: 'Workspace' },
  { label: 'Modules', icon: <BookOpen size={20} />, href: '/trainee/microlearning', section: 'Learning' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainee/assessment', section: 'Learning' },
  { label: 'Simulations', icon: <Mic size={20} />, href: '/trainee/call-simulation', section: 'Learning' },
  { label: 'Coaching', icon: <MessageSquare size={20} />, href: '/trainee/coaching', section: 'Learning' },
  { label: 'Progress', icon: <LineChart size={20} />, href: '/trainee/progress', section: 'Performance' },
  { label: 'Certificates', icon: <Award size={20} />, href: '/trainee/certificates', section: 'Performance' },
  { label: 'Profile', icon: <UserRound size={20} />, href: '/trainee/profile', section: 'Account' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainee/settings', section: 'Account' },
];
