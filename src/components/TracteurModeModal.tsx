import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type TracteurMode = 'modulation' | 'vitesse' | 'dosage';

const STORE_KEY = 'tracteur_mode_default';

interface ModeItem {
  id: TracteurMode;
  icon: string;
  color: string;
  bg: string;
  title: string;
  subtitle: string;
  description: string;
}

const MODES: ModeItem[] = [
  {
    id: 'modulation',
    icon: 'monitor-dashboard',
    color: '#1565C0',
    bg: '#EEF4FF',
    title: 'Vers console',
    subtitle: 'Terminal de modulation',
    description: 'Convertit le shapefile pour votre terminal de modulation',
  },
  {
    id: 'vitesse',
    icon: 'speedometer',
    color: '#E65100',
    bg: '#FFF4EE',
    title: 'Conduite par vitesse',
    subtitle: 'Avancement variable',
    description: 'La carte guide votre avancement — ajustez la vitesse zone par zone',
  },
  {
    id: 'dosage',
    icon: 'tune-variant',
    color: '#2E7D32',
    bg: '#EEF7EE',
    title: 'Conduite par dosage',
    subtitle: 'Réglage manuel',
    description: 'La carte indique la dose à régler manuellement sur l\'épandeur',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (mode: TracteurMode) => void;
}

export default function TracteurModeModal({ visible, onClose, onSelect }: Props) {
  const [selected, setSelected] = useState<TracteurMode>('vitesse');
  const [saveDefault, setSaveDefault] = useState(false);

  useEffect(() => {
    if (!visible) return;
    SecureStore.getItemAsync(STORE_KEY)
      .then(val => {
        if (val === 'modulation' || val === 'vitesse' || val === 'dosage') {
          setSelected(val);
          setSaveDefault(true);
        }
      })
      .catch(() => {});
  }, [visible]);

  const handleStart = async () => {
    if (saveDefault) {
      await SecureStore.setItemAsync(STORE_KEY, selected).catch(() => {});
    } else {
      await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
    }
    onSelect(selected);
  };

  const activeMode = MODES.find(m => m.id === selected)!;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>

          <View style={styles.handle} />

          <View style={styles.cards}>
            {MODES.map(mode => {
              const isSelected = selected === mode.id;
              return (
                <Pressable
                  key={mode.id}
                  style={[
                    styles.card,
                    isSelected && { borderColor: mode.color, backgroundColor: mode.bg },
                  ]}
                  onPress={() => setSelected(mode.id)}>
                  <View style={[styles.iconCircle, isSelected && { backgroundColor: mode.color }]}>
                    <MaterialCommunityIcons
                      name={mode.icon as never}
                      size={22}
                      color={isSelected ? '#fff' : '#9E9E9E'}
                    />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                      <Text style={[styles.cardTitle, isSelected && { color: mode.color }]}>
                        {mode.title}
                      </Text>
                      <Text style={[styles.cardBadge, isSelected && { backgroundColor: mode.color }]}>
                        {mode.subtitle}
                      </Text>
                    </View>
                    <Text style={styles.cardDesc}>{mode.description}</Text>
                  </View>
                  <View style={[styles.radio, isSelected && { borderColor: mode.color }]}>
                    {isSelected && <View style={[styles.radioDot, { backgroundColor: mode.color }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.checkRow} onPress={() => setSaveDefault(v => !v)}>
            <View style={[styles.checkbox, saveDefault && styles.checkboxChecked]}>
              {saveDefault && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={styles.checkLabel}>Mémoriser ce choix par défaut</Text>
          </Pressable>

          <View style={styles.buttons}>
            <Pressable style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.btnStart, { backgroundColor: activeMode.color }]}
              onPress={() => { void handleStart(); }}>
              <MaterialCommunityIcons name="tractor" size={18} color="#fff" />
              <Text style={styles.btnStartText}>Démarrer</Text>
            </Pressable>
          </View>

        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 18,
  },
  cards: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    backgroundColor: '#FAFAFA',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cardBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#BDBDBD',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  cardDesc: {
    fontSize: 12,
    color: '#757575',
    lineHeight: 17,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D0D0D0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  checkLabel: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
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
