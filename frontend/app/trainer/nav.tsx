'use client';

import {
    Activity,
    BarChart3,
    BookOpen,
    BookOpenCheck,
    Brain,
    ClipboardCheck,
    FileText,
    Home,
    Settings,
    Users,
} from 'lucide-react';

export const trainerSidebarItems = (pendingReviews?: number) => [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainer/dashboard' },
  { label: 'Workspace', icon: <Brain size={20} />, href: '/trainer/workspace' },
  { label: 'Batches', icon: <Users size={20} />, href: '/trainer/batches' },
  { label: 'Trainees', icon: <Users size={20} />, href: '/trainer/users' },
  { label: 'Microlearning', icon: <BookOpen size={20} />, href: '/trainer/courses' },
  { label: 'Grading', icon: <ClipboardCheck size={20} />, href: '/trainer/grading' },
  { label: 'MCQ', icon: <BookOpenCheck size={20} />, href: '/trainer/mcq' },
  { label: 'Coaching', icon: <FileText size={20} />, href: '/trainer/coaching', badge: pendingReviews },
  { label: 'Live Analytics', icon: <Activity size={20} />, href: '/trainer/realtime' },
  { label: 'Report', icon: <BarChart3 size={20} />, href: '/trainer/reports' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainer/settings' },
];
