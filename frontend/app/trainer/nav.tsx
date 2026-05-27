'use client';

import {
    Activity,
    BarChart3,
    BookOpen,
    ClipboardList,
    FileText,
    Home,
    Mic,
    Settings,
    Users
} from 'lucide-react';

export const trainerSidebarItems = (pendingReviews?: number) => [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainer/dashboard', section: 'Overview' },
  { label: 'Live Feed', icon: <Activity size={20} />, href: '/trainer/realtime', section: 'Overview' },
  { label: 'Reports', icon: <BarChart3 size={20} />, href: '/trainer/reports', section: 'Overview' },
  { label: 'Trainees', icon: <Users size={20} />, href: '/trainer/users', section: 'Workspace' },
  { label: 'Batches', icon: <Users size={20} />, href: '/trainer/batches', section: 'Workspace' },
  { label: 'Learning', icon: <BookOpen size={20} />, href: '/trainer/microlearning', section: 'Workspace' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainer/assessments', section: 'Workspace' },
  { label: 'Simulations', icon: <Mic size={20} />, href: '/trainer/call-simulation', section: 'Workspace' },
  { label: 'Coaching', icon: <FileText size={20} />, href: '/trainer/coaching', badge: pendingReviews, section: 'Workspace' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainer/settings', section: 'Account' },
];
