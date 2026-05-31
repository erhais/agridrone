import { Picker } from '@react-native-picker/picker';
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
import {
  getSemisConditions,
  getSemisDefaults,
  postFormulairesSemis,
  putFormulairesSemis,
  type SemisCondition,
  type SemisDefaults,
  type SemisFormInput,
  type SemisFormResponse,
} from '../services/agridroneService';
import { ApiError } from '../services/api';

const { height: SCREEN_H } = require('react-native').Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.85;

// ── Checkbox ────────────────────────────────────────────────────────────────

function Checkbox({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
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

// ── Types ────────────────────────────────────────────────────────────────────

export interface SemisBetteraveData {
  id_parcel: number;
  id_culture: number;
  annee_recolte: number;
  id_semis_condition_sol: number;
  allow_dosage_manuel: boolean;
  commentaire: string | null;
}

interface Props {
  visible: boolean;
  parcelle: { id: number; nom: string };
  idCulture: number;
  cultureName: string;
  onClose: () => void;
  onSuccess?: (result: SemisFormResponse) => void;
}

// ── Composant ────────────────────────────────────────────────────────────────

export default function FormulaireSemisBetterave({
  visible,
  parcelle,
  idCulture,
  cultureName,
  onClose,
  onSuccess,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const panY      = useRef(new Animated.Value(0)).current;

  const [conditions,       setConditions]       = useState<SemisCondition[]>([]);
  const [loadingRef,       setLoadingRef]       = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [formId,           setFormId]           = useState<number | null>(null);

  const [anneeRecolte,     setAnneeRecolte]     = useState(String(new Date().getFullYear()));
  const [idConditionSol,   setIdConditionSol]   = useState(0);
  const [dosageManuel,     setDosageManuel]     = useState(false);
  const [commentaire,      setCommentaire]      = useState('');
  const [errors,           setErrors]           = useState<Record<string, string>>({});

  // Chargement conditions + defaults
  useEffect(() => {
    if (!visible) return;
    setLoadingRef(true);
    Promise.all([
      getSemisConditions(),
      getSemisDefaults(parcelle.id, idCulture),
    ])
      .then(([conds, defaults]) => {
        setConditions(conds);
        if (defaults) {
          if (defaults.id) setFormId(defaults.id);
          setAnneeRecolte(String(defaults.annee_recolte));
          setIdConditionSol(defaults.id_semis_condition_sol);
          setDosageManuel(defaults.allow_dosage_manuel);
          setCommentaire(defaults.commentaire ?? '');
        } else if (conds.length > 0) {
          setIdConditionSol(conds[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRef(false));
  }, [visible, parcelle.id, idCulture]);

  // Animation slide
  useEffect(() => {
    if (visible) {
      setErrors({});
      slideAnim.setValue(SHEET_H);
      panY.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const close = () => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: SHEET_H,
      duration: 280,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) panY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) close();
        else Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!anneeRecolte.trim()) e.anneeRecolte = 'Champ obligatoire';
    if (idConditionSol <= 0)  e.idConditionSol = 'Champ obligatoire';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload: SemisFormInput = {
      id_parcel: parcelle.id,
      id_culture: idCulture,
      annee_recolte: parseInt(anneeRecolte, 10),
      id_semis_condition_sol: idConditionSol,
      allow_dosage_manuel: dosageManuel,
      commentaire: commentaire.trim() || null,
    };
    try {
      const result = formId
        ? await putFormulairesSemis(formId, payload)
        : await postFormulairesSemis(payload);
      setFormId(result.id);
      close();
      setTimeout(() => onSuccess?.(result), 350);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          Alert.alert('Données invalides', err.message);
        } else if (err.status === 500) {
          Alert.alert('Erreur serveur', 'Une erreur est survenue, réessayez.');
        } else {
          Alert.alert('Erreur', err.message);
        }
      } else {
        Alert.alert('Erreur', 'Impossible d\'enregistrer le formulaire.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity: visible ? 1 : 0 },
        { pointerEvents: visible ? 'auto' : 'none' } as object,
      ]}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={{ flex: 1 }} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: Animated.add(slideAnim, panY) }] },
        ]}>

        {/* Handle */}
        <View {...panResponder.panHandlers} style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🌱 Semis — {cultureName}</Text>
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

            {loadingRef && (
              <View style={styles.refLoader}>
                <ActivityIndicator size="small" color="#2E6B1A" />
                <Text style={styles.refLoaderText}>Chargement…</Text>
              </View>
            )}

            {/* Année récolte */}
            <View style={styles.field}>
              <Text style={styles.label}>Année récolte *</Text>
              <TextInput
                style={[styles.input, errors.anneeRecolte && styles.inputError]}
                value={anneeRecolte}
                onChangeText={v => { setAnneeRecolte(v); setErrors(p => ({ ...p, anneeRecolte: '' })); }}
                keyboardType="numeric"
                maxLength={4}
              />
              {!!errors.anneeRecolte && <Text style={styles.errorText}>{errors.anneeRecolte}</Text>}
            </View>

            {/* Condition de semis du sol */}
            <View style={styles.field}>
              <Text style={styles.label}>Condition de semis du sol *</Text>
              <View style={[styles.pickerWrapper, errors.idConditionSol && styles.inputError]}>
                <Picker
                  selectedValue={idConditionSol}
                  onValueChange={v => {
                    setIdConditionSol(Number(v));
                    setErrors(p => ({ ...p, idConditionSol: '' }));
                  }}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}>
                  {conditions.map(c => (
                    <Picker.Item key={c.id} label={c.condition} value={c.id} />
                  ))}
                </Picker>
              </View>
              {!!errors.idConditionSol && (
                <Text style={styles.errorText}>{errors.idConditionSol}</Text>
              )}
            </View>

            {/* Dosage manuel */}
            <View style={styles.field}>
              <Checkbox
                value={dosageManuel}
                onValueChange={setDosageManuel}
                label="Autoriser le dosage manuel"
              />
            </View>

            {/* Commentaire */}
            <View style={styles.field}>
              <Text style={styles.label}>Commentaire</Text>
              <TextInput
                style={styles.textArea}
                value={commentaire}
                onChangeText={setCommentaire}
                placeholder="Commentaire (optionnel)"
                placeholderTextColor="#BDBDBD"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Boutons */}
        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnCancel, (pressed || saving) && { opacity: 0.7 }]}
            onPress={close}
            disabled={saving}>
            <Text style={styles.btnCancelText}>Annuler</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnSave, saving && { opacity: 0.7 }]}
            onPress={() => { void handleSave(); }}
            disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.btnSaveText}>Enregistrer</Text>
            }
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
    backgroundColor: '#2E6B1A',
    borderRadius: 6,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  headerTitle:    { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  scroll:         { flex: 1 },
  scrollContent:  { paddingHorizontal: 16, paddingBottom: 16 },
  refLoader:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  refLoaderText:  { fontSize: 12, color: '#888' },
  field:          { marginBottom: 16 },
  label:          { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    height: 80,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  inputError:  { borderColor: '#D32F2F' },
  errorText:   { fontSize: 11, color: '#D32F2F', marginTop: 3 },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
  },
  picker:     { color: '#333', width: '100%' },
  pickerItem: { fontSize: 13, color: '#333' },
  checkRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#9E9E9E',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkBoxChecked: { backgroundColor: '#2E6B1A', borderColor: '#2E6B1A' },
  checkMark:  { fontSize: 12, color: '#fff', fontWeight: '700', lineHeight: 14 },
  checkLabel: { fontSize: 13, color: '#444', flex: 1 },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  btn:          { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnCancel:    { backgroundColor: '#EEEEEE' },
  btnSave:      { backgroundColor: '#2E6B1A' },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: '#555' },
  btnSaveText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
