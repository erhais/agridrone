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
import Ionicons from '@expo/vector-icons/Ionicons';
import { ApiError } from '../services/api';
import { apiService } from '../services/api';
import { type EngraisZoneDetail, type TypeSolItem } from '../services/agridroneService';
import { champNumeriqueOuVide } from '../utils/formulaireUtils';

const { height: SCREEN_H } = require('react-native').Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.9;

// Couleur d'accent charte (vert foncé) — en-tête, bouton principal, coches
const ACCENT = '#1B5E20';

const ELEMENT_LABELS: Record<string, string> = {
  P: 'Phosphore', K: 'Potassium', MG: 'Magnésie',
};

// -1 = sentinelle « non renseigné » côté base → champ vide (voir formulaireUtils).
const numOrEmpty = champNumeriqueOuVide;

// ── Checkbox ─────────────────────────────────────────────────────────────────
function Checkbox({ value, onValueChange, label }: {
  value: boolean; onValueChange: (v: boolean) => void; label: string;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={() => onValueChange(!value)}>
      <View style={[styles.checkBox, value && styles.checkBoxChecked]}>
        {value && <Ionicons name="checkmark" size={15} color="#fff" />}
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

  // Refs pour lire les valeurs courantes sans en faire des dépendances de l'effet d'init.
  const typeSolsRef    = useRef(typeSols);
  const initialDetailRef = useRef(initialDetail);
  const rendementGlobalRef = useRef(rendementGlobal);
  useEffect(() => { typeSolsRef.current = typeSols; }, [typeSols]);
  useEffect(() => { initialDetailRef.current = initialDetail; }, [initialDetail]);
  useEffect(() => { rendementGlobalRef.current = rendementGlobal; }, [rendementGlobal]);

  // Clé stable : id de zone + num. L'init ne tourne qu'à l'ouverture ou au changement de zone,
  // jamais à cause d'un re-render du parent (zone est un objet littéral → nouvelle référence).
  const formKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      formKeyRef.current = null;
      return;
    }
    const key = `${String(zone.id)}:${String(zone.num_zone)}`;
    if (formKeyRef.current === key) return; // même zone, re-render du parent → rien
    formKeyRef.current = key;

    const p = zone.properties;
    const d = initialDetailRef.current;
    setTeneur(numOrEmpty(d?.teneur ?? p.teneur));
    setPh(numOrEmpty(d?.ph ?? p.ph));
    setDose(numOrEmpty(d?.dose ?? p.dose));
    const isPersoRend = d?.perso_rendement === 1;
    setPersoRendement(isPersoRend);
    const rend = isPersoRend && d?.rendement != null
      ? numOrEmpty(d.rendement)
      : numOrEmpty(rendementGlobalRef.current ?? p.rendement);
    setRendement(rend);
    setPersoDose(false);
    const idTypeSol = (p.id_type_sol as number | null)
      ?? typeSolsRef.current.find(t => t.nom === p.label)?.id
      ?? null;
    setSelectedTypeSol(idTypeSol);

    slideAnim.setValue(SHEET_H);
    panY.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 0, duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  // zone est un objet littéral (nouvelle ref à chaque render parent) — on compare par clé stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, zone.id, zone.num_zone]);

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
    const canSaveTypeSol = isEditeur && typeSols.length > 0;
    if (!allowRendementSpec && !allowDosageManuel && !canSaveTypeSol) {
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
  const sectionColor = zone.style?.fillColor ?? ACCENT;

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
                  if (!v) {
                    setRendement(numOrEmpty(rendementGlobal));
                  }
                }}
                label="Personnaliser le rendement"
              />
              <View style={styles.field}>
                <Text style={styles.label}>
                  {persoRendement ? 'Rendement spécifique sur zone *' : 'Rendement global *'}
                </Text>
                <TextInput
                  style={[styles.input, !persoRendement && styles.inputReadonly]}
                  value={persoRendement ? rendement : numOrEmpty(rendementGlobal)}
                  onChangeText={persoRendement ? setRendement : undefined}
                  editable={persoRendement}
                  keyboardType="numeric"
                  placeholder="Préciser le rendement"
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
                  placeholder="Préciser la dose"
                  placeholderTextColor="#BDBDBD"
                />
              </View>
            </View>

          </ScrollView>
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
    marginBottom: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  headerTitle:    { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  headerSubtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  scroll:         { flex: 1 },
  scrollContent:  { paddingHorizontal: 14, paddingBottom: 16, gap: 12 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 16,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6EAE6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  sectionAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    borderTopLeftRadius: 14, borderBottomLeftRadius: 14,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '800', color: ACCENT,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2,
  },
  field:         { gap: 5 },
  fieldRow:      { flexDirection: 'row', gap: 10 },
  label:         { fontSize: 12.5, fontWeight: '600', color: '#3A423A' },
  input: {
    height: 44, borderWidth: 1, borderColor: '#D5DAD5',
    borderRadius: 10, paddingHorizontal: 12,
    fontSize: 14, color: '#222', backgroundColor: '#fff',
  },
  inputReadonly: { backgroundColor: '#F1F3F1', color: '#8A8F8A', borderColor: '#E3E6E3' },
  readonlyBox: {
    height: 44, borderWidth: 1, borderColor: '#E3E6E3',
    borderRadius: 10, paddingHorizontal: 12,
    justifyContent: 'center', backgroundColor: '#F1F3F1',
  },
  readonlyText:  { fontSize: 14, color: '#555' },
  pickerWrapper: { borderWidth: 1, borderColor: '#D5DAD5', borderRadius: 10, backgroundColor: '#FAFBFA' },
  picker:        { color: '#222', width: '100%' },
  pickerItem:    { fontSize: 14, color: '#222' },
  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  checkBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#B0B7B0',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkBoxChecked: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkLabel:    { fontSize: 13, color: '#3A423A', flex: 1, fontWeight: '500' },
  buttons: {
    flexDirection: 'row',
    backgroundColor: ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  btn: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#fff' },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
  btnGhostText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
