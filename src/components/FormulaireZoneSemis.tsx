import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { ApiError } from '../services/api';
import {
  getPierreReferentiel,
  getPierreCoef,
  patchZoneSemis,
  type PierreReferentielItem,
} from '../services/agridroneService';

const { height: SCREEN_H } = require('react-native').Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.9;

// ── Slider taux de pierre 0→60% ───────────────────────────────────────────────

const SLIDER_MAX = 60;
const THUMB_SZ   = 24;

function SliderTxPierre({ value, onChange }: {
  value: number; onChange: (v: number) => void;
}) {
  const trackWRef   = useRef(0);
  const valueRef    = useRef(value);
  const onChangeRef = useRef(onChange);
  const posRef      = useRef(0);
  const [trackW, setTrackW] = useState(0);

  useEffect(() => { valueRef.current   = value;    }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const xFromVal = (v: number, tw: number) =>
    tw > THUMB_SZ ? (v / SLIDER_MAX) * (tw - THUMB_SZ) : 0;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      posRef.current = xFromVal(valueRef.current, trackWRef.current);
    },
    onPanResponderMove: (_, gs) => {
      const tw  = trackWRef.current;
      const newX = Math.max(0, Math.min(tw - THUMB_SZ, posRef.current + gs.dx));
      const newV = Math.round((newX / (tw - THUMB_SZ)) * SLIDER_MAX);
      onChangeRef.current(newV);
    },
    onPanResponderRelease: (_, gs) => {
      posRef.current = Math.max(0, Math.min(
        trackWRef.current - THUMB_SZ, posRef.current + gs.dx,
      ));
    },
  })).current;

  const thumbX    = xFromVal(value, trackW);
  const fillColor = '#3B6D11';

  return (
    <View style={slStyles.wrapper}>
      <Text style={slStyles.valueLabel}>{value} %</Text>
      <View
        style={slStyles.track}
        onLayout={e => {
          trackWRef.current = e.nativeEvent.layout.width;
          setTrackW(e.nativeEvent.layout.width);
        }}>
        <View style={[slStyles.fill, { width: thumbX + THUMB_SZ / 2, backgroundColor: fillColor }]} />
        <View {...panResponder.panHandlers}
          style={[slStyles.thumb, { left: thumbX, borderColor: fillColor }]} />
      </View>
      <View style={slStyles.labelsRow}>
        <Text style={slStyles.trackLabel}>0 %</Text>
        <Text style={slStyles.trackLabel}>30 %</Text>
        <Text style={slStyles.trackLabel}>60 %</Text>
      </View>
    </View>
  );
}

const slStyles = StyleSheet.create({
  wrapper:    { paddingVertical: 4 },
  valueLabel: { textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#3B6D11', marginBottom: 6 },
  track: {
    height: 6, backgroundColor: '#E0E0E0', borderRadius: 3,
    marginHorizontal: 12, position: 'relative',
  },
  fill:  { position: 'absolute', height: 6, borderRadius: 3, top: 0, left: 0 },
  thumb: {
    position: 'absolute', width: THUMB_SZ, height: THUMB_SZ,
    borderRadius: THUMB_SZ / 2, backgroundColor: '#fff',
    borderWidth: 2.5, top: -(THUMB_SZ / 2) + 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  labelsRow:  { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 8 },
  trackLabel: { fontSize: 10, color: '#888' },
});

// ── Checkbox ─────────────────────────────────────────────────────────────────
function Checkbox({ value, onValueChange, label }: {
  value: boolean; onValueChange: (v: boolean) => void; label: string;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={() => onValueChange(!value)}>
      <View style={[styles.checkBox, value && styles.checkBoxChecked]}>
        {value && <Text style={styles.checkMark}>✓</Text>}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ZoneProps {
  num_zone: number;
  properties: {
    label?: string;
    surface?: number;
    dose?: number | null;
    dose_base?: number | null;
    id_class?: number | null;
    tx_pierre?: number | null;
    [key: string]: unknown;
  };
}

interface Props {
  visible: boolean;
  zone: ZoneProps;
  parcelle: { id: number; nom: string };
  culture: { id: number; nom: string };
  allowDosageManuel?: boolean;
  onClose: () => void;
  onSave: () => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function FormulaireZoneSemis({
  visible, zone, parcelle, culture, allowDosageManuel = false, onClose, onSave,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const panY      = useRef(new Animated.Value(0)).current;
  const [saving,       setSaving]       = useState(false);
  const [txPierre,     setTxPierre]     = useState(0);
  const [persoDose,    setPersoDose]    = useState(false);
  const [dose,         setDose]         = useState('');
  const [doseBase,     setDoseBase]     = useState<number | null>(null);
  const [pierreRef,    setPierreRef]    = useState<PierreReferentielItem[]>([]);

  // Charger référentiel pierre une seule fois
  useEffect(() => {
    getPierreReferentiel().then(setPierreRef).catch(() => {});
  }, []);

  // Calcul dose en temps réel
  useEffect(() => {
    if (persoDose || doseBase == null || pierreRef.length === 0) return;
    const coef = getPierreCoef(pierreRef, txPierre);
    const calculated = doseBase * (1 + coef / 100);
    setDose(formatDose(calculated));
  }, [txPierre, doseBase, pierreRef, persoDose]);

  useEffect(() => {
    if (!visible) return;
    const p = zone.properties;
    const base = p.dose_base ?? p.dose ?? null;
    setDoseBase(base != null ? Number(base) : null);
    setTxPierre(p.tx_pierre != null ? Math.min(SLIDER_MAX, Math.round(Number(p.tx_pierre))) : 0);
    setDose(p.dose != null ? formatDose(Number(p.dose)) : '');
    setPersoDose(false);
    slideAnim.setValue(SHEET_H);
    panY.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 0, duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, zone]);

  const close = () => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: SHEET_H, duration: 280,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
    onPanResponderMove: (_, gs) => { if (gs.dy > 0) panY.setValue(gs.dy); },
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 80) close();
      else Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const handleSave = async () => {
    setSaving(true);
    try {
      // tx_pierre toujours envoyé → BO recalcule la dose
      // dose uniquement si perso_dose coché → BO utilise la valeur fournie
      await patchZoneSemis(zone.num_zone, {
        tx_pierre: txPierre,
        ...(persoDose ? { dose: parseFloat(dose) || 0 } : {}),
        perso_dose: persoDose,
      });
      close();
      setTimeout(() => onSave(), 350);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 403)
          Alert.alert('Non autorisé', 'Personnalisation non activée.');
        else if (err.status === 404)
          Alert.alert('Erreur', 'Zone introuvable.');
        else if (err.status === 422)
          Alert.alert('Info', 'Aucune modification à enregistrer.');
        else
          Alert.alert('Erreur', err.message);
      } else {
        Alert.alert('Erreur', 'Impossible d\'enregistrer la zone.');
      }
    } finally {
      setSaving(false);
    }
  };

  const zoneLabel   = String.fromCharCode(64 + (zone.properties.id_class ?? zone.num_zone));
  const isGrains    = culture.id === 3; // Betterave → graines/ha
  const doseUnit    = isGrains ? 'gr/ha' : 'kg/q';
  const formatDose  = (v: number) => isGrains ? String(Math.round(v)) : v.toFixed(2);

  return (
    <Animated.View
      style={[styles.overlay, { opacity: visible ? 1 : 0 },
        { pointerEvents: visible ? 'auto' : 'none' } as object]}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={{ flex: 1 }} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet,
        { transform: [{ translateY: Animated.add(slideAnim, panY) }] }]}>

        <View {...panResponder.panHandlers} style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            ZONE {zoneLabel} — Semis {culture.nom}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{parcelle.nom}</Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* Section principale */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sol</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Surface</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>
                    {zone.properties.surface != null ? `${zone.properties.surface} ha` : '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Nature du sol</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>
                    {zone.properties.label ?? '—'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Section Attributs */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attributs</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Taux de pierre *</Text>
                <SliderTxPierre value={txPierre} onChange={setTxPierre} />
              </View>

              <Checkbox
                value={persoDose}
                onValueChange={v => {
                  if (v && !allowDosageManuel) {
                    Alert.alert('Non autorisé', 'La personnalisation de la dose n\'a pas été activée au niveau de la parcelle.');
                    return;
                  }
                  setPersoDose(v);
                }}
                label="Personnaliser la dose"
              />

              <View style={styles.field}>
                <View style={styles.doseLabelRow}>
                  <Text style={styles.label}>Dose <Text style={styles.doseUnit}>{doseUnit}</Text></Text>
                  {!persoDose && pierreRef.length > 0 && (
                    <Text style={styles.doseCoefHint}>
                      coef. pierre : +{getPierreCoef(pierreRef, txPierre).toFixed(0)} %
                    </Text>
                  )}
                </View>
                <TextInput
                  style={[styles.input, !persoDose && styles.inputReadonly]}
                  value={dose}
                  onChangeText={persoDose ? setDose : undefined}
                  editable={persoDose}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#BDBDBD"
                />
              </View>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Boutons */}
        <View style={styles.buttons}>
          <Pressable
            style={[styles.btn, styles.btnAlt, saving && { opacity: 0.7 }]}
            onPress={() => { void handleSave(); }}
            disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#3B6D11" />
              : <Text style={styles.btnAltText}>Enregistrer</Text>
            }
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnAlt, (pressed || saving) && { opacity: 0.8 }]}
            onPress={close}
            disabled={saving}>
            <Text style={styles.btnAltText}>Annuler</Text>
          </Pressable>
        </View>

      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    zIndex: 200,
  },
  sheet: {
    height: SHEET_H,
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  handleContainer: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D0D0D0' },
  header: {
    backgroundColor: '#3B6D11',
    borderRadius: 6,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  headerTitle:    { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  scroll:         { flex: 1 },
  scrollContent:  { paddingHorizontal: 14, paddingBottom: 16, gap: 12 },
  section: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 12,
    paddingTop: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#555', letterSpacing: 0.8, marginLeft: 4 },
  field:        { gap: 4 },
  doseLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doseUnit:     { fontSize: 11, color: '#888', fontWeight: '400' },
  doseCoefHint: { fontSize: 11, color: '#3B6D11', fontWeight: '600' },
  label:        { fontSize: 12, fontWeight: '600', color: '#444' },
  input: {
    height: 40, borderWidth: 1, borderColor: '#D0D0D0',
    borderRadius: 8, paddingHorizontal: 10,
    fontSize: 13, color: '#333', backgroundColor: '#fff',
  },
  inputReadonly: { backgroundColor: '#E8E8E8', color: '#888' },
  readonlyBox: {
    height: 40, borderWidth: 1, borderColor: '#E0E0E0',
    borderRadius: 8, paddingHorizontal: 10,
    justifyContent: 'center', backgroundColor: '#E8E8E8',
  },
  readonlyText:  { fontSize: 13, color: '#666' },
  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#9E9E9E',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkBoxChecked: { backgroundColor: '#3B6D11', borderColor: '#3B6D11' },
  checkMark:     { fontSize: 12, color: '#fff', fontWeight: '700', lineHeight: 14 },
  checkLabel:    { fontSize: 12, color: '#444', flex: 1 },
  buttons: {
    flexDirection: 'row',
    backgroundColor: '#3B6D11',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  btn:    { flex: 1, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnAlt: { backgroundColor: '#fff' },
  btnAltText: { fontSize: 13, fontWeight: '700', color: '#3B6D11' },
});
