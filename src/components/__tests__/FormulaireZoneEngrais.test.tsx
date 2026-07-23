import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FormulaireZoneEngrais from '../FormulaireZoneEngrais';
import { ApiError } from '../../services/api';

// Le Picker n'est monté que pour un éditeur sur sol indéterminé ; on le neutralise.
jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const Picker = ({ children }: { children?: React.ReactNode }) => React.createElement('picker', null, children);
  Picker.Item = () => null;
  return { Picker };
});

type Props = React.ComponentProps<typeof FormulaireZoneEngrais>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    zone: {
      id: 'z1',
      num_zone: 1,
      properties: {
        label: 'Limon',
        teneur: 45,
        surface: 3.2,
        dose: 120,
        element: 'P',
        id_class: 1,
        ph: 6.8,
        rendement: 70,
      },
      style: { fillColor: '#8BC34A' },
    },
    parcelle: { id: 10, nom: 'Les Grandes Terres' },
    rendementGlobal: 75,
    initialDetail: null,
    allowDosageManuel: true,
    allowRendementSpec: true,
    isEditeur: false,
    typeSols: [],
    onClose: jest.fn(),
    onSave: jest.fn().mockResolvedValue(undefined),
    onRecopie: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('FormulaireZoneEngrais — affichage initial', () => {
  it('affiche l’en-tête zone/élément et le nom de parcelle', async () => {
    await render(<FormulaireZoneEngrais {...baseProps()} />);
    // id_class=1 → lettre A ; element P → Phosphore
    expect(screen.getByText('ZONE A — Phosphore')).toBeOnTheScreen();
    expect(screen.getByText('Les Grandes Terres')).toBeOnTheScreen();
  });

  it('affiche teneur, pH et surface issus des propriétés', async () => {
    await render(<FormulaireZoneEngrais {...baseProps()} />);
    expect(screen.getByText('45')).toBeOnTheScreen();     // teneur
    expect(screen.getByText('6.8')).toBeOnTheScreen();    // pH
    expect(screen.getByText('3.2 ha')).toBeOnTheScreen(); // surface
  });

  it('privilégie les valeurs de initialDetail sur celles des propriétés', async () => {
    await render(
      <FormulaireZoneEngrais
        {...baseProps({
          initialDetail: {
            num_parcel: 10, fertilisant: 'P', id_sol: null, nom_sol: null,
            teneur: 99, rendement: null, perso_rendement: 0, ph: 5.5,
            dose: null, perso_dose: 0,
          },
        })}
      />,
    );
    expect(screen.getByText('99')).toBeOnTheScreen();   // teneur du détail
    expect(screen.getByText('5.5')).toBeOnTheScreen();  // pH du détail
  });
});

describe('FormulaireZoneEngrais — personnalisation du rendement', () => {
  it('le champ rendement est non éditable par défaut et affiche le rendement global', async () => {
    await render(<FormulaireZoneEngrais {...baseProps()} />);
    const input = screen.getByPlaceholderText('Préciser le rendement');
    expect(input.props.editable).toBe(false);
    expect(input.props.value).toBe('75'); // rendementGlobal
  });

  it('cocher « Personnaliser le rendement » rend le champ éditable', async () => {
    await render(<FormulaireZoneEngrais {...baseProps()} />);
    await fireEvent.press(screen.getByText('Personnaliser le rendement'));
    expect(screen.getByPlaceholderText('Préciser le rendement').props.editable).toBe(true);
  });

  it('refuse la personnalisation et alerte si allowRendementSpec=false', async () => {
    await render(<FormulaireZoneEngrais {...baseProps({ allowRendementSpec: false })} />);
    await fireEvent.press(screen.getByText('Personnaliser le rendement'));
    expect(Alert.alert).toHaveBeenCalledWith('Non autorisé', expect.any(String));
    expect(screen.getByPlaceholderText('Préciser le rendement').props.editable).toBe(false);
  });
});

describe('FormulaireZoneEngrais — personnalisation de la dose', () => {
  it('refuse la personnalisation et alerte si allowDosageManuel=false', async () => {
    await render(<FormulaireZoneEngrais {...baseProps({ allowDosageManuel: false })} />);
    await fireEvent.press(screen.getByText('Personnaliser la dose'));
    expect(Alert.alert).toHaveBeenCalledWith('Non autorisé', expect.any(String));
    expect(screen.getByPlaceholderText('Préciser la dose').props.editable).toBe(false);
  });

  it('permet la saisie d’une dose après activation', async () => {
    await render(<FormulaireZoneEngrais {...baseProps()} />);
    await fireEvent.press(screen.getByText('Personnaliser la dose'));
    await fireEvent.changeText(screen.getByPlaceholderText('Préciser la dose'), '135');
    // Re-query : la référence d'élément est un instantané figé au moment de la requête.
    expect(screen.getByPlaceholderText('Préciser la dose').props.value).toBe('135');
  });
});

describe('FormulaireZoneEngrais — enregistrement', () => {
  it('appelle onSave avec la charge utile attendue', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireZoneEngrais {...baseProps({ onSave })} />);

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        num_zone: 1,
        teneur: 45,
        rendement: 75,
        perso_rendement: false,
        ph: 6.8,
        dose: 120,
        perso_dose: false,
      }),
    );
  });

  it('inclut la dose personnalisée saisie dans la charge utile', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireZoneEngrais {...baseProps({ onSave })} />);

    await fireEvent.press(screen.getByText('Personnaliser la dose'));
    await fireEvent.changeText(screen.getByPlaceholderText('Préciser la dose'), '135');
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dose: 135, perso_dose: true }));
  });

  it('affiche une alerte si onSave rejette avec une ApiError', async () => {
    const onSave = jest.fn().mockRejectedValue(new ApiError(500, '500 — serveur indisponible'));
    await render(<FormulaireZoneEngrais {...baseProps({ onSave })} />);

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur', '500 — serveur indisponible'));
  });
});
