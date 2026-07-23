import { render, screen } from '@testing-library/react-native';
import { ZoneDoseBubble, type ZoneBubbleInfo } from '../ZoneDoseBubble';

// NB : dans React Native Testing Library 14, `render` est asynchrone → `await`.

function info(over: Partial<ZoneBubbleInfo> = {}): ZoneBubbleInfo {
  return {
    fillColor: '#00FF00',
    dose: 120,
    unite: 'kg/ha',
    settingLabel: null,
    speedGuidance: null,
    nextZone: null,
    ...over,
  };
}

describe('ZoneDoseBubble', () => {
  it('ne rend rien quand info est null', async () => {
    await render(<ZoneDoseBubble info={null} topOffset={0} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('affiche la dose et son unité sans calibration', async () => {
    await render(<ZoneDoseBubble info={info({ dose: 120, unite: 'kg/ha' })} topOffset={0} />);
    expect(screen.getByText('120 kg/ha')).toBeOnTheScreen();
  });

  it('affiche un tiret quand la dose est absente', async () => {
    await render(<ZoneDoseBubble info={info({ dose: null })} topOffset={0} />);
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('affiche le réglage machine + la dose en sous-texte quand calibré', async () => {
    await render(<ZoneDoseBubble info={info({ settingLabel: '7.5 km/h', dose: 120, unite: 'kg/ha' })} topOffset={0} />);
    expect(screen.getByText('7.5 km/h')).toBeOnTheScreen();
    expect(screen.getByText('120 kg/ha')).toBeOnTheScreen();
  });

  describe('guidage vitesse', () => {
    const speed = (over: Partial<NonNullable<ZoneBubbleInfo['speedGuidance']>>) => info({
      speedGuidance: {
        targetKmh: 8,
        currentKmh: 7.25,
        direction: 'ok',
        deltaKmh: 0,
        color: '#4CAF50',
        ...over,
      },
    });

    it('affiche la vitesse courante et une coche quand direction=ok', async () => {
      await render(<ZoneDoseBubble info={speed({ direction: 'ok', currentKmh: 7.25 })} topOffset={0} />);
      expect(screen.getByText('7.3 km/h')).toBeOnTheScreen();
      expect(screen.getByText('✓')).toBeOnTheScreen();
    });

    it('invite à ralentir', async () => {
      await render(<ZoneDoseBubble info={speed({ direction: 'decelerate' })} topOffset={0} />);
      expect(screen.getByText('↓ Ralentissez')).toBeOnTheScreen();
    });

    it('invite à accélérer', async () => {
      await render(<ZoneDoseBubble info={speed({ direction: 'accelerate' })} topOffset={0} />);
      expect(screen.getByText('↑ Accélérez')).toBeOnTheScreen();
    });

    it('affiche l’alerte de fermeture de vanne', async () => {
      await render(<ZoneDoseBubble info={speed({ direction: 'closed' })} topOffset={0} />);
      expect(screen.getByText('🚫 Fermer la vanne')).toBeOnTheScreen();
    });

    it('affiche l’alerte dose hors plage', async () => {
      await render(<ZoneDoseBubble info={speed({ direction: 'out_of_range' })} topOffset={0} />);
      expect(screen.getByText('⚠ Dose hors plage')).toBeOnTheScreen();
    });
  });

  describe('zone suivante', () => {
    it('affiche direction, distance arrondie et dose de la zone suivante', async () => {
      await render(
        <ZoneDoseBubble
          info={info({
            unite: 'kg/ha',
            nextZone: {
              direction: 'NE',
              distanceM: 8.6,
              dose: 150,
              fillColor: '#FF0000',
              settingLabel: null,
            },
          })}
          topOffset={0}
        />,
      );
      expect(screen.getByText('→ NE')).toBeOnTheScreen();
      // Distance arrondie (9) et dose concaténées dans le même Text.
      expect(screen.getByText(/9 m/)).toHaveTextContent(/150 kg\/ha/);
    });

    it('privilégie le settingLabel de la zone suivante s’il existe', async () => {
      await render(
        <ZoneDoseBubble
          info={info({
            nextZone: {
              direction: 'S',
              distanceM: 5,
              dose: 150,
              fillColor: '#FF0000',
              settingLabel: '6.0 km/h',
            },
          })}
          topOffset={0}
        />,
      );
      expect(screen.getByText(/5 m/)).toHaveTextContent(/6\.0 km\/h/);
    });
  });
});
