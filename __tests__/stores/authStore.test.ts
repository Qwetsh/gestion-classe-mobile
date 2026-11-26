/**
 * authStore.checkAuth : au démarrage, l'écran se décide sur la session enregistrée dans le
 * téléphone ; le serveur n'est consulté qu'en arrière-plan et ne déconnecte que s'il refuse
 * vraiment la session. Les services Supabase sont simulés (la classification des erreurs,
 * elle, est testée sur le vrai client dans __tests__/services/authOffline.test.ts).
 */

jest.mock('../../services/supabase', () => ({
  supabase: { rpc: jest.fn(() => Promise.resolve({ data: null, error: null })) },
  signUp: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getStoredUser: jest.fn(),
  validateSession: jest.fn(),
  clearStoredSession: jest.fn(),
}));

jest.mock('expo-device', () => ({
  modelName: 'Téléphone de test',
  manufacturer: 'Test',
  osName: 'Android',
  osVersion: '16',
}));

import { useAuthStore } from '../../stores/authStore';
import * as services from '../../services/supabase';
import type { SessionCheck } from '../../services/supabase';

const getStoredUser = services.getStoredUser as jest.Mock;
const validateSession = services.validateSession as jest.Mock;
const clearStoredSession = services.clearStoredSession as jest.Mock;
const signIn = services.signIn as jest.Mock;
const rpc = (services.supabase as unknown as { rpc: jest.Mock }).rpc;

const prof = { id: 'user-1', email: 'prof@example.org' };

/** Laisse passer les suites asynchrones lancées sans « await » (vérification d'arrière-plan). */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearStoredSession.mockResolvedValue(undefined);
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: true,
    isInitialized: false,
    user: null,
    error: null,
    sessionRevoked: false,
  });
});

describe('authStore.checkAuth', () => {
  it('aucune session enregistrée : non connecté, le serveur n’est pas consulté', async () => {
    getStoredUser.mockResolvedValue(null);

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      isInitialized: true,
    });
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('session enregistrée : connecté tout de suite, sans attendre un serveur qui ne répond pas', async () => {
    getStoredUser.mockResolvedValue(prof);
    validateSession.mockReturnValue(new Promise<SessionCheck>(() => {})); // ne répond jamais

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: prof,
      isLoading: false,
      isInitialized: true,
      sessionRevoked: false,
    });
    expect(validateSession).toHaveBeenCalledTimes(1);
  });

  it('serveur injoignable (hors ligne, délai dépassé) : on reste connecté', async () => {
    getStoredUser.mockResolvedValue(prof);
    validateSession.mockResolvedValue({ status: 'unreachable' });

    await useAuthStore.getState().checkAuth();
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: prof, sessionRevoked: false });
    expect(clearStoredSession).not.toHaveBeenCalled();
  });

  it('la vérification plante de façon imprévue : on reste connecté', async () => {
    getStoredUser.mockResolvedValue(prof);
    validateSession.mockRejectedValue(new Error('imprévu'));

    await useAuthStore.getState().checkAuth();
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: prof, sessionRevoked: false });
    expect(clearStoredSession).not.toHaveBeenCalled();
  });

  it('la lecture du téléphone plante : non connecté, sans rester bloqué sur le chargement', async () => {
    getStoredUser.mockRejectedValue(new Error('SecureStore'));

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, isLoading: false, isInitialized: true });
  });

  it('le serveur confirme la session : connecté, appareil enregistré', async () => {
    getStoredUser.mockResolvedValue(prof);
    validateSession.mockResolvedValue({ status: 'valid', user: prof });

    await useAuthStore.getState().checkAuth();
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: prof, sessionRevoked: false });
    expect(rpc).toHaveBeenCalledWith('track_user_activity', expect.objectContaining({ p_user_id: 'user-1' }));
    expect(clearStoredSession).not.toHaveBeenCalled();
  });

  it('le serveur refuse la session : déconnecté, session effacée, retour à la connexion demandé', async () => {
    getStoredUser.mockResolvedValue(prof);
    const check = deferred<SessionCheck>();
    validateSession.mockReturnValue(check.promise);

    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    check.resolve({ status: 'revoked' });
    await flush();

    const state = useAuthStore.getState();
    expect(state).toMatchObject({ isAuthenticated: false, user: null, sessionRevoked: true, isLoading: false });
    expect(state.error).toMatch(/Reconnectez-vous/);
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });

  it('refus arrivé après une reconnexion sous un autre compte : ignoré', async () => {
    getStoredUser.mockResolvedValue(prof);
    const check = deferred<SessionCheck>();
    validateSession.mockReturnValue(check.promise);
    await useAuthStore.getState().checkAuth();

    const autre = { id: 'user-2', email: 'collegue@example.org' };
    signIn.mockResolvedValue({ success: true, data: autre });
    await useAuthStore.getState().signIn(autre.email, 'mot-de-passe-de-test');

    check.resolve({ status: 'revoked' });
    await flush();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: autre, sessionRevoked: false });
    expect(clearStoredSession).not.toHaveBeenCalled();
  });
});
