import { useState } from 'react';

interface ApiState<T> {
  loading: boolean;
  data: T | null;
  error: string | null;
}

interface ExecuteResult<T> {
  data: T | null;
  error: string | null;
}

export function useApi<T>(serviceFn: () => Promise<T>) {
  const [state, setState] = useState<ApiState<T>>({
    loading: false,
    data: null,
    error: null,
  });

  const execute = async (): Promise<ExecuteResult<T>> => {
    setState({ loading: true, data: null, error: null });
    try {
      const data = await serviceFn();
      setState({ loading: false, data, error: null });
      return { data, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Erreur inconnue';
      setState({ loading: false, data: null, error });
      return { data: null, error };
    }
  };

  return { ...state, execute };
}
