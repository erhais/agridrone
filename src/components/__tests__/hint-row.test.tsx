import { render, screen } from '@testing-library/react-native';
import { HintRow } from '../hint-row';

describe('HintRow', () => {
  it('utilise les libellés par défaut', async () => {
    await render(<HintRow />);
    expect(screen.getByText('Try editing')).toBeOnTheScreen();
    expect(screen.getByText('app/index.tsx')).toBeOnTheScreen();
  });

  it('affiche le titre et l’indice fournis', async () => {
    await render(<HintRow title="Astuce" hint="npm test" />);
    expect(screen.getByText('Astuce')).toBeOnTheScreen();
    expect(screen.getByText('npm test')).toBeOnTheScreen();
  });
});
