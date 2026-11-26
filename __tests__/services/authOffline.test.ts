/**
 * Démarrage à froid sans réseau.
 *
 * Au lancement, l'app doit savoir « connecté ou non » sans le serveur : sinon, en classe sans
 * Wi-Fi, l'enseignant retombe sur l'écran de connexion et n'a plus son menu radial.
 * Ces tests font tourner le VRAI client supabase-js (seuls le SecureStore et fetch sont
 * simulés) pour verrouiller trois choses :
 *  - la session se relit dans le SecureStore sans aucun appel réseau, jeton expiré compris ;
 *  - seule une vraie réponse « refusé » du serveur compte comme session révoquée ;
 *  - la clé de rangement donnée au client est bien celle que supabase-js utilisait déjà
 *    (sinon la mise à jour déconnecterait tout le monde).
 */

import * as SecureStore from 'expo-secure-store';
import {
  createClient,
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js';
import { supabase, AUTH_STORAGE_KEY } from '../../services/supabase/client';
import {
  parseStoredUser,
  classifyAuthError,
  getStoredUser,
  validateSession,
  clearStoredSession,
  signOut,
} from '../../services/supabase/auth';

const store = SecureStore as jest.Mocked<typeof SecureStore>;
const fetchMock = jest.fn();
const realFetch = global.fetch;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Une session telle que supabase-js la range (JSON) dans le SecureStore. */
function storedSession(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: 'jeton-acces',
    refresh_token: 'jeton-rafraichissement',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSeconds() + 3600,
    user: { id: 'user-1', email: 'prof@example.org', aud: 'authenticated' },
    ...over,
  });
}

/**
 * Le SecureStore du téléphone, en mémoire. Il doit vraiment effacer ce qu'on lui demande
 * d'effacer : quand supabase-js retire une session refusée, il la relit aussitôt, et un
 * faux magasin qui la rendrait encore le ferait tourner en rond.
 */
const phone = new Map<string, string>();

function plugPhone() {
  store.getItemAsync.mockImplementation(async (key: string) => phone.get(key) ?? null);
  store.setItemAsync.mockImplementation(async (key: string, value: string) => {
    phone.set(key, value);
  });
  store.deleteItemAsync.mockImplementation(async (key: string) => {
    phone.delete(key);
  });
}

/** Ce que contient le téléphone au début du test. */
function givenStored(raw: string | null) {
  phone.clear();
  if (raw !== null) phone.set(AUTH_STORAGE_KEY, raw);
}

const offline = () => fetchMock.mockRejectedValue(new TypeError('Network request failed'));

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeAll(async () => {
  // supabase-js journalise lui-même chaque échec réseau : sans intérêt ici
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  (global as { fetch: unknown }).fetch = fetchMock;
  // Laisse le client finir son initialisation (téléphone vide) avant les tests
  plugPhone();
  givenStored(null);
  await supabase!.auth.getSession();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

afterAll(() => {
  jest.restoreAllMocks();
  (global as { fetch: unknown }).fetch = realFetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  store.getItemAsync.mockClear();
  store.deleteItemAsync.mockClear();
  store.setItemAsync.mockClear();
  givenStored(null);
});

describe('clé de rangement de la session', () => {
  it('est celle que supabase-js choisit tout seul (les sessions existantes restent lisibles)', () => {
    const url = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
    const defaultClient = createClient(url, 'cle-de-test', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const defaultKey = (defaultClient.auth as unknown as { storageKey: string }).storageKey;

    expect(AUTH_STORAGE_KEY).toBe(defaultKey);
    expect((supabase!.auth as unknown as { storageKey: string }).storageKey).toBe(defaultKey);
  });
});

describe('parseStoredUser', () => {
  it('rend l’utilisateur de la session enregistrée', () => {
    expect(parseStoredUser(storedSession())).toEqual({ id: 'user-1', email: 'prof@example.org' });
  });

  it('ne tient pas compte de l’expiration du jeton d’accès', () => {
    expect(parseStoredUser(storedSession({ expires_at: nowSeconds() - 86400 }))).toEqual({
      id: 'user-1',
      email: 'prof@example.org',
    });
  });

  it('rend null s’il n’y a rien, ou rien d’exploitable', () => {
    expect(parseStoredUser(null)).toBeNull();
    expect(parseStoredUser('')).toBeNull();
    expect(parseStoredUser('pas du json')).toBeNull();
    expect(parseStoredUser('"une chaine"')).toBeNull();
    expect(parseStoredUser(storedSession({ refresh_token: '' }))).toBeNull();
    expect(parseStoredUser(storedSession({ access_token: undefined }))).toBeNull();
    expect(parseStoredUser(storedSession({ user: null }))).toBeNull();
    expect(parseStoredUser(storedSession({ user: { email: 'sans-id@example.org' } }))).toBeNull();
  });
});

describe('getStoredUser (décision du démarrage)', () => {
  it('sans réseau et jeton expiré depuis hier : connecté, sans un seul appel réseau', async () => {
    givenStored(storedSession({ expires_at: nowSeconds() - 86400 }));
    offline();

    await expect(getStoredUser()).resolves.toEqual({ id: 'user-1', email: 'prof@example.org' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getItemAsync).toHaveBeenCalledWith(AUTH_STORAGE_KEY);
    expect(phone.has(AUTH_STORAGE_KEY)).toBe(true);
  });

  it('téléphone sans session : non connecté', async () => {
    await expect(getStoredUser()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('classifyAuthError', () => {
  it('réseau, délai, serveur en panne, erreur inconnue : injoignable (on reste connecté)', () => {
    expect(classifyAuthError(new AuthRetryableFetchError('Network request failed', 0))).toBe('unreachable');
    expect(classifyAuthError(new AuthRetryableFetchError('Bad Gateway', 502))).toBe('unreachable');
    expect(classifyAuthError(new AuthApiError('Too many requests', 429, 'over_request_rate_limit'))).toBe('unreachable');
    expect(classifyAuthError(new AuthApiError('Internal error', 500, 'unexpected_failure'))).toBe('unreachable');
    expect(classifyAuthError(new AuthUnknownError('réponse illisible', new Error('html')))).toBe('unreachable');
    expect(classifyAuthError(new TypeError('Network request failed'))).toBe('unreachable');
    expect(classifyAuthError(undefined)).toBe('unreachable');
  });

  it('refus du serveur : session révoquée', () => {
    expect(classifyAuthError(new AuthSessionMissingError())).toBe('revoked');
    expect(classifyAuthError(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'))).toBe('revoked');
    expect(classifyAuthError(new AuthApiError('invalid JWT', 401, 'bad_jwt'))).toBe('revoked');
    expect(classifyAuthError(new AuthApiError('User not found', 403, 'user_not_found'))).toBe('revoked');
    expect(classifyAuthError(new AuthApiError('User not found', 404, 'user_not_found'))).toBe('revoked');
  });
});

describe('validateSession (vérification d’arrière-plan, vrai client supabase-js)', () => {
  it('réseau coupé : injoignable, et la session reste dans le téléphone', async () => {
    givenStored(storedSession());
    offline();

    await expect(validateSession()).resolves.toEqual({ status: 'unreachable' });
    expect(fetchMock).toHaveBeenCalled();
    expect(phone.has(AUTH_STORAGE_KEY)).toBe(true);
  });

  it('serveur en panne (503) : injoignable', async () => {
    givenStored(storedSession());
    fetchMock.mockImplementation(async () => new Response('Service Unavailable', { status: 503 }));

    await expect(validateSession()).resolves.toEqual({ status: 'unreachable' });
    expect(phone.has(AUTH_STORAGE_KEY)).toBe(true);
  });

  it('portail captif qui répond une page HTML : injoignable', async () => {
    givenStored(storedSession());
    fetchMock.mockImplementation(
      async () => new Response('<html>Connectez-vous au Wi-Fi</html>', { status: 200 })
    );
    await expect(validateSession()).resolves.toEqual({ status: 'unreachable' });

    fetchMock.mockImplementation(async () => new Response('<html>Accès refusé</html>', { status: 403 }));
    await expect(validateSession()).resolves.toEqual({ status: 'unreachable' });
    expect(phone.has(AUTH_STORAGE_KEY)).toBe(true);
  });

  it('le serveur reconnaît l’utilisateur : valide', async () => {
    givenStored(storedSession());
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { id: 'user-1', email: 'prof@example.org', aud: 'authenticated' })
    );

    await expect(validateSession()).resolves.toEqual({
      status: 'valid',
      user: { id: 'user-1', email: 'prof@example.org' },
    });
  });

  it('utilisateur supprimé (403) : révoquée', async () => {
    givenStored(storedSession());
    fetchMock.mockImplementation(async () =>
      jsonResponse(403, { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' })
    );

    await expect(validateSession()).resolves.toEqual({ status: 'revoked' });
  });

  it('session fermée côté serveur (session_not_found) : révoquée', async () => {
    givenStored(storedSession());
    fetchMock.mockImplementation(async () =>
      jsonResponse(403, { code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' })
    );

    await expect(validateSession()).resolves.toEqual({ status: 'revoked' });
  });

  it('jeton expiré et jeton de rafraîchissement refusé : révoquée', async () => {
    givenStored(storedSession({ expires_at: nowSeconds() - 86400 }));
    fetchMock.mockImplementation(async () =>
      jsonResponse(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' })
    );

    await expect(validateSession()).resolves.toEqual({ status: 'revoked' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/token?grant_type=refresh_token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('déconnexion', () => {
  it('clearStoredSession efface la session du téléphone sans réseau', async () => {
    givenStored(storedSession());
    await clearStoredSession();
    expect(phone.has(AUTH_STORAGE_KEY)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hors ligne, la déconnexion efface quand même la session enregistrée', async () => {
    givenStored(storedSession());
    offline();

    const result = await signOut();

    expect(result.success).toBe(false);
    expect(phone.has(AUTH_STORAGE_KEY)).toBe(false);
    await expect(getStoredUser()).resolves.toBeNull();
  });
});
