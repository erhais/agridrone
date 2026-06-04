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

interface ZoneProps {
  num_zone: number;
  properties: {
    label?: string;
    surface?: number;
    dose?: number | null;
    id_class?: number | null;
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
    setSelectedTypeSol((zone.properties.id_type_sol as number | null) ?? null);
    slideAnim.setValue(SHEET_H);
    panY.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 0, duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, zone]);

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
  const fillColor   = zone.style?.fillColor ?? '#3B6D11';
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
              {isEditeur && typeSols.length > 0 ? (
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={selectedTypeSol}
                    onValueChange={v => setSelectedTypeSol(v as number | null)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}>
                    <Picker.Item label="— Sélectionner —" value={null} />
                    {typeSols.map(t => (
                      <Picker.Item key={t.id} label={t.libelle} value={t.id} />
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
            style={[styles.btn, styles.btnSave, saving && { opacity: 0.7 }]}
            onPress={() => { void handleSave(); }}
            disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#3B6D11" />
              : <Text style={styles.btnSaveText}>Enregistrer</Text>
            }
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && { opacity: 0.8 }]}
            onPress={close}
            disabled={saving}>
            <Text style={styles.btnCancelText}>Annuler</Text>
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
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  handleContainer: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D0D0D0' },
  header: {
    backgroundColor: '#3B6D11',
    borderRadius: 6,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
  },
  headerTitle:    { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3 },

  infoSection: {
    marginHorizontal: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  separator:  { height: StyleSheet.hairlineWidth, backgroundColor: '#E0E0E0' },
  infoLabel:     { fontSize: 13, color: '#666' },
  infoValue:     { fontSize: 13, fontWeight: '600', color: '#222', flex: 1, textAlign: 'right' },
  pickerWrapper: { flex: 1, borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, backgroundColor: '#FAFAFA' },
  picker:        { color: '#333', width: '100%' },
  pickerItem:    { fontSize: 13, color: '#333' },

  doseSection: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  doseLabel: { fontSize: 14, fontWeight: '600', color: '#333', width: 50 },
  doseInput: {
    flex: 1,
    height: 46,
    borderWidth: 1.5,
    borderColor: '#3B6D11',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    backgroundColor: '#F9FFF5',
  },

  buttons: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  btn:          { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnSave:      { backgroundColor: '#fff', borderWidth: 2, borderColor: '#3B6D11' },
  btnCancel:    { backgroundColor: '#F0F0F0' },
  btnSaveText:  { fontSize: 14, fontWeight: '700', color: '#3B6D11' },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: '#666' },
});
