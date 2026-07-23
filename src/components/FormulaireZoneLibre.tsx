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
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { ApiError } from '../services/api';
import { patchZoneSemis, type TypeSolItem } from '../services/agridroneService';

const { height: SCREEN_H } = require('react-native').Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.55;

// Couleur d'accent charte (vert foncé) — en-tête, bouton principal, champ dose
const ACCENT = '#1B5E20';

interface ZoneProps {
  num_zone: number;
  properties: {
    label?: string;
    surface?: number;
    dose?: number | null;
    id_class?: number | null;
    element?: string | number | null;
    [key: string]: unknown;
  };
  style?: { fillColor?: string };
}

interface Props {
  visible: boolean;
  zone: ZoneProps;
  parcelle: { id: number; nom: string };
  fertilisant?: string;
  isEditeur?: boolean;
  typeSols?: TypeSolItem[];
  onClose: () => void;
  onSave: () => void;
}

const FERTILISANT_LABELS: Record<string, string> = {
  Z: 'Zonage libre',
};

export default function FormulaireZoneLibre({
  visible, zone, parcelle, fertilisant = 'Z',
  isEditeur = false, typeSols = [],
  onClose, onSave,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const panY      = useRef(new Animated.Value(0)).current;
  const [dose,           setDose]          = useState('');
  const [saving,         setSaving]        = useState(false);
  const [selectedTypeSol, setSelectedTypeSol] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDose(zone.properties.dose != null ? String(zone.properties.dose) : '');
    setSelectedTypeSol(
      (zone.properties.id_type_sol as number | null)
      ?? typeSols.find(t => t.nom === zone.properties.label)?.id
      ?? null,
    );
    slideAnim.setValue(SHEET_H);
    panY.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 0, duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, zone, typeSols]);

  const close = () => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: SHEET_H, duration: 260,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
    onPanResponderMove: (_, gs) => { if (gs.dy > 0) panY.setValue(gs.dy); },
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 60) close();
      else Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const handleSave = async () => {
    const doseVal = parseFloat(dose);
    if (isNaN(doseVal) || doseVal < 0) {
      Alert.alert('Valeur invalide', 'Saisissez une dose valide.');
      return;
    }
    setSaving(true);
    try {
      await patchZoneSemis(zone.num_zone, {
        tx_pierre: 0,
        dose: doseVal,
        perso_dose: true,
        ...(isEditeur && selectedTypeSol != null ? { id_type_sol: selectedTypeSol } : {}),
      }, fertilisant);
      close();
      setTimeout(() => onSave(), 350);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        Alert.alert('Erreur', err.message);
      } else {
        Alert.alert('Erreur', 'Impossible d\'enregistrer.');
      }
    } finally {
      setSaving(false);
    }
  };

  const zoneLabel   = String.fromCharCode(64 + (zone.properties.id_class ?? zone.num_zone));
  const fillColor   = zone.style?.fillColor ?? ACCENT;
  const modeLabel   = FERTILISANT_LABELS[fertilisant] ?? fertilisant;

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
          <View style={styles.headerTitleRow}>
            <View style={[styles.colorDot, { backgroundColor: fillColor }]} />
            <Text style={styles.headerTitle}>ZONE {zoneLabel} — {modeLabel}</Text>
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{parcelle.nom}</Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>

          <View style={styles.infoSection}>
            {/* Infos zone */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type de sol</Text>
              {isEditeur && typeSols.length > 0 &&
               (!zone.properties.element || String(zone.properties.element) === '0') ? (
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={selectedTypeSol}
                      mode="dropdown"
                    onValueChange={v => setSelectedTypeSol(v as number | null)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}>
                    <Picker.Item label="— Sélectionner —" value={null} />
                    {typeSols.map(t => (
                      <Picker.Item key={t.id} label={t.nom} value={t.id} />
                    ))}
                  </Picker>
                </View>
              ) : (
                <Text style={styles.infoValue}>{zone.properties.label ?? '—'}</Text>
              )}
            </View>
            <View style={styles.separator} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Surface</Text>
              <Text style={styles.infoValue}>
                {zone.properties.surface != null ? `${zone.properties.surface} ha` : '—'}
              </Text>
            </View>
          </View>

          {/* Dose */}
          <View style={styles.doseSection}>
            <Text style={styles.doseLabel}>Dose</Text>
            <TextInput
              style={styles.doseInput}
              value={dose}
              onChangeText={setDose}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#BDBDBD"
              autoFocus={false}
            />
          </View>

        </KeyboardAvoidingView>

        {/* Boutons */}
        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnPrimary, (saving || pressed) && { opacity: 0.85 }]}
            onPress={() => { void handleSave(); }}
            disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={ACCENT} />
              : <Text style={styles.btnPrimaryText}>Enregistrer</Text>
            }
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.7 }]}
            onPress={close}
            disabled={saving}>
            <Text style={styles.btnGhostText}>Annuler</Text>
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
    backgroundColor: '#F4F6F4',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  handleContainer: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#CBD2CB' },
  header: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    marginHorizontal: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 14,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)',
  },
  headerTitle:    { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  headerSubtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 },

  infoSection: {
    marginHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6EAE6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  separator:  { height: StyleSheet.hairlineWidth, backgroundColor: '#ECEFEC' },
  infoLabel:     { fontSize: 13, color: '#3A423A' },
  infoValue:     { fontSize: 13.5, fontWeight: '600', color: '#222', flex: 1, textAlign: 'right' },
  pickerWrapper: { flex: 1, borderWidth: 1, borderColor: '#D5DAD5', borderRadius: 10, backgroundColor: '#FAFBFA' },
  picker:        { color: '#222', width: '100%' },
  pickerItem:    { fontSize: 14, color: '#222' },

  doseSection: {
    marginHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  doseLabel: { fontSize: 14, fontWeight: '600', color: '#3A423A', width: 50 },
  doseInput: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1D1A',
    backgroundColor: '#F3F8F0',
  },

  buttons: {
    flexDirection: 'row',
    backgroundColor: ACCENT,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  btn: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#fff' },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  btnGhostText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
