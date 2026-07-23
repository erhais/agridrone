import { act, renderHook } from '@testing-library/react-native';
import { useApi } from '../useApi';

describe('useApi', () => {
  it('démarre dans un état vide', async () => {
    const { result } = await renderHook(() => useApi(jest.fn()));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.execute).toBe('function');
  });

  it('renseigne data et renvoie le résultat en cas de succès', async () => {
    const serviceFn = jest.fn().mockResolvedValue({ id: 7 });
    const { result } = await renderHook(() => useApi(serviceFn));

    let ret: { data: unknown; error: string | null } | undefined;
    await act(async () => { ret = await result.current.execute(); });

    expect(serviceFn).toHaveBeenCalledTimes(1);
    expect(ret).toEqual({ data: { id: 7 }, error: null });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: 7 });
    expect(result.current.error).toBeNull();
  });

  it('capture le message d’une Error et le renvoie', async () => {
    const serviceFn = jest.fn().mockRejectedValue(new Error('Échec réseau'));
    const { result } = await renderHook(() => useApi(serviceFn));

    let ret: { data: unknown; error: string | null } | undefined;
    await act(async () => { ret = await result.current.execute(); });

    expect(ret).toEqual({ data: null, error: 'Échec réseau' });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Échec réseau');
  });

  it('utilise un message générique pour un rejet non-Error', async () => {
    const serviceFn = jest.fn().mockRejectedValue('boom');
    const { result } = await renderHook(() => useApi(serviceFn));

    let ret: { data: unknown; error: string | null } | undefined;
    await act(async () => { ret = await result.current.execute(); });

    expect(ret?.error).toBe('Erreur inconnue');
    expect(result.current.error).toBe('Erreur inconnue');
  });

  it('réinitialise l’ancienne donnée au lancement d’un nouvel appel échoué', async () => {
    const serviceFn = jest.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error('deuxième échec'));
    const { result } = await renderHook(() => useApi(serviceFn));

    await act(async () => { await result.current.execute(); });
    expect(result.current.data).toEqual({ id: 1 });

    await act(async () => { await result.current.execute(); });
    expect(result.current.data).toBeNull();          // data effacée
    expect(result.current.error).toBe('deuxième échec');
  });
});
