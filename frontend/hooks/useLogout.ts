import { useRouter } from 'next/router';

export function useLogout() {
  const router = useRouter();

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error('Logout request failed:', e);
    }
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('authToken');
    document.cookie = 'authToken=; Max-Age=0; path=/;';
    router.replace('/login');
  };

  return logout;
}
