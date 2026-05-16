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
  { label: 'Live Analytics', icon: <Activity size={20} />, href: '/trainer/realtime', section: 'Overview' },
  { label: 'Reports', icon: <BarChart3 size={20} />, href: '/trainer/reports', section: 'Overview' },
  { label: 'Trainees', icon: <Users size={20} />, href: '/trainer/users', section: 'Delivery' },
  { label: 'Batches', icon: <Users size={20} />, href: '/trainer/batches', section: 'Delivery' },
  { label: 'Microlearning Studio', icon: <BookOpen size={20} />, href: '/trainer/microlearning', section: 'Delivery' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainer/assessments', section: 'Delivery' },
  { label: 'Call Simulation', icon: <Mic size={20} />, href: '/trainer/call-simulation', section: 'Delivery' },
  { label: 'Coaching', icon: <FileText size={20} />, href: '/trainer/coaching', badge: pendingReviews, section: 'Delivery' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainer/settings', section: 'Account' },
];
