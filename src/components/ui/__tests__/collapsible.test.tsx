import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Collapsible } from '../collapsible';

describe('Collapsible', () => {
  it('affiche toujours le titre', async () => {
    await render(
      <Collapsible title="Détails">
        <Text>Contenu caché</Text>
      </Collapsible>,
    );
    expect(screen.getByText('Détails')).toBeOnTheScreen();
  });

  it('masque le contenu tant qu’il n’est pas déplié', async () => {
    await render(
      <Collapsible title="Détails">
        <Text>Contenu caché</Text>
      </Collapsible>,
    );
    expect(screen.queryByText('Contenu caché')).toBeNull();
  });

  it('déplie le contenu au clic sur l’en-tête', async () => {
    await render(
      <Collapsible title="Détails">
        <Text>Contenu caché</Text>
      </Collapsible>,
    );
    await fireEvent.press(screen.getByText('Détails'));
    expect(screen.getByText('Contenu caché')).toBeOnTheScreen();
  });

  it('replie le contenu à un second clic', async () => {
    await render(
      <Collapsible title="Détails">
        <Text>Contenu caché</Text>
      </Collapsible>,
    );
    await fireEvent.press(screen.getByText('Détails'));
    expect(screen.getByText('Contenu caché')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Détails'));
    expect(screen.queryByText('Contenu caché')).toBeNull();
  });
});
