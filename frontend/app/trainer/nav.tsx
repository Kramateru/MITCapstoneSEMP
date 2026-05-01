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
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainer/dashboard' },
  { label: 'Trainees', icon: <Users size={20} />, href: '/trainer/users' },
  { label: 'Batches', icon: <Users size={20} />, href: '/trainer/batches' },
  { label: 'Microlearning Studio', icon: <BookOpen size={20} />, href: '/trainer/microlearning' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainer/assessments' },
  { label: 'Call Simulation', icon: <Mic size={20} />, href: '/trainer/call-simulation' },
  { label: 'Coaching', icon: <FileText size={20} />, href: '/trainer/coaching', badge: pendingReviews },
  { label: 'Live Analytics', icon: <Activity size={20} />, href: '/trainer/realtime' },
  { label: 'Reports', icon: <BarChart3 size={20} />, href: '/trainer/reports' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainer/settings' },
];
