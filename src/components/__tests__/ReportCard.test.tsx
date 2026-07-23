import { render, screen } from '@testing-library/react-native';
import ReportCard, { type ReportProps } from '../ReportCard';

function props(over: Partial<ReportProps> = {}): ReportProps {
  return {
    parcelleName: 'Les Grandes Terres',
    elementLabel: 'Azote',
    isSemis: false,
    doseUnit: 'kg/ha',
    cultureName: null,
    teneurEngrais: null,
    objRendement: null,
    entries: [],
    stats: null,
    totalDose: null,
    date: '23/07/2026',
    year: 2026,
    mapUri: null,
    ...over,
  };
}

describe('ReportCard', () => {
  it('affiche l’en-tête, la parcelle et l’année du footer', async () => {
    await render(<ReportCard {...props({ parcelleName: 'Parcelle X', year: 2026 })} />);
    expect(screen.getByText('AgriDrone')).toBeOnTheScreen();
    expect(screen.getByText('Parcelle X')).toBeOnTheScreen();
    expect(screen.getByText(/© Agridrone - Ehatech 2026/)).toBeOnTheScreen();
  });

  it('affiche le placeholder quand aucune carte n’est fournie', async () => {
    await render(<ReportCard {...props({ mapUri: null })} />);
    expect(screen.getByText('Carte non disponible')).toBeOnTheScreen();
  });

  describe('dose totale (fmtTotal)', () => {
    it('convertit en tonnes au-delà de 1000 kg avec le sous-total en kg', async () => {
      await render(<ReportCard {...props({ doseUnit: 'kg/ha', totalDose: 1234, stats: {
        superficie: 10, dose_moyenne: null, teneur_moyenne: null, nombre_zones: 3,
      } })} />);
      expect(screen.getByText(/1\.23/)).toBeOnTheScreen();      // 1234 / 1000
      expect(screen.getByText('(1234 kg)')).toBeOnTheScreen();  // sous-total arrondi
    });

    it('garde les kg en dessous de 1000', async () => {
      await render(<ReportCard {...props({ doseUnit: 'kg/ha', totalDose: 850, stats: {
        superficie: 10, dose_moyenne: null, teneur_moyenne: null, nombre_zones: 3,
      } })} />);
      expect(screen.getByText(/^850\b/)).toBeOnTheScreen();
    });

    it('convertit les gr/ha en millions de grammes', async () => {
      await render(<ReportCard {...props({ doseUnit: 'gr/ha', totalDose: 2_500_000, stats: {
        superficie: 10, dose_moyenne: null, teneur_moyenne: null, nombre_zones: 3,
      } })} />);
      expect(screen.getByText(/2\.50/)).toBeOnTheScreen();       // 2 500 000 / 1e6
      expect(screen.getByText('M gr')).toBeOnTheScreen();
    });
  });

  describe('tableau des zones', () => {
    it('arrondit la dose au supérieur et formate la surface', async () => {
      await render(<ReportCard {...props({
        entries: [{ fillColor: '#0f0', label: 'Limon', teneur: 45, dose: 120.2, surf_ha: 3.456 }],
      })} />);
      expect(screen.getByText('121')).toBeOnTheScreen();       // ceil(120.2)
      expect(screen.getByText('3.46 ha')).toBeOnTheScreen();   // toFixed(2)
      expect(screen.getByText('Limon')).toBeOnTheScreen();
    });

    it('affiche un tiret pour dose ou surface manquante', async () => {
      await render(<ReportCard {...props({
        entries: [{ fillColor: '#0f0', label: '', teneur: null, dose: null, surf_ha: 0 }],
      })} />);
      // label vide → '—', dose null → '—', surface 0 → '—'
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('semis vs engrais', () => {
    it('en engrais : affiche la note de bas de page sur la teneur', async () => {
      await render(<ReportCard {...props({ isSemis: false, elementLabel: 'Azote' })} />);
      expect(screen.getByText(/Teneur en azote mesurée par analyse de sol/)).toBeOnTheScreen();
    });

    it('en semis : masque la note de bas de page teneur', async () => {
      await render(<ReportCard {...props({ isSemis: true })} />);
      expect(screen.queryByText(/mesurée par analyse de sol/)).toBeNull();
    });
  });
});
