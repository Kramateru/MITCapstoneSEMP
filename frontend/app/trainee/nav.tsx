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
} from 'lucide-react';

export const traineeSidebarItems = [
  { label: 'Dashboard', icon: <Home size={20} />, href: '/trainee/dashboard' },
  { label: 'Microlearning', icon: <BookOpen size={20} />, href: '/trainee/microlearning' },
  { label: 'Sim Floor', icon: <Mic size={20} />, href: '/trainee/sim-floor' },
  { label: 'Assessments', icon: <ClipboardList size={20} />, href: '/trainee/assessment' },
  { label: 'My Coaching', icon: <MessageSquare size={20} />, href: '/trainee/coaching' },
  { label: 'My Progress', icon: <LineChart size={20} />, href: '/trainee/progress' },
  { label: 'Certificates', icon: <Award size={20} />, href: '/trainee/certificates' },
  { label: 'Settings', icon: <Settings size={20} />, href: '/trainee/settings' },
];
