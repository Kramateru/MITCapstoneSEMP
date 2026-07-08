import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useSessionValidation() {
  const router = useRouter();
  useEffect(() => {
    const validate = async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (!res.ok) {
          router.replace('/login');
        }
      } catch {
        router.replace('/login');
      }
    };
    validate();
  }, [router]);
}
