import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export interface ReportLegendEntry {
  fillColor: string;
  label: string;
  teneur: number | null;
  dose: number | null;
  surf_ha: number;
}

export interface ReportProps {
  parcelleName: string;
  elementLabel: string;
  isSemis: boolean;
  entries: ReportLegendEntry[];
  stats: {
    superficie: number;
    dose_moyenne: number | null;
    teneur_moyenne: number | null;
    nombre_zones: number;
  } | null;
  totalDose: number | null;
  date: string;        // ex: "02 juin 2026"
  year: number;
  mapUri?: string | null;
}

const ReportCard = forwardRef<View, ReportProps>(({
  parcelleName, elementLabel, isSemis, entries, stats, totalDose, date, year, mapUri,
}, ref) => {
  const fmtDose = (v: number) => String(Math.ceil(v));

  return (
    <View ref={ref} style={styles.card} collapsable={false}>

      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>AgriDrone</Text>
          <Text style={styles.appSub}>Cartographie & zonage</Text>
        </View>
        <Text style={styles.date}>{date}</Text>
      </View>

      <View style={styles.divider} />

      {/* ── Infos parcelle ──────────────────────────────────────────── */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Parcelle</Text>
        <Text style={styles.infoValue}>{parcelleName}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Carte</Text>
        <Text style={styles.infoValue}>{elementLabel}</Text>
      </View>

      {/* ── Image carte ─────────────────────────────────────────────── */}
      {mapUri ? (
        <Image source={{ uri: mapUri }} style={styles.mapImg} resizeMode="cover" />
      ) : (
        <View style={[styles.mapImg, styles.mapImgPlaceholder]}>
          <Text style={{ color: '#AAA', fontSize: 11 }}>Carte non disponible</Text>
        </View>
      )}

      <View style={styles.divider} />

      {/* ── Tableau légende ─────────────────────────────────────────── */}
      <View style={styles.tableHeader}>
        <Text style={[styles.thCell, { flex: 1 }]}>Type de sol</Text>
        {!isSemis && <Text style={[styles.thCell, styles.thNum]}>Teneur</Text>}
        <Text style={[styles.thCell, styles.thNum]}>Dose moy.</Text>
        <Text style={[styles.thCell, styles.thNum]}>Surface</Text>
      </View>

      {entries.map((e, i) => (
        <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
          <View style={[styles.swatch, { backgroundColor: e.fillColor }]} />
          <Text style={[styles.tdCell, { flex: 1 }]} numberOfLines={2}>{e.label || '—'}</Text>
          {!isSemis && (
            <Text style={[styles.tdCell, styles.tdNum]}>
              {e.teneur !== null ? String(e.teneur) : '—'}
            </Text>
          )}
          <Text style={[styles.tdCell, styles.tdNum]}>
            {e.dose !== null ? fmtDose(e.dose) : '—'}
          </Text>
          <Text style={[styles.tdCell, styles.tdNum]}>
            {e.surf_ha > 0 ? `${e.surf_ha.toFixed(2)} ha` : '—'}
          </Text>
        </View>
      ))}

      {/* ── Stats ───────────────────────────────────────────────────── */}
      {stats && (
        <>
          <View style={styles.divider} />
          <View style={styles.statsGrid}>
            {stats.superficie > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{stats.superficie.toFixed(2)} ha</Text>
                <Text style={styles.statLbl}>Superficie</Text>
              </View>
            )}
            {stats.nombre_zones > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{stats.nombre_zones}</Text>
                <Text style={styles.statLbl}>Zones</Text>
              </View>
            )}
            {stats.dose_moyenne != null && (
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{Math.ceil(stats.dose_moyenne)}</Text>
                <Text style={styles.statLbl}>Dose moy.</Text>
              </View>
            )}
            {totalDose !== null && (
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{Math.ceil(totalDose)} kg</Text>
                <Text style={styles.statLbl}>À épandre</Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* ── Footer copyright ────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© Agridrone - Ehatech {year}</Text>
      </View>

    </View>
  );
});

export default ReportCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 20,
    width: 360,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  appName:    { fontSize: 20, fontWeight: '800', color: '#2E6B1A', letterSpacing: 0.4 },
  appSub:     { fontSize: 10, color: '#888', marginTop: 1 },
  date:       { fontSize: 11, color: '#555', textAlign: 'right', marginTop: 4 },
  divider:    { height: 1, backgroundColor: '#E0E0E0', marginVertical: 10 },
  infoRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  infoLabel:  { fontSize: 11, color: '#888', fontWeight: '600', width: 65 },
  infoValue:  { fontSize: 12, color: '#222', fontWeight: '700', flex: 1, textAlign: 'right' },

  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, backgroundColor: '#F5F5F5', paddingHorizontal: 4, borderRadius: 4 },
  thCell:      { fontSize: 10, fontWeight: '700', color: '#555' },
  thNum:       { width: 56, textAlign: 'right' },

  tableRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  swatch:      { width: 10, height: 10, borderRadius: 2, marginRight: 6, flexShrink: 0 },
  tdCell:      { fontSize: 11, color: '#333' },
  tdNum:       { width: 56, textAlign: 'right', fontSize: 11, color: '#333' },

  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  statItem:    { alignItems: 'center', backgroundColor: '#F0F7E8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 72 },
  statVal:     { fontSize: 16, fontWeight: '800', color: '#2E6B1A' },
  statLbl:     { fontSize: 9, color: '#666', marginTop: 2 },

  mapImg:             { width: '100%', aspectRatio: 4/3, borderRadius: 6, marginVertical: 10, backgroundColor: '#F0F0F0' },
  mapImgPlaceholder:  { backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  footer:      { marginTop: 14, borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingTop: 8, alignItems: 'center' },
  footerText:  { fontSize: 10, color: '#AAA' },
});
