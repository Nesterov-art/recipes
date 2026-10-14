import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

type ToastNotice = { id: number; message: string };

type ToastContextValue = {
  notice: ToastNotice | null;
  showToast: (message: string) => void;
  clearToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const showToast = useCallback((message: string) => {
    setNotice({ id: Date.now(), message });
  }, []);
  const clearToast = useCallback(() => setNotice(null), []);
  const value = useMemo(() => ({ notice, showToast, clearToast }), [clearToast, notice, showToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
