import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ForgotPasswordModal from '../ForgotPasswordModal';

const RESET_URL = 'https://api.agridrone.fr/api/v1/auth/reset-password';

function mockFetch(init: { ok: boolean; status?: number; body?: unknown }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 400),
    json: async () => init.body ?? {},
  }) as unknown as typeof fetch;
}

async function fillForm() {
  await fireEvent.changeText(screen.getByPlaceholderText('Identifiant'), 'jean');
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'jean@ferme.fr');
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // @ts-expect-error nettoyage du mock fetch global
  global.fetch = undefined;
});

describe('ForgotPasswordModal — affichage', () => {
  it('affiche le formulaire de réinitialisation', async () => {
    await render(<ForgotPasswordModal visible onClose={jest.fn()} />);
    expect(screen.getByText('Mot de passe oublié')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Identifiant')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Email')).toBeOnTheScreen();
    expect(screen.getByText('Envoyer')).toBeOnTheScreen();
  });
});

describe('ForgotPasswordModal — validation', () => {
  it('refuse la soumission si un champ est vide', async () => {
    mockFetch({ ok: true });
    await render(<ForgotPasswordModal visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText('Envoyer'));
    expect(screen.getByText('Veuillez remplir tous les champs.')).toBeOnTheScreen();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordModal — soumission', () => {
  it('poste la demande et affiche l’écran de succès', async () => {
    mockFetch({ ok: true });
    await render(<ForgotPasswordModal visible onClose={jest.fn()} />);
    await fillForm();
    await fireEvent.press(screen.getByText('Envoyer'));

    await waitFor(() => expect(screen.getByText(/email de réinitialisation/)).toBeOnTheScreen());
    expect(global.fetch).toHaveBeenCalledWith(RESET_URL, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ login: 'jean', email: 'jean@ferme.fr' }),
    }));
    expect(screen.getByText('Fermer')).toBeOnTheScreen();
  });

  it('affiche le détail d’erreur renvoyé par le backend', async () => {
    mockFetch({ ok: false, status: 404, body: { detail: 'Compte introuvable' } });
    await render(<ForgotPasswordModal visible onClose={jest.fn()} />);
    await fillForm();
    await fireEvent.press(screen.getByText('Envoyer'));

    await waitFor(() => expect(screen.getByText('Compte introuvable')).toBeOnTheScreen());
  });

  it('affiche une erreur générique par statut sans détail', async () => {
    mockFetch({ ok: false, status: 500, body: {} });
    await render(<ForgotPasswordModal visible onClose={jest.fn()} />);
    await fillForm();
    await fireEvent.press(screen.getByText('Envoyer'));

    await waitFor(() => expect(screen.getByText('Erreur 500')).toBeOnTheScreen());
  });
});

describe('ForgotPasswordModal — fermeture', () => {
  it('« Fermer » après succès appelle onClose', async () => {
    mockFetch({ ok: true });
    const onClose = jest.fn();
    await render(<ForgotPasswordModal visible onClose={onClose} />);
    await fillForm();
    await fireEvent.press(screen.getByText('Envoyer'));
    await waitFor(() => expect(screen.getByText('Fermer')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Fermer'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
