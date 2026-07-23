import { render, screen } from '@testing-library/react-native';
import { ThemedText } from '../themed-text';
import { Colors } from '@/constants/theme';

describe('ThemedText', () => {
  it('rend son contenu textuel', async () => {
    await render(<ThemedText>Bonjour</ThemedText>);
    expect(screen.getByText('Bonjour')).toBeOnTheScreen();
  });

  it('transmet les props natives (testID, accessibilityRole)', async () => {
    await render(<ThemedText testID="titre" accessibilityRole="header">Titre</ThemedText>);
    const node = screen.getByTestId('titre');
    expect(node).toBeOnTheScreen();
    expect(node.props.accessibilityRole).toBe('header');
  });

  it('applique la couleur de thème par défaut (mode clair)', async () => {
    // Sous jest-expo, useColorScheme renvoie null → thème clair.
    await render(<ThemedText testID="t">X</ThemedText>);
    expect(screen.getByTestId('t')).toHaveStyle({ color: Colors.light.text });
  });

  it('utilise la couleur de thème demandée via themeColor', async () => {
    await render(<ThemedText testID="t" themeColor="textSecondary">X</ThemedText>);
    expect(screen.getByTestId('t')).toHaveStyle({ color: Colors.light.textSecondary });
  });
});
