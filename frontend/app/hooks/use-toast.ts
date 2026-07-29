'use client';

import { useCallback } from 'react';

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const toast = useCallback((options: ToastOptions) => {
    const message = options.title || options.description || 'Notification';
    if (options.variant === 'destructive') {
      console.error(message);
    } else {
      console.info(message);
    }
  }, []);

  return { toast };
}
