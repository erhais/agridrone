import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { getCultures, type ReferentielItem } from '../services/agridroneService';

const CULTURES_SEMIS_IDS = new Set([1, 3, 14, 26, 27, 28]);

const CULTURE_ICONS: Record<string, string> = {
  'Betterave':      '🌱',
  'Blé':            '🌾',
  'Maïs':           '🌽',
  'Tournesol':      '🌻',
  'Pomme de terre': '🥔',
  'Colza':          '🌿',
  'Orge':           '🌾',
  'Pois':           '🌱',
  'Lin':            '🌱',
  'Autre':          '🌱',
};

export interface CultureSelection {
  id: number;
  nom: string;
}

interface Props {
  visible: boolean;
  parcelleName: string;
  initialCultureId?: number | null;
  onClose: () => void;
  onSelect: (culture: CultureSelection) => void;
}

export default function SelectionCultureSemis({
  visible,
  parcelleName,
  initialCultureId,
  onClose,
  onSelect,
}: Props) {
  const slideAnim   = useRef(new Animated.Value(600)).current;
  const panY        = useRef(new Animated.Value(0)).current;
  const [cultures,    setCultures]    = useState<ReferentielItem[]>([]);
  const [loadingRef,  setLoadingRef]  = useState(true);
  const [selectedId,  setSelectedId]  = useState<number | null>(null);

  useEffect(() => {
    getCultures()
      .then(c => setCultures(c.filter(item => CULTURES_SEMIS_IDS.has(item.id))))
      .catch(() => {})
      .finally(() => setLoadingRef(false));
  }, []);

  useEffect(() => {
    if (visible) {
      setSelectedId(initialCultureId ?? null);
      slideAnim.setValue(600);
      panY.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const close = () => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: 600,
      duration: 260,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleSelect = (item: ReferentielItem) => {
    setSelectedId(item.id);
  };

  const handleConfirm = () => {
    const item = cultures.find(c => c.id === selectedId);
    if (!item) return;
    Animated.timing(slideAnim, {
      toValue: 600,
      duration: 260,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(() => onSelect({ id: item.id, nom: item.nom }));
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
        if (gs.dy > 60) close();
        else Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

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
          <Text style={styles.headerTitle}>Sélection de la culture</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{parcelleName}</Text>
        </View>

        {loadingRef ? (
          <View style={styles.loader}>
            <ActivityIndicator size="small" color="#2E6B1A" />
            <Text style={styles.loaderText}>Chargement…</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} bounces={false} showsVerticalScrollIndicator={false}>
            {cultures.map(item => {
              const isSelected = selectedId === item.id;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.cultureItem,
                    isSelected && styles.cultureItemSelected,
                    pressed && styles.cultureItemPressed,
                  ]}
                  onPress={() => handleSelect(item)}>
                  <Text style={styles.cultureIcon}>
                    {CULTURE_ICONS[item.nom] ?? '🌱'}
                  </Text>
                  <Text style={[styles.cultureName, isSelected && styles.cultureNameSelected]}>
                    {item.nom}
                  </Text>
                  {isSelected
                    ? <Text style={styles.cultureCheck}>✓</Text>
                    : <Text style={styles.cultureChevron}>›</Text>
                  }
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && { opacity: 0.7 }]}
            onPress={close}>
            <Text style={styles.btnCancelText}>Annuler</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              styles.btnConfirm,
              !selectedId && { opacity: 0.4 },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleConfirm}
            disabled={!selectedId}>
            <Text style={styles.btnConfirmText}>Valider</Text>
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
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '80%',
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
  loader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 20 },
  loaderText: { fontSize: 13, color: '#888' },
  list: { flexGrow: 0 },
  cultureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
    gap: 14,
  },
  cultureItemSelected: { backgroundColor: '#EAF4E4' },
  cultureItemPressed:  { backgroundColor: '#F0F7EC' },
  cultureIcon:  { fontSize: 22, width: 30, textAlign: 'center' },
  cultureName:  { fontSize: 15, color: '#222', flex: 1, fontWeight: '500' },
  cultureNameSelected: { color: '#2E6B1A', fontWeight: '700' },
  cultureCheck:   { fontSize: 18, color: '#2E6B1A', fontWeight: '700' },
  cultureChevron: { fontSize: 20, color: '#AAAAAA', fontWeight: '300' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  btn:          { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnCancel:    { backgroundColor: '#EEEEEE' },
  btnConfirm:   { backgroundColor: '#2E6B1A' },
  btnCancelText:  { fontSize: 14, fontWeight: '600', color: '#555' },
  btnConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
