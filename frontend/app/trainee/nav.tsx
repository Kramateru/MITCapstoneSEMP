'use client';

import {
  Award,
  Home,
  TrendingUp,
  GraduationCap,
  MessageSquare,
  BookOpen,
  Settings,
  ClipboardList,
} from 'lucide-react';

export const traineeSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainee/dashboard' },
  { label: 'Microlearning', icon: <BookOpen size={20} />, href: '/trainee/microlearning' },
  { label: 'My Coaching', icon: <MessageSquare size={20} />, href: '/trainee/coaching' },
  { label: 'Progress', icon: <TrendingUp size={20} />, href: '/trainee/progress' },
  { label: 'My Certificate', icon: <Award size={20} />, href: '/trainee/reports' },
  { label: 'MCQ', icon: <ClipboardList size={20} />, href: '/trainee/mcq' },
  { label: 'Assessment', icon: <GraduationCap size={20} />, href: '/trainee/assessment' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainee/settings' },
];
