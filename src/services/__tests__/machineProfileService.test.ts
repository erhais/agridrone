import * as SecureStore from 'expo-secure-store';
import {
  deleteProfile,
  getProfiles,
  saveProfile,
  type MachineProfile,
} from '../machineProfileService';

jest.mock('expo-secure-store');

const mockGet = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockSet = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;

function profil(over: Partial<MachineProfile> = {}): MachineProfile {
  return {
    id: 'p1',
    nom: 'Épandeur A',
    mode: 'dosage',
    unite: '%',
    points: [{ dose: 50, valeur: 10 }],
    updatedAt: 1_700_000_000,
    ...over,
  };
}

/** Renseigne le contenu du store pour la lecture. */
function stub(profiles: MachineProfile[] | string | null) {
  const raw = typeof profiles === 'string' || profiles === null ? profiles : JSON.stringify(profiles);
  mockGet.mockResolvedValue(raw);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockResolvedValue(undefined);
});

describe('getProfiles', () => {
  it('renvoie un tableau vide quand le store est vide', async () => {
    stub(null);
    await expect(getProfiles()).resolves.toEqual([]);
  });

  it('renvoie tous les profils sans filtre', async () => {
    stub([profil({ id: 'a', mode: 'dosage' }), profil({ id: 'b', mode: 'vitesse' })]);
    const all = await getProfiles();
    expect(all).toHaveLength(2);
  });

  it('filtre par mode', async () => {
    stub([profil({ id: 'a', mode: 'dosage' }), profil({ id: 'b', mode: 'vitesse' })]);
    const vitesse = await getProfiles('vitesse');
    expect(vitesse).toHaveLength(1);
    expect(vitesse[0].id).toBe('b');
  });

  it('renvoie un tableau vide si le JSON est corrompu (garde-fou)', async () => {
    stub('{ ceci n’est pas du JSON');
    await expect(getProfiles()).resolves.toEqual([]);
  });
});

describe('saveProfile', () => {
  it('ajoute un nouveau profil', async () => {
    stub([profil({ id: 'a' })]);
    await saveProfile(profil({ id: 'b', nom: 'Nouveau' }));
    const written = JSON.parse(mockSet.mock.calls[0][1]) as MachineProfile[];
    expect(written.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('met à jour un profil existant (upsert par id)', async () => {
    stub([profil({ id: 'a', nom: 'Ancien' })]);
    await saveProfile(profil({ id: 'a', nom: 'Modifié' }));
    const written = JSON.parse(mockSet.mock.calls[0][1]) as MachineProfile[];
    expect(written).toHaveLength(1);
    expect(written[0].nom).toBe('Modifié');
  });
});

describe('deleteProfile', () => {
  it('retire le profil ciblé et conserve les autres', async () => {
    stub([profil({ id: 'a' }), profil({ id: 'b' })]);
    await deleteProfile('a');
    const written = JSON.parse(mockSet.mock.calls[0][1]) as MachineProfile[];
    expect(written.map(p => p.id)).toEqual(['b']);
  });

  it('est sans effet si l’id n’existe pas', async () => {
    stub([profil({ id: 'a' })]);
    await deleteProfile('inconnu');
    const written = JSON.parse(mockSet.mock.calls[0][1]) as MachineProfile[];
    expect(written.map(p => p.id)).toEqual(['a']);
  });
});
