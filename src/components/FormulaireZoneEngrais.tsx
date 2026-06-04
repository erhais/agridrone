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
import { Picker } from '@react-native-picker/picker';
import { ApiError } from '../services/api';
import { apiService } from '../services/api';
import { type EngraisZoneDetail, type TypeSolItem } from '../services/agridroneService';

const { height: SCREEN_H } = require('react-native').Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.9;

const ELEMENT_LABELS: Record<string, string> = {
  P: 'Phosphore', K: 'Potassium', MG: 'Magnésie',
};

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
export interface ZoneEngraisData {
  num_zone: number;
  teneur: number;
  rendement: number;
  perso_rendement: boolean;
  ph: number;
  dose: number;
  perso_dose: boolean;
  id_type_sol?: number | null;
}

interface ZoneProps {
  id: string;
  num_zone: number;
  properties: {
    label?: string;
    teneur?: number | null;
    surface?: number;
    dose?: number | null;
    element?: string;
    id_class?: number | null;
    ph?: number | null;
    rendement?: number | null;
    [key: string]: unknown;
  };
  style?: { fillColor?: string };
}

interface Props {
  visible: boolean;
  zone: ZoneProps;
  parcelle: { id: number; nom: string };
  rendementGlobal?: number;
  initialDetail?: EngraisZoneDetail | null;
  allowDosageManuel?: boolean;
  allowRendementSpec?: boolean;
  isEditeur?: boolean;
  typeSols?: TypeSolItem[];
  onClose: () => void;
  onSave: (data: ZoneEngraisData) => Promise<void>;
  onRecopie?: () => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function FormulaireZoneEngrais({
  visible, zone, parcelle, rendementGlobal, initialDetail,
  allowDosageManuel = true, allowRendementSpec = true,
  isEditeur = false, typeSols = [],
  onClose, onSave, onRecopie,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const panY      = useRef(new Animated.Value(0)).current;
  const [saving,          setSaving]          = useState(false);

  // Champs formulaire
  const [teneur,          setTeneur]          = useState('');
  const [ph,              setPh]              = useState('');
  const [persoRendement, setPersoRendement] = useState(false);
  const [rendement,      setRendement]      = useState('');
  const [persoDose,      setPersoDose]      = useState(false);
  const [dose,           setDose]           = useState('');
  const [selectedTypeSol, setSelectedTypeSol] = useState<number | null>(null);

  // Init : priorité initialDetail (API zone), fallback properties zone
  useEffect(() => {
    if (!visible) return;
    const p = zone.properties;
    const d = initialDetail;
    setTeneur(d?.teneur != null ? String(d.teneur) : (p.teneur != null ? String(p.teneur) : ''));
    setPh(d?.ph != null ? String(d.ph) : (p.ph != null ? String(p.ph) : ''));
    setDose(d?.dose != null ? String(d.dose) : (p.dose != null ? String(p.dose) : ''));
    const rend = d?.rendement != null ? String(d.rendement)
      : rendementGlobal != null ? String(rendementGlobal)
      : p.rendement != null ? String(p.rendement) : '';
    setRendement(rend);
    setPersoRendement(false);
    setPersoDose(false);
    const idTypeSol = (p.id_type_sol as number | null) ?? null;
    setSelectedTypeSol(idTypeSol);

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
    // Aucun droit de personnalisation → fermeture silencieuse sans appel API
    if (!allowRendementSpec && !allowDosageManuel) {
      close();
      return;
    }
    setSaving(true);
    try {
      await onSave({
        num_zone: zone.num_zone,
        teneur: parseFloat(teneur) || 0,
        rendement: parseFloat(rendement) || 0,
        perso_rendement: persoRendement,
        ph: parseFloat(ph) || 0,
        dose: parseFloat(dose) || 0,
        perso_dose: persoDose,
        id_type_sol: isEditeur ? selectedTypeSol : undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message
        : err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.';
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRecopie = () => {
    Alert.alert(
      'Recopier sur toutes les zones',
      'Appliquer ces valeurs à toutes les zones de la parcelle ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Recopier', style: 'destructive', onPress: onRecopie },
      ],
    );
  };

  const element = zone.properties.element ?? 'P';
  const elementLabel = ELEMENT_LABELS[element] ?? element;
  const sectionColor = zone.style?.fillColor ?? '#3B6D11';
  console.log('[zone-form] style:', zone.style, '| sectionColor:', sectionColor);

  return (
    <Animated.View
      style={[styles.overlay, { opacity: visible ? 1 : 0 },
        { pointerEvents: visible ? 'auto' : 'none' } as object]}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={{ flex: 1 }} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet,
        { transform: [{ translateY: Animated.add(slideAnim, panY) }] }]}>

        {/* Handle */}
        <View {...panResponder.panHandlers} style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            {zone.style?.fillColor && (
              <View style={[styles.zoneColorDot, { backgroundColor: zone.style.fillColor }]} />
            )}
            <Text style={styles.headerTitle}>
              ZONE {String.fromCharCode(64 + (zone.properties.id_class ?? zone.num_zone))} — {elementLabel}
            </Text>
          </View>
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

            {/* Section Nature du sol */}
            <View style={styles.section}>
              <View style={[styles.sectionAccent, { backgroundColor: sectionColor }]} />
              <Text style={styles.sectionTitle}>Sol</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Nature du sol</Text>
                {isEditeur && typeSols.length > 0 &&
                 (!zone.properties.element || String(zone.properties.element) === '0') ? (
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
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText}>
                      {zone.properties.label ?? '—'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Teneur + pH sur la même ligne */}
              <View style={styles.fieldRow}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Teneur {elementLabel}</Text>
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText}>{teneur || '—'}</Text>
                  </View>
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>pH du sol</Text>
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText}>{ph || '—'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Surface</Text>
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyText}>
                    {zone.properties.surface != null
                      ? `${zone.properties.surface} ha`
                      : '—'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Section Attributs */}
            <View style={styles.section}>
              <View style={[styles.sectionAccent, { backgroundColor: sectionColor }]} />
              <Text style={styles.sectionTitle}>Attributs</Text>

              {/* Rendement */}
              <Checkbox
                value={persoRendement}
                onValueChange={v => {
                  if (v && !allowRendementSpec) {
                    Alert.alert(
                      'Non autorisé',
                      'La personnalisation du rendement par zone n\'a pas été autorisée au niveau de la parcelle.',
                    );
                    return;
                  }
                  setPersoRendement(v);
                }}
                label="Personnaliser le rendement"
              />
              <View style={styles.field}>
                <Text style={styles.label}>
                  {persoRendement ? 'Rendement spécifique sur zone *' : 'Rendement global *'}
                </Text>
                <TextInput
                  style={[styles.input, !persoRendement && styles.inputReadonly]}
                  value={rendement}
                  onChangeText={persoRendement ? setRendement : undefined}
                  editable={persoRendement}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#BDBDBD"
                />
              </View>

              {/* Dose */}
              <Checkbox
                value={persoDose}
                onValueChange={v => {
                  if (v && !allowDosageManuel) {
                    Alert.alert(
                      'Non autorisé',
                      'La personnalisation de la dose par zone n\'a pas été autorisée au niveau de la parcelle.',
                    );
                    return;
                  }
                  setPersoDose(v);
                }}
                label="Personnaliser la dose"
              />
              <View style={styles.field}>
                <Text style={styles.label}>Dose</Text>
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
            style={({ pressed }) => [styles.btn, styles.btnAlt, pressed && { opacity: 0.8 }]}
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
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
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
  sectionAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: 8 },
  sectionTitle:  { fontSize: 12, fontWeight: '700', color: '#555', letterSpacing: 0.8, marginLeft: 8 },
  field:         { gap: 4 },
  fieldRow:      { flexDirection: 'row', gap: 10 },
  label:         { fontSize: 12, fontWeight: '600', color: '#444' },
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
  pickerWrapper: { borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, backgroundColor: '#FAFAFA' },
  picker:        { color: '#333', width: '100%' },
  pickerItem:    { fontSize: 13, color: '#333' },
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
