'use client';

import {
    BarChart3,
    BookOpen,
    ClipboardList,
    FileText,
    Mic,
    Settings,
    UserRound,
    Users
} from 'lucide-react';

export const trainerSidebarItems = (pendingReviews?: number) => [
  // Removed Overview section items
  { label: 'Trainees', icon: <Users size={20} />, href: '/trainer/users', section: 'Workspace' },
  { label: 'Batches', icon: <Users size={20} />, href: '/trainer/batches', section: 'Workspace' },
  { label: 'Learning', icon: <BookOpen size={20} />, href: '/trainer/microlearning', section: 'Workspace' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainer/assessments', section: 'Workspace' },
  { label: 'Simulations', icon: <Mic size={20} />, href: '/trainer/call-simulation', section: 'Workspace' },
  { label: 'Coaching', icon: <FileText size={20} />, href: '/trainer/coaching', badge: pendingReviews, section: 'Workspace' },
  { label: 'Analytics', icon: <BarChart3 size={20} />, href: '/trainer/analytics', section: 'Insights' },
  { label: 'Reports', icon: <ClipboardList size={20} />, href: '/trainer/reports', section: 'Insights' },
  { label: 'Profile', icon: <UserRound size={20} />, href: '/trainer/profile', section: 'Account' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainer/settings', section: 'Account' },
];
