import { Picker } from '@react-native-picker/picker';
import { useEffect, useRef, useState } from 'react';
import { getCultures, getFrequences, getPailleOptions, type ReferentielItem } from '../services/agridroneService';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.85;

// Injection CSS pour ne montrer que le formulaire 1/2/3 + logo ARVALIS
// Sélecteurs issus du HTML réel de fertiorga.arvalis-infos.fr
const FERTIORGA_CLEAN_JS = `
(function() {
  var s = document.createElement('style');
  s.textContent =
    'div[data-role="header"]{display:none!important}' +
    '.contenu .container>div[style*="margin: 10px 20px"]{display:none!important}' +
    '.lim-footer{display:none!important}' +
    '#tarteaucitronRoot{display:none!important}' +
    'body,html{padding:0!important;margin:0!important}';
  (document.head || document.documentElement).appendChild(s);
  true;
})();
`;

const ELEMENT_LABELS: Record<string, string> = {
  P: 'PHOSPHORE',
  K: 'POTASSIUM',
  MG: 'MAGNÉSIE',
};

export interface FormulaireData {
  annee_recolte: string;
  id_culture: number;
  double_culture: boolean;
  id_culture2?: number;
  obj_rendement2?: string;
  id_engrais_frequence: number;
  obj_rendement: string;
  rendement_specifique_zone: boolean;
  teneur_engrais: string;
  dosage_manuel_zone: boolean;
  qte_deja_apportee: string;
  paille: number;
  visible_plan_fumure: boolean;
}

interface Props {
  visible: boolean;
  parcelle: { id: number; nom: string };
  element: string;
  initialData?: FormulaireData | null;
  onClose: () => void;
  onSave: (data: FormulaireData) => Promise<void>;
}

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

// ── Composant principal ──────────────────────────────────────────────────────

export default function FormulaireEngrais({
  visible,
  parcelle,
  element,
  initialData,
  onClose,
  onSave,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;
  const panY     = useRef(new Animated.Value(0)).current;

  // Référentiels chargés depuis l'API
  const [cultures,      setCultures]      = useState<ReferentielItem[]>([]);
  const [frequences,    setFrequences]    = useState<ReferentielItem[]>([]);
  const [pailleOptions, setPailleOptions] = useState<ReferentielItem[]>([]);
  const [loadingRef,    setLoadingRef]    = useState(true);

  // Valeurs du formulaire
  const [anneeRecolte,        setAnneeRecolte]        = useState(String(new Date().getFullYear()));
  const [idCulture,           setIdCulture]           = useState(0);
  const [doubleCulture,       setDoubleCulture]       = useState(false);
  const [idCulture2,          setIdCulture2]          = useState(0);
  const [objRendement2,       setObjRendement2]       = useState('90');
  const [idFrequence,         setIdFrequence]         = useState(0);
  const [objRendement,        setObjRendement]        = useState('90');
  const [rendementSpecifique, setRendementSpecifique] = useState(false);
  const [teneurEngrais,       setTeneurEngrais]       = useState('100');
  const [dosageManuel,        setDosageManuel]        = useState(true);
  const [qteApportee,         setQteApportee]         = useState('0');
  const [idPaille,            setIdPaille]            = useState(0);
  const [visiblePlanFumure,   setVisiblePlanFumure]   = useState(true);
  const [errors,              setErrors]              = useState<Record<string, string>>({});
  const [saving,              setSaving]              = useState(false);
  const [webViewVisible,      setWebViewVisible]      = useState(false);

  // Chargement des référentiels au montage — fallbacks si endpoint absent/vide
  useEffect(() => {
    const FALLBACK_PAILLE: ReferentielItem[] = [
      { id: 1, nom: 'Enfouie' },
      { id: 2, nom: 'Exportée' },
      { id: 3, nom: 'Sans objet' },
    ];
    setLoadingRef(true);
    Promise.allSettled([getCultures(), getFrequences(), getPailleOptions()])
      .then(([rc, rf, rp]) => {
        const c = rc.status === 'fulfilled' && rc.value.length > 0 ? rc.value : [];
        const f = rf.status === 'fulfilled' && rf.value.length > 0 ? rf.value : [];
        const p = rp.status === 'fulfilled' && rp.value.length > 0 ? rp.value : FALLBACK_PAILLE;
        setCultures(c);
        setFrequences(f);
        setPailleOptions(p);
        // Ne poser le 1er élément par défaut que si rien n'est déjà sélectionné :
        // en édition, l'effet `initialData` a déjà renseigné la valeur — ne pas l'écraser.
        if (c.length > 0) setIdCulture(prev => (prev > 0 ? prev : c[0].id));
        if (f.length > 0) setIdFrequence(prev => (prev > 0 ? prev : f[0].id));
        setIdPaille(prev => (prev > 0 ? prev : p[0].id));
      })
      .finally(() => setLoadingRef(false));
  }, []);

  useEffect(() => {
    if (visible) {
      if (initialData) {
        setAnneeRecolte(initialData.annee_recolte);
        setIdCulture(initialData.id_culture);
        setDoubleCulture(initialData.double_culture);
        if (initialData.id_culture2) setIdCulture2(initialData.id_culture2);
        if (initialData.obj_rendement2) setObjRendement2(initialData.obj_rendement2);
        setIdFrequence(initialData.id_engrais_frequence);
        setObjRendement(initialData.obj_rendement);
        setRendementSpecifique(initialData.rendement_specifique_zone);
        setTeneurEngrais(initialData.teneur_engrais);
        setDosageManuel(initialData.dosage_manuel_zone);
        setQteApportee(initialData.qte_deja_apportee);
        setIdPaille(initialData.paille);
        setVisiblePlanFumure(initialData.visible_plan_fumure);
      } else {
        setAnneeRecolte(String(new Date().getFullYear()));
        if (cultures.length > 0)      setIdCulture(cultures[0].id);
        if (frequences.length > 0)    setIdFrequence(frequences[0].id);
        if (pailleOptions.length > 0) setIdPaille(pailleOptions[0].id);
        else setIdPaille(1);
        setDoubleCulture(false);
        setIdCulture2(0);
        setObjRendement2('90');
        setObjRendement('90');
        setRendementSpecifique(false);
        setTeneurEngrais('100');
        setDosageManuel(true);
        setQteApportee('0');
        setVisiblePlanFumure(true);
      }
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
        if (gs.dy > 80) {
          close();
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!anneeRecolte.trim())     e.anneeRecolte  = 'Champ obligatoire';
    if (idCulture <= 0)          e.idCulture     = 'Champ obligatoire';
    if (idFrequence <= 0)        e.idFrequence   = 'Champ obligatoire';
    if (!objRendement.trim())    e.objRendement  = 'Champ obligatoire';
    if (!teneurEngrais.trim())   e.teneurEngrais = 'Champ obligatoire';
    if (qteApportee.trim() === '') e.qteApportee = 'Champ obligatoire';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        annee_recolte: anneeRecolte,
        id_culture: idCulture,
        double_culture: doubleCulture,
        ...(doubleCulture && idCulture2 > 0 && { id_culture2: idCulture2 }),
        ...(doubleCulture && { obj_rendement2: objRendement2 }),
        id_engrais_frequence: idFrequence,
        obj_rendement: objRendement,
        rendement_specifique_zone: rendementSpecifique,
        teneur_engrais: teneurEngrais,
        dosage_manuel_zone: dosageManuel,
        qte_deja_apportee: qteApportee,
        paille: idPaille,
        visible_plan_fumure: visiblePlanFumure,
      });
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
          <Text style={styles.headerTitle}>
            Engrais {ELEMENT_LABELS[element] ?? element}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {parcelle.nom}
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* Loader référentiels */}
            {loadingRef && (
              <View style={styles.refLoader}>
                <ActivityIndicator size="small" color="#3B6D11" />
                <Text style={styles.refLoaderText}>Chargement des listes…</Text>
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

            {/* Culture */}
            <View style={styles.field}>
              <Text style={styles.label}>Culture *</Text>
              <View style={[styles.pickerWrapper, errors.idCulture && styles.inputError]}>
                <Picker
                  selectedValue={idCulture}
                  onValueChange={v => { setIdCulture(Number(v)); setErrors(p => ({ ...p, idCulture: '' })); }}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}>
                  {cultures.map(c => <Picker.Item key={c.id} label={c.nom} value={c.id} />)}
                </Picker>
              </View>
              <Checkbox value={doubleCulture} onValueChange={setDoubleCulture} label="Double culture" />
              {!!errors.idCulture && <Text style={styles.errorText}>{errors.idCulture}</Text>}
            </View>

            {/* Champs double culture */}
            {doubleCulture && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>2ème culture</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={idCulture2}
                      onValueChange={v => setIdCulture2(Number(v))}
                      style={styles.picker}
                      itemStyle={styles.pickerItem}>
                      <Picker.Item key={0} label="— Sélectionner —" value={0} />
                      {cultures.map(c => <Picker.Item key={c.id} label={c.nom} value={c.id} />)}
                    </Picker>
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Obj. Rendement 2ème culture{cultures.find(c => c.id === idCulture2)?.unite ? ` (${cultures.find(c => c.id === idCulture2)!.unite})` : ''}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={objRendement2}
                    onChangeText={setObjRendement2}
                    keyboardType="numeric"
                  />
                </View>
              </>
            )}

            {/* Fréquence */}
            <View style={styles.field}>
              <Text style={styles.label}>Fréquence des apports *</Text>
              <View style={[styles.pickerWrapper, errors.idFrequence && styles.inputError]}>
                <Picker
                  selectedValue={idFrequence}
                  onValueChange={v => { setIdFrequence(Number(v)); setErrors(p => ({ ...p, idFrequence: '' })); }}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}>
                  {frequences.map(f => <Picker.Item key={f.id} label={f.nom} value={f.id} />)}
                </Picker>
              </View>
              {!!errors.idFrequence && <Text style={styles.errorText}>{errors.idFrequence}</Text>}
            </View>

            {/* Obj. Rendement */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Obj. Rendement{cultures.find(c => c.id === idCulture)?.unite ? ` (${cultures.find(c => c.id === idCulture)!.unite})` : ''} *
              </Text>
              <TextInput
                style={[styles.input, errors.objRendement && styles.inputError]}
                value={objRendement}
                onChangeText={v => { setObjRendement(v); setErrors(p => ({ ...p, objRendement: '' })); }}
                keyboardType="numeric"
              />
              <Checkbox value={rendementSpecifique} onValueChange={setRendementSpecifique} label="Rendement spécifique sur zone" />
              {!!errors.objRendement && <Text style={styles.errorText}>{errors.objRendement}</Text>}
            </View>

            {/* Teneur engrais */}
            <View style={styles.field}>
              <Text style={styles.label}>Teneur en engrais (%) *</Text>
              <TextInput
                style={[styles.input, errors.teneurEngrais && styles.inputError]}
                value={teneurEngrais}
                onChangeText={v => { setTeneurEngrais(v); setErrors(p => ({ ...p, teneurEngrais: '' })); }}
                keyboardType="numeric"
              />
              <Checkbox value={dosageManuel} onValueChange={setDosageManuel} label="Dosage manuel sur zone" />
              {!!errors.teneurEngrais && <Text style={styles.errorText}>{errors.teneurEngrais}</Text>}
            </View>

            {/* Qté déjà apportée */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Qté déjà apportée *</Text>
                <Pressable onPress={() => setWebViewVisible(true)}>
                  <Text style={styles.linkText}>Calculer</Text>
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, errors.qteApportee && styles.inputError]}
                value={qteApportee}
                onChangeText={v => { setQteApportee(v); setErrors(p => ({ ...p, qteApportee: '' })); }}
                keyboardType="numeric"
              />
              {!!errors.qteApportee && <Text style={styles.errorText}>{errors.qteApportee}</Text>}
            </View>

            {/* Paille */}
            <View style={styles.field}>
              <Text style={styles.label}>Paille *</Text>
              <View style={[styles.pickerWrapper, errors.idPaille && styles.inputError]}>
                <Picker
                  selectedValue={idPaille}
                  onValueChange={v => { setIdPaille(Number(v)); setErrors(p => ({ ...p, idPaille: '' })); }}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}>
                  {pailleOptions.map(p => <Picker.Item key={p.id} label={p.nom} value={p.id} />)}
                </Picker>
              </View>
              <Checkbox value={visiblePlanFumure} onValueChange={setVisiblePlanFumure} label="Visible sur le plan fumure" />
              {!!errors.idPaille && <Text style={styles.errorText}>{errors.idPaille}</Text>}
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

      {/* WebView Fertiorga */}
      <Modal
        visible={webViewVisible}
        animationType="slide"
        onRequestClose={() => setWebViewVisible(false)}>
        <View style={styles.wvContainer}>
          <View style={[styles.wvHeader, { paddingTop: (StatusBar.currentHeight ?? 0) + (Platform.OS === 'ios' ? 44 : 8) }]}>
            <Text style={styles.wvTitle}>Fertiorga — ARVALIS</Text>
            <Pressable onPress={() => setWebViewVisible(false)} style={styles.wvClose} hitSlop={12}>
              <Text style={styles.wvCloseText}>✕</Text>
            </Pressable>
          </View>
          <WebView
            source={{ uri: 'https://fertiorga.arvalis-infos.fr/FR' }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.wvLoading}>
                <ActivityIndicator size="large" color="#3B6D11" />
              </View>
            )}
            injectedJavaScript={FERTIORGA_CLEAN_JS}
            javaScriptEnabled
          />
        </View>
      </Modal>

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

  // Handle
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
  },

  // Header
  header: {
    backgroundColor: '#3B6D11',
    borderRadius: 6,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Form
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
  refLoader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  refLoaderText: { fontSize: 12, color: '#888' },

  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  linkText: { fontSize: 12, color: '#1565C0', fontWeight: '600' },

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
  inputError: { borderColor: '#D32F2F' },
  errorText: { fontSize: 11, color: '#D32F2F', marginTop: 3 },

  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    overflow: 'visible',
  },
  picker: { color: '#333', width: '100%' },
  pickerItem: { fontSize: 13, color: '#333' },

  // Checkbox
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#9E9E9E',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkBoxChecked: { backgroundColor: '#3B6D11', borderColor: '#3B6D11' },
  checkMark: { fontSize: 12, color: '#fff', fontWeight: '700', lineHeight: 14 },
  checkLabel: { fontSize: 12, color: '#555', flex: 1 },

  // Boutons
  buttons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: { backgroundColor: '#EEEEEE' },
  btnSave:   { backgroundColor: '#3B6D11' },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: '#555' },
  btnSaveText:   { fontSize: 14, fontWeight: '700', color: '#fff' },

  // WebView Fertiorga
  wvContainer: { flex: 1, backgroundColor: '#fff' },
  wvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#3B6D11',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  wvTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  wvClose: { padding: 4 },
  wvCloseText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  wvLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
