import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteProfile,
  getProfiles,
  saveProfile,
  type CalibrationPoint,
  type MachineProfile,
} from '../services/machineProfileService';

export interface CalibrationResult {
  points: CalibrationPoint[];
  unite: string;
  mode: 'vitesse' | 'dosage';
}

interface Props {
  visible: boolean;
  mode: 'vitesse' | 'dosage';
  onClose: () => void;
  onConfirm: (result: CalibrationResult) => void;
}

const MODE_CONFIG = {
  vitesse: {
    label: 'Conduite par vitesse',
    color: '#E65100',
    bg: '#FFF4EE',
    icon: 'speedometer',
    doseCol: 'Dose (kg/ha)',
    valCol: 'Vitesse (km/h)',
    unite: 'km/h',
    placeholder1: '8.0',
    placeholder2: '6.5',
  },
  dosage: {
    label: 'Conduite par dosage',
    color: '#2E7D32',
    bg: '#EEF7EE',
    icon: 'tune-variant',
    doseCol: 'Dose (kg/ha)',
    valCol: 'Réglage (%)',
    unite: '%',
    placeholder1: '60',
    placeholder2: '80',
  },
};

export default function CalibrationModal({ visible, mode, onClose, onConfirm }: Props) {
  const cfg = MODE_CONFIG[mode];

  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [dose1, setDose1] = useState('');
  const [val1, setVal1] = useState('');
  const [hasP2, setHasP2] = useState(false);
  const [dose2, setDose2] = useState('');
  const [val2, setVal2] = useState('');

  const [nomProfil, setNomProfil] = useState('');
  const [doSave, setDoSave] = useState(false);

  const dose1Ref = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    getProfiles(mode).then(setProfiles).catch(() => {});
    // Reset form
    setSelectedId(null);
    setDose1(''); setVal1('');
    setHasP2(false); setDose2(''); setVal2('');
    setNomProfil(''); setDoSave(false);
  }, [visible, mode]);

  const applyProfile = (p: MachineProfile) => {
    setSelectedId(p.id);
    const [p1, p2] = p.points;
    setDose1(String(p1?.dose ?? '')); setVal1(String(p1?.valeur ?? ''));
    if (p2) { setDose2(String(p2.dose)); setVal2(String(p2.valeur)); setHasP2(true); }
    else { setDose2(''); setVal2(''); setHasP2(false); }
    setNomProfil(p.nom);
    setDoSave(false);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setDose1(''); setVal1('');
    setHasP2(false); setDose2(''); setVal2('');
    setNomProfil(''); setDoSave(false);
    setTimeout(() => dose1Ref.current?.focus(), 100);
  };

  const handleDeleteProfile = (p: MachineProfile) => {
    Alert.alert(
      `Supprimer "${p.nom}" ?`,
      undefined,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteProfile(p.id).catch(() => {});
            setProfiles(prev => prev.filter(x => x.id !== p.id));
            if (selectedId === p.id) clearSelection();
          },
        },
      ],
    );
  };

  const handleConfirm = async () => {
    const d1 = parseFloat(dose1.replace(',', '.'));
    const v1 = parseFloat(val1.replace(',', '.'));
    if (isNaN(d1) || isNaN(v1) || d1 <= 0 || v1 <= 0) {
      Alert.alert('Calibration incomplète', 'Renseignez au moins un point valide.');
      return;
    }

    const points: CalibrationPoint[] = [{ dose: d1, valeur: v1 }];
    if (hasP2) {
      const d2 = parseFloat(dose2.replace(',', '.'));
      const v2 = parseFloat(val2.replace(',', '.'));
      if (!isNaN(d2) && !isNaN(v2) && d2 > 0 && v2 > 0 && d2 !== d1) {
        points.push({ dose: d2, valeur: v2 });
      }
    }

    if (doSave && nomProfil.trim()) {
      const profile: MachineProfile = {
        id: selectedId ?? String(Date.now()),
        nom: nomProfil.trim(),
        mode,
        unite: cfg.unite,
        points,
        updatedAt: Date.now(),
      };
      await saveProfile(profile).catch(() => {});
    }

    onConfirm({ points, unite: cfg.unite, mode });
  };

  const canStart = parseFloat(dose1.replace(',', '.')) > 0 && parseFloat(val1.replace(',', '.')) > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={[styles.modeTag, { backgroundColor: cfg.bg }]}>
              <MaterialCommunityIcons name={cfg.icon as never} size={16} color={cfg.color} />
              <Text style={[styles.modeTagText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>

            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>

              {/* Profils sauvegardés */}
              {profiles.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Profils enregistrés</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsRow}>
                    {profiles.map(p => {
                      const isSel = selectedId === p.id;
                      return (
                        <Pressable
                          key={p.id}
                          style={[styles.chip, isSel && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                          onPress={() => applyProfile(p)}
                          onLongPress={() => handleDeleteProfile(p)}>
                          <Text style={[styles.chipText, isSel && { color: '#fff' }]} numberOfLines={1}>
                            {p.nom}
                          </Text>
                          {isSel && <Ionicons name="checkmark" size={12} color="#fff" style={{ marginLeft: 4 }} />}
                        </Pressable>
                      );
                    })}
                    {selectedId !== null && (
                      <Pressable style={styles.chipNew} onPress={clearSelection}>
                        <Ionicons name="add" size={14} color={cfg.color} />
                        <Text style={[styles.chipNewText, { color: cfg.color }]}>Nouveau</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Calibration points */}
              <View style={styles.section}>
                <View style={styles.colHeaders}>
                  <Text style={styles.colLabel}>{cfg.doseCol}</Text>
                  <View style={styles.arrowSpacer} />
                  <Text style={styles.colLabel}>{cfg.valCol}</Text>
                </View>

                {/* Point 1 */}
                <View style={styles.pointRow}>
                  <TextInput
                    ref={dose1Ref}
                    style={styles.input}
                    value={dose1}
                    onChangeText={setDose1}
                    placeholder="ex: 200"
                    placeholderTextColor="#BDBDBD"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                  <Text style={styles.arrow}>→</Text>
                  <TextInput
                    style={styles.input}
                    value={val1}
                    onChangeText={setVal1}
                    placeholder={`ex: ${cfg.placeholder1}`}
                    placeholderTextColor="#BDBDBD"
                    keyboardType="decimal-pad"
                    returnKeyType={hasP2 ? 'next' : 'done'}
                  />
                </View>

                {/* Toggle point 2 */}
                <Pressable style={styles.addPointRow} onPress={() => setHasP2(v => !v)}>
                  <View style={[styles.checkboxSm, hasP2 && { backgroundColor: cfg.color, borderColor: cfg.color }]}>
                    {hasP2 && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={styles.addPointText}>Ajouter un 2e point de calibration</Text>
                </Pressable>

                {/* Point 2 */}
                {hasP2 && (
                  <View style={styles.pointRow}>
                    <TextInput
                      style={styles.input}
                      value={dose2}
                      onChangeText={setDose2}
                      placeholder="ex: 250"
                      placeholderTextColor="#BDBDBD"
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                    />
                    <Text style={styles.arrow}>→</Text>
                    <TextInput
                      style={styles.input}
                      value={val2}
                      onChangeText={setVal2}
                      placeholder={`ex: ${cfg.placeholder2}`}
                      placeholderTextColor="#BDBDBD"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  </View>
                )}
              </View>

              {/* Save profile */}
              <View style={styles.section}>
                <Pressable style={styles.saveRow} onPress={() => setDoSave(v => !v)}>
                  <View style={[styles.checkboxSm, doSave && { backgroundColor: '#2E7D32', borderColor: '#2E7D32' }]}>
                    {doSave && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={styles.saveLabel}>Sauvegarder comme profil machine</Text>
                </Pressable>
                {doSave && (
                  <TextInput
                    style={styles.nameInput}
                    value={nomProfil}
                    onChangeText={setNomProfil}
                    placeholder="Nom du profil (ex: Amazone ZA-M)"
                    placeholderTextColor="#BDBDBD"
                    returnKeyType="done"
                    autoCorrect={false}
                  />
                )}
              </View>

            </ScrollView>

            {/* Buttons */}
            <View style={styles.buttons}>
              <Pressable style={styles.btnCancel} onPress={onClose}>
                <Text style={styles.btnCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.btnStart, { backgroundColor: canStart ? cfg.color : '#BDBDBD' }]}
                onPress={() => { void handleConfirm(); }}
                disabled={!canStart}>
                <MaterialCommunityIcons name="tractor" size={18} color="#fff" />
                <Text style={styles.btnStartText}>Démarrer</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 14,
  },
  modeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  modeTagText: {
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9E9E9E',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 160,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
  },
  chipNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#BDBDBD',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipNewText: {
    fontSize: 13,
    fontWeight: '600',
  },
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  colLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#9E9E9E',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  arrowSpacer: { width: 32 },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  arrow: {
    fontSize: 18,
    color: '#9E9E9E',
    fontWeight: '300',
    width: 24,
    textAlign: 'center',
  },
  addPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 4,
  },
  checkboxSm: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPointText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  saveLabel: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  nameInput: {
    marginTop: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#1A1A1A',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btnCancel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
  },
  btnStart: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnStartText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
