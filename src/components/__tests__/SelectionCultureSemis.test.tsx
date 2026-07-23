import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SelectionCultureSemis from '../SelectionCultureSemis';
import { getCultures } from '../../services/agridroneService';

jest.mock('../../services/agridroneService', () => ({ getCultures: jest.fn() }));

const mockGetCultures = getCultures as jest.MockedFunction<typeof getCultures>;

// Mélange d'ids semis (1,3,14) et non-semis (99) : seuls les semis doivent apparaître.
const CULTURES = [
  { id: 1, nom: 'Blé' },
  { id: 3, nom: 'Betterave' },
  { id: 14, nom: 'Maïs' },
  { id: 99, nom: 'Vigne' }, // hors CULTURES_SEMIS_IDS
];

type Props = React.ComponentProps<typeof SelectionCultureSemis>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    parcelleName: 'Les Grandes Terres',
    initialCultureId: null,
    onClose: jest.fn(),
    onSelect: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCultures.mockResolvedValue(CULTURES);
});

describe('SelectionCultureSemis — affichage', () => {
  it('affiche le titre et la parcelle', async () => {
    await render(<SelectionCultureSemis {...baseProps()} />);
    expect(screen.getByText('Sélection de la culture')).toBeOnTheScreen();
    expect(screen.getByText('Les Grandes Terres')).toBeOnTheScreen();
  });

  it('ne liste que les cultures de semis (filtrage par id) après chargement', async () => {
    await render(<SelectionCultureSemis {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());
    expect(screen.getByText('Blé')).toBeOnTheScreen();
    expect(screen.getByText('Betterave')).toBeOnTheScreen();
    expect(screen.getByText('Maïs')).toBeOnTheScreen();
    expect(screen.queryByText('Vigne')).toBeNull(); // id 99 exclu
  });
});

describe('SelectionCultureSemis — sélection', () => {
  it('présélectionne la culture initiale (coche visible)', async () => {
    await render(<SelectionCultureSemis {...baseProps({ initialCultureId: 3 })} />);
    await waitFor(() => expect(screen.getByText('Betterave')).toBeOnTheScreen());
    expect(screen.getByText('✓')).toBeOnTheScreen();
  });

  it('sélectionne une culture puis confirme via onSelect', async () => {
    const onSelect = jest.fn();
    await render(<SelectionCultureSemis {...baseProps({ onSelect })} />);
    await waitFor(() => expect(screen.getByText('Blé')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Blé'));
    await fireEvent.press(screen.getByText('Valider'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ id: 1, nom: 'Blé' }));
  });

  it('« Valider » est sans effet quand aucune culture n’est sélectionnée', async () => {
    const onSelect = jest.fn();
    await render(<SelectionCultureSemis {...baseProps({ initialCultureId: null, onSelect })} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.press(screen.getByText('Valider'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
