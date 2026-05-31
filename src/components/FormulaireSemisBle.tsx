import { Picker } from '@react-native-picker/picker';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
const SHEET_H = SCREEN_H * 0.9;

// ── Checkbox ─────────────────────────────────────────────────────────────────

// Années disponibles + année par défaut selon le mois courant
function getAnneeDefaut(): number {
  const now = new Date();
  return (now.getMonth() + 1) >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}
const ANNEES = (() => {
  const n = new Date().getFullYear();
  return [n, n + 1, n + 2];
})();

// ── Slider préférence (-50% → +50%) ──────────────────────────────────────────

const SLIDER_MIN = -50;
const SLIDER_MAX = 50;
const THUMB_W = 26;

function SliderPreference({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  // Refs pour éviter les closures stale dans PanResponder
  const trackWRef   = useRef(0);
  const valueRef    = useRef(value);
  const onChangeRef = useRef(onChange);
  const posRef      = useRef(0);
  const [trackW, setTrackW] = useState(0);

  useEffect(() => { valueRef.current  = value;    }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const clamp = (v: number) =>
    Math.round(Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, v)));

  const xFromVal = (v: number, tw: number) =>
    tw > THUMB_W ? ((v - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * (tw - THUMB_W) : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        posRef.current = xFromVal(valueRef.current, trackWRef.current);
      },
      onPanResponderMove: (_, gs) => {
        const tw = trackWRef.current;
        const newX = Math.max(0, Math.min(tw - THUMB_W, posRef.current + gs.dx));
        const newVal = clamp(
          Math.round((newX / (tw - THUMB_W)) * (SLIDER_MAX - SLIDER_MIN) + SLIDER_MIN),
        );
        onChangeRef.current(newVal);
      },
      onPanResponderRelease: (_, gs) => {
        const tw = trackWRef.current;
        posRef.current = Math.max(0, Math.min(tw - THUMB_W, posRef.current + gs.dx));
      },
    })
  ).current;

  const onLayout = (w: number) => {
    trackWRef.current = w;
    setTrackW(w);
  };

  const thumbX   = xFromVal(value, trackW);
  const centerX  = xFromVal(0, trackW);
  const fillLeft  = Math.min(thumbX + THUMB_W / 2, centerX + THUMB_W / 2);
  const fillWidth = Math.abs(thumbX - centerX);
  const fillColor = value < 0 ? '#FF6B00' : value > 0 ? '#2E6B1A' : '#CCCCCC';
  const pctLabel  = value === 0 ? '0 %' : value > 0 ? `+${value} %` : `${value} %`;
  const modeLabel = value < 0 ? 'sous-dosage' : value > 0 ? 'sur-dosage' : '';

  return (
    <View style={slStyles.wrapper}>
      {/* Valeur + mode */}
      <View style={slStyles.topRow}>
        <Text style={[slStyles.valueLabel, { color: fillColor }]}>{pctLabel}</Text>
        {modeLabel.length > 0 && (
          <Text style={[slStyles.modeLabel, { color: fillColor }]}>{modeLabel}</Text>
        )}
      </View>
      {/* Piste */}
      <View
        style={slStyles.track}
        onLayout={e => onLayout(e.nativeEvent.layout.width)}>
        <View style={[slStyles.fill, { left: fillLeft, width: fillWidth, backgroundColor: fillColor }]} />
        <View style={[slStyles.centerMark, { left: centerX + THUMB_W / 2 - 1 }]} />
        <View
          {...panResponder.panHandlers}
          style={[slStyles.thumb, { left: thumbX, borderColor: fillColor }]}
        />
      </View>
      <View style={slStyles.labelsRow}>
        <Text style={slStyles.trackLabel}>-50 %</Text>
        <Text style={slStyles.trackLabel}>0 %</Text>
        <Text style={slStyles.trackLabel}>+50 %</Text>
      </View>
    </View>
  );
}

const slStyles = StyleSheet.create({
  wrapper:    { paddingVertical: 4 },
  topRow:     { alignItems: 'center', marginBottom: 6 },
  valueLabel: { fontSize: 20, fontWeight: '700' },
  modeLabel:  { fontSize: 11, fontWeight: '500', marginTop: 2 },
  track: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginHorizontal: 14,
    position: 'relative',
  },
  fill:       { position: 'absolute', height: 6, borderRadius: 3, top: 0 },
  centerMark: { position: 'absolute', width: 2, height: 12, top: -3, backgroundColor: '#AAAAAA' },
  thumb: {
    position: 'absolute',
    width: THUMB_W,
    height: THUMB_W,
    borderRadius: THUMB_W / 2,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    top: -(THUMB_W / 2) + 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  labelsRow:  { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 14, marginTop: 8 },
  trackLabel: { fontSize: 10, color: '#888' },
});

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  parcelle: { id: number; nom: string };
  idCulture: number;
  onClose: () => void;
  onSuccess?: (result: SemisFormResponse) => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function FormulaireSemisBle({
  visible,
  parcelle,
  idCulture,
  onClose,
  onSuccess,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const panY      = useRef(new Animated.Value(0)).current;

  const [conditions,     setConditions]     = useState<SemisCondition[]>([]);
  const [loadingRef,     setLoadingRef]     = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [formId,         setFormId]         = useState<number | null>(null);

  // Champs du formulaire
  const [dateSemis,        setDateSemis]        = useState('');
  const [dateSemisObj,     setDateSemisObj]     = useState(new Date());
  const [showDatePicker,   setShowDatePicker]   = useState(false);
  const [anneeRecolte,     setAnneeRecolte]     = useState(String(getAnneeDefaut()));
  const [pmg,              setPmg]              = useState('');
  const [tauxGermination,  setTauxGermination]  = useState('');
  const [dosageManuel,     setDosageManuel]     = useState(false);
  const [idConditionSol,   setIdConditionSol]   = useState(0);
  const [secondHerbicide,  setSecondHerbicide]  = useState(false);
  const [preference,       setPreference]       = useState('0');
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
          const yr = defaults.annee_recolte;
          setAnneeRecolte(ANNEES.includes(yr) ? String(yr) : String(getAnneeDefaut()));
          setIdConditionSol(defaults.id_semis_condition_sol);
          setDosageManuel(defaults.allow_dosage_manuel);
          // Champs spécifiques Blé dans attributs étendus
          const d = defaults as SemisDefaults & Record<string, unknown>;
          if (typeof d.date_semis === 'string')       setDateSemis(d.date_semis);
          if (typeof d.pmg === 'number')              setPmg(String(d.pmg));
          if (typeof d.taux_germination === 'number') setTauxGermination(String(d.taux_germination));
          if (typeof d.second_herbicide === 'boolean') setSecondHerbicide(d.second_herbicide);
          if (typeof d.preference === 'number')       setPreference(String(d.preference));
        } else if (conds.length > 0) {
          setIdConditionSol(conds[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRef(false));
  }, [visible, parcelle.id, idCulture]);

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
    if (!dateSemis.trim())       e.dateSemis       = 'Champ obligatoire (YYYY-MM-DD)';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateSemis))
                                 e.dateSemis       = 'Format attendu : YYYY-MM-DD';
    if (!pmg.trim())             e.pmg             = 'Champ obligatoire';
    if (!tauxGermination.trim()) e.tauxGermination = 'Champ obligatoire';
    if (idConditionSol <= 0)     e.idConditionSol  = 'Champ obligatoire';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload: SemisFormInput = {
      id_parcel: parcelle.id,
      id_culture: idCulture,
      date_semis: dateSemis,
      annee_recolte: parseInt(anneeRecolte, 10),
      pmg: parseFloat(pmg),
      taux_germination: parseInt(tauxGermination, 10),
      allow_dosage_manuel: dosageManuel,
      id_semis_condition_sol: idConditionSol,
      second_herbicide: secondHerbicide,
      ...(parseInt(preference, 10) !== 0 && { preference: parseInt(preference, 10) }),
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

  const err = (key: string) => errors[key]
    ? <Text style={styles.errorText}>{errors[key]}</Text>
    : null;

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

        <View {...panResponder.panHandlers} style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>🌾 Semis — Blé</Text>
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

            {/* Date de semis */}
            <View style={styles.field}>
              <Text style={styles.label}>Date de semis *</Text>
              <Pressable
                style={[styles.input, styles.dateBtn, errors.dateSemis && styles.inputError]}
                onPress={() => setShowDatePicker(true)}>
                <Text style={[styles.dateBtnText, !dateSemis && styles.datePlaceholder]}>
                  {dateSemis || 'Sélectionner une date…'}
                </Text>
                <Text style={styles.dateIcon}>📅</Text>
              </Pressable>
              {err('dateSemis')}
            </View>


            {/* Année récolte */}
            <View style={styles.field}>
              <Text style={styles.label}>Année récolte *</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={anneeRecolte}
                  onValueChange={v => setAnneeRecolte(String(v))}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}>
                  {ANNEES.map(y => (
                    <Picker.Item key={y} label={String(y)} value={String(y)} />
                  ))}
                </Picker>
              </View>
            </View>

            {/* PMG */}
            <View style={styles.field}>
              <Text style={styles.label}>PMG — Poids de mille grains (g) *</Text>
              <TextInput
                style={[styles.input, errors.pmg && styles.inputError]}
                value={pmg}
                onChangeText={v => { setPmg(v); setErrors(p => ({ ...p, pmg: '' })); }}
                keyboardType="decimal-pad"
                placeholder="ex: 45.5"
                placeholderTextColor="#BDBDBD"
              />
              {err('pmg')}
            </View>

            {/* Taux de germination */}
            <View style={styles.field}>
              <Text style={styles.label}>Taux de germination (%) *</Text>
              <TextInput
                style={[styles.input, errors.tauxGermination && styles.inputError]}
                value={tauxGermination}
                onChangeText={v => { setTauxGermination(v); setErrors(p => ({ ...p, tauxGermination: '' })); }}
                keyboardType="numeric"
                placeholder="ex: 95"
                placeholderTextColor="#BDBDBD"
              />
              {err('tauxGermination')}
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
              {err('idConditionSol')}
            </View>

            {/* Dosage manuel */}
            <View style={styles.field}>
              <Checkbox
                value={dosageManuel}
                onValueChange={setDosageManuel}
                label="Autoriser le dosage manuel"
              />
            </View>

            {/* Second herbicide */}
            <View style={styles.field}>
              <Checkbox
                value={secondHerbicide}
                onValueChange={setSecondHerbicide}
                label="Second herbicide"
              />
            </View>

            {/* Ajustement de dose — dernier champ */}
            <View style={styles.field}>
              <Text style={styles.label}>Ajustement de dose <Text style={styles.hint}>(optionnel)</Text></Text>
              <SliderPreference
                value={parseInt(preference, 10) || 0}
                onChange={v => setPreference(String(v))}
              />
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* DateTimePicker iOS — overlay sur fond blanc en bas du sheet */}
        {showDatePicker && Platform.OS === 'ios' && (
          <View style={styles.datePickerOverlay}>
            <View style={styles.datePickerHeader}>
              <Pressable onPress={() => setShowDatePicker(false)}>
                <Text style={styles.datePickerDone}>Valider</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={dateSemisObj}
              mode="date"
              display="spinner"
              locale="fr-FR"
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                if (date) {
                  setDateSemisObj(date);
                  const y = date.getFullYear();
                  const m = String(date.getMonth() + 1).padStart(2, '0');
                  const d = String(date.getDate()).padStart(2, '0');
                  setDateSemis(`${y}-${m}-${d}`);
                  setErrors(p => ({ ...p, dateSemis: '' }));
                }
              }}
            />
          </View>
        )}

        {/* DateTimePicker Android — dialog natif */}
        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={dateSemisObj}
            mode="date"
            display="default"
            onChange={(event: DateTimePickerEvent, date?: Date) => {
              setShowDatePicker(false);
              if (event.type === 'set' && date) {
                setDateSemisObj(date);
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                setDateSemis(`${y}-${m}-${d}`);
                setErrors(p => ({ ...p, dateSemis: '' }));
              }
            }}
          />
        )}

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
  hint:           { fontSize: 11, fontWeight: '400', color: '#888' },
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
  inputError:  { borderColor: '#D32F2F' },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateBtnText: { fontSize: 13, color: '#333' },
  datePlaceholder: { color: '#BDBDBD' },
  dateIcon:    { fontSize: 16 },
  datePickerOverlay: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E6B1A',
  },
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
  btn:           { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnCancel:     { backgroundColor: '#EEEEEE' },
  btnSave:       { backgroundColor: '#2E6B1A' },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: '#555' },
  btnSaveText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
