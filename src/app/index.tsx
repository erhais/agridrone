/**
 * Écran principal – carte + overlays
 *
 * 1. Carte plein écran (react-native-maps)
 * 2. Barre de recherche + dropdown (overlay haut)
 * 3. Barre d'icônes verticale (overlay droite)
 * 4. Panneau rétractable (overlay bas)
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApi } from '../hooks/useApi';
import {
  getParcelles,
  getZones,
  helloWorld,
  type ParcelleFeature,
  type ZoneFeature,
  type ZoneProperties,
  type ZoneStyle,
} from '../services/agridroneService';
import MapView, { Polygon, UrlTile, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes carte
// ─────────────────────────────────────────────────────────────────────────────

const IGN_ORTHO_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg';

const DEFAULT_REGION: Region = {
  latitude: 46.5,
  longitude: 2.5,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers style zones
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${opacity})`;
}

function getZoneStyle(feature: ZoneFeature): {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
} {
  const style = feature.properties?.style as ZoneStyle | undefined;
  if (!style) {
    return {
      fillColor: hexToRgba('#CCCCCC', 0.5),
      strokeColor: '#232323',
      strokeWidth: 1,
    };
  }
  return {
    fillColor: hexToRgba(style.fillColor, style.fillOpacity),
    strokeColor: style.dashArray != null
      ? hexToRgba(style.color, 0.5)
      : style.color,
    strokeWidth: style.weight,
  };
}

function processRings(
  rings: number[][][],
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  for (const ring of rings) {
    for (const coord of ring) {
      const lng = coord[0];
      const lat = coord[1];
      if (lat < bbox.minLat) bbox.minLat = lat;
      if (lat > bbox.maxLat) bbox.maxLat = lat;
      if (lng < bbox.minLng) bbox.minLng = lng;
      if (lng > bbox.maxLng) bbox.maxLng = lng;
    }
  }
}

function computeRegion(features: ParcelleFeature[]): Region | null {
  const bbox = { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity };

  for (const feature of features) {
    if (feature.geometry?.type === 'Polygon') {
      processRings(feature.geometry.coordinates, bbox);
    } else if (feature.geometry?.type === 'MultiPolygon') {
      for (const polygon of feature.geometry.coordinates) {
        processRings(polygon, bbox);
      }
    }
  }

  if (!isFinite(bbox.minLat)) return null;

  return {
    latitude: (bbox.minLat + bbox.maxLat) / 2,
    longitude: (bbox.minLng + bbox.maxLng) / 2,
    latitudeDelta: Math.max((bbox.maxLat - bbox.minLat) * 1.2, 0.01),
    longitudeDelta: Math.max((bbox.maxLng - bbox.minLng) * 1.2, 0.01),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Données icônes – barre droite
// ─────────────────────────────────────────────────────────────────────────────

type IconLib = 'ion' | 'mci';

interface IconDef {
  id: string;
  lib: IconLib;
  name: string;
  color?: string;
  bg?: string;
}

const RIGHT_ICONS: IconDef[] = [
  { id: 'login',     lib: 'ion', name: 'log-in-outline' },
  { id: 'move',      lib: 'mci', name: 'arrow-all' },
  { id: 'pin',       lib: 'ion', name: 'location-outline' },
  { id: 'eye',       lib: 'ion', name: 'eye-outline' },
  { id: 'info',      lib: 'ion', name: 'information-circle-outline' },
  { id: 'tractor',   lib: 'mci', name: 'tractor' },
  { id: 'pencil',    lib: 'ion', name: 'pencil-outline' },
  {
    id: 'leaf',
    lib: 'ion',
    name: 'leaf-outline',
    bg: '#fef3cd',
    color: '#f59e0b',
  },
  {
    id: 'satellite',
    lib: 'mci',
    name: 'satellite-variant',
    bg: '#1a3a5c',
    color: '#ffffff',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Composant utilitaire – icône polymorphe
// ─────────────────────────────────────────────────────────────────────────────

function Icon({
  lib,
  name,
  size,
  color,
}: {
  lib: IconLib;
  name: string;
  size: number;
  color: string;
}) {
  if (lib === 'mci') {
    return (
      <MaterialCommunityIcons name={name as never} size={size} color={color} />
    );
  }
  return <Ionicons name={name as never} size={size} color={color} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Barre de recherche + dropdown
// ─────────────────────────────────────────────────────────────────────────────

interface SearchBarProps {
  topOffset: number;
  query: string;
  onQueryChange: (text: string) => void;
  onFocus: () => void;
  onGpsPress: () => void;
  filteredParcelles: { index: number; nom: string }[];
  dropdownOpen: boolean;
  onSelectParcelle: (index: number, nom: string) => void;
  inputRef: React.RefObject<TextInput | null>;
}

function SearchBar({
  topOffset,
  query,
  onQueryChange,
  onFocus,
  onGpsPress,
  filteredParcelles,
  dropdownOpen,
  onSelectParcelle,
  inputRef,
}: SearchBarProps) {
  return (
    <View style={[styles.searchBarWrapper, { top: topOffset }]}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color="#9E9E9E" />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Rechercher une parcelle..."
          placeholderTextColor="#BDBDBD"
          value={query}
          onChangeText={onQueryChange}
          onFocus={onFocus}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Pressable
          style={({ pressed }) => [styles.gpsBtn, pressed && { opacity: 0.6 }]}
          onPress={onGpsPress}>
          <Ionicons name="navigate-circle-outline" size={24} color="#2196F3" />
        </Pressable>
      </View>

      {dropdownOpen && filteredParcelles.length > 0 && (
        <View style={styles.dropdown}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}>
            {filteredParcelles.map(({ index, nom }) => (
              <Pressable
                key={index}
                style={({ pressed }) => [
                  styles.dropdownItem,
                  pressed && styles.dropdownItemPressed,
                ]}
                onPress={() => onSelectParcelle(index, nom)}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color="#546E7A"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.dropdownItemText} numberOfLines={1}>
                  {nom}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Barre d'icônes verticale (droite)
// ─────────────────────────────────────────────────────────────────────────────

function RightIconBar({
  topOffset,
  onPressIcon,
  hasZones = false,
}: {
  topOffset: number;
  onPressIcon?: (id: string) => void;
  hasZones?: boolean;
}) {
  return (
    <View style={[styles.iconBar, { top: topOffset }]}>
      {RIGHT_ICONS.map((item, index) => {
        const infoActive = item.id === 'info' && hasZones;
        return (
          <Pressable
            key={item.id}
            onPress={() => onPressIcon?.(item.id)}
            style={({ pressed }) => [
              styles.iconBtn,
              item.bg ? { backgroundColor: item.bg } : null,
              infoActive && { backgroundColor: '#e8f0fb' },
              index > 0 &&
                !item.bg &&
                !RIGHT_ICONS[index - 1].bg && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: '#EEEEEE',
                },
              pressed && styles.iconBtnPressed,
            ]}>
            <Icon
              lib={item.lib}
              name={item.name}
              size={20}
              color={infoActive ? '#1a3a5c' : (item.color ?? '#546E7A')}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mini légende zones
// ─────────────────────────────────────────────────────────────────────────────

const ELEMENT_LABELS: Record<string, string> = {
  P:  'PHOSPHORE',
  K:  'POTASSIUM',
  MG: 'MAGNÉSIE',
  S:  'SEMIS',
};

interface LegendEntry {
  fillColor: string;
  label: string;
  dose: number | null;
  surf_ha: number;
}

const LABEL_FIELDS = [
  'label', 'nom_sol', 'type_sol', 'libelle', 'description',
  'sol', 'classe', 'class_name', 'nom',
] as const;

function resolveLabel(p: ZoneProperties): string {
  for (const field of LABEL_FIELDS) {
    const v = p[field];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  // semis : id_sol comme identifiant de sol
  if (p.id_sol != null) return `Sol ${p.id_sol}`;
  // engrais : id_class comme identifiant de classe
  if (p.id_class != null) return `Classe ${p.id_class}`;
  return '—';
}

function buildLegendEntries(zones: ZoneFeature[]): LegendEntry[] {
  // fillColor as key: unique per QGIS class regardless of id_class availability
  const map = new Map<string, LegendEntry>();
  for (const zone of zones) {
    const p = zone.properties;
    if (!p) continue;
    const fill = p.style?.fillColor ?? '#CCCCCC';
    if (!map.has(fill)) {
      map.set(fill, {
        fillColor: fill,
        label: resolveLabel(p),
        dose: typeof p.dose === 'number' && p.dose >= 0 ? p.dose : null,
        surf_ha: 0,
      });
    }
    if (typeof p.surf_ha === 'number') {
      map.get(fill)!.surf_ha += p.surf_ha;
    }
  }
  return Array.from(map.values());
}

function MiniLegend({
  zones,
  selectedElement,
}: {
  zones: ZoneFeature[];
  selectedElement: string | null;
}) {
  if (zones.length === 0 || selectedElement === null) return null;

  const entries = buildLegendEntries(zones);
  const dosed = entries.filter(e => e.dose !== null);
  const avgDose = dosed.length > 0
    ? Math.round(dosed.reduce((s, e) => s + e.dose!, 0) / dosed.length)
    : null;
  const totalArea = entries.reduce((s, e) => s + e.surf_ha, 0);
  const title = `${ELEMENT_LABELS[selectedElement] ?? selectedElement} · kg/ha`;

  const statParts: string[] = [];
  if (avgDose !== null) statParts.push(`moy ${avgDose} kg/ha`);
  if (totalArea > 0)    statParts.push(`${totalArea.toFixed(2)} ha`);

  return (
    <View style={styles.miniLegend}>
      <Text style={styles.miniLegendTitle}>{title}</Text>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        style={styles.legendScroll}>
        {entries.map(entry => (
          <View key={entry.fillColor} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: entry.fillColor }]} />
            <Text style={styles.legendLabel}>{entry.label}</Text>
            {entry.dose !== null && (
              <Text style={styles.legendDose}>{entry.dose}</Text>
            )}
          </View>
        ))}
      </ScrollView>
      {(statParts.length > 0) && (
        <>
          <View style={styles.legendDivider} />
          <Text style={styles.legendStats} numberOfLines={2}>
            {statParts.join(' · ')}
            {statParts.length > 0 ? ' · ' : ''}
            <Text style={styles.legendInfoLink}>ℹ détails</Text>
          </Text>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Panneau rétractable bas
// ─────────────────────────────────────────────────────────────────────────────

interface AccordionState {
  engrais: boolean;
  semis: boolean;
}

const ENGRAIS_PILLS: { label: string; code: string }[] = [
  { label: 'phosphore', code: 'P' },
  { label: 'potassium', code: 'K' },
  { label: 'magnésie', code: 'MG' },
];

interface BottomPanelProps {
  bottomInset: number;
  selectedElement: string | null;
  onSelectElement: (code: string | null) => void;
  collapseSignal: number;
}

function BottomPanel({ bottomInset, selectedElement, onSelectElement, collapseSignal }: BottomPanelProps) {
  const safeBottom = bottomInset > 0 ? bottomInset : 8;
  const animH = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const expandedHRef = useRef(0);

  const arrowDeg = arrowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  useEffect(() => {
    if (collapseSignal === 0 || !isOpenRef.current) return;
    isOpenRef.current = false;
    setIsOpen(false);
    Animated.parallel([
      Animated.timing(animH, { toValue: 0, duration: 320, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: false }),
      Animated.timing(arrowAnim, { toValue: 0, duration: 320, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: false }),
    ]).start();
  }, [collapseSignal]);

  const handleContentSize = (_w: number, h: number) => {
    // h = hauteur naturelle du contenu ScrollView (inclut paddingBottom: safeBottom)
    // +1 pour le panelDivider au-dessus de la ScrollView
    const newH = Math.ceil(h) + 1;
    expandedHRef.current = newH;
    if (isOpenRef.current) {
      Animated.timing(animH, {
        toValue: newH,
        duration: 200,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }).start();
    }
  };

  const togglePanel = () => {
    const next = !isOpen;
    isOpenRef.current = next;
    setIsOpen(next);
    Animated.parallel([
      Animated.timing(animH, {
        toValue: next ? expandedHRef.current : 0,
        duration: 320,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(arrowAnim, {
        toValue: next ? 1 : 0,
        duration: 320,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
    ]).start();
  };

  const [acc, setAcc] = useState<AccordionState>({
    engrais: true,
    semis: false,
  });

  const toggleAcc = (key: keyof AccordionState) =>
    setAcc(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePill = (code: string) =>
    onSelectElement(selectedElement === code ? null : code);

  return (
    <View style={styles.panel}>
      <Pressable style={styles.panelHeader} onPress={togglePanel}>
        <Text style={styles.panelTitle}>Carte à visualiser</Text>
        <Animated.View style={{ transform: [{ rotate: arrowDeg }] }}>
          <Ionicons name="chevron-up-outline" size={22} color="#555" />
        </Animated.View>
      </Pressable>

      <Animated.View
        style={{ height: animH, overflow: 'hidden' }}
        pointerEvents={isOpen ? 'auto' : 'none'}>
        <View style={styles.panelDivider} />

        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={handleContentSize}
          contentContainerStyle={[styles.panelScrollContent, { paddingBottom: safeBottom }]}>

          <AccordionSection
            title="ENGRAIS"
            isOpen={acc.engrais}
            onToggle={() => toggleAcc('engrais')}>
            <View style={styles.pillsRow}>
              {ENGRAIS_PILLS.map(({ label, code }) => {
                const active = selectedElement === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() => handlePill(code)}
                    style={({ pressed }) => [
                      styles.pill,
                      active && styles.pillActive,
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </AccordionSection>

          <View style={styles.panelDivider} />

          <AccordionSection
            title="SEMIS"
            isOpen={acc.semis}
            onToggle={() => toggleAcc('semis')}>
            <View style={styles.pillsRow}>
              {(() => {
                const active = selectedElement === 'S';
                return (
                  <Pressable
                    onPress={() => handlePill('S')}
                    style={({ pressed }) => [
                      styles.pill,
                      active && styles.pillActive,
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      semis
                    </Text>
                  </Pressable>
                );
              })()}
            </View>
          </AccordionSection>

        </ScrollView>
      </Animated.View>
    </View>
  );
}

function AccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Pressable
        style={({ pressed }) => [
          styles.accHeader,
          pressed && { opacity: 0.7 },
        ]}
        onPress={onToggle}>
        <Text style={styles.accTitle}>{title}</Text>
        <Ionicons
          name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16}
          color="#D32F2F"
        />
      </Pressable>
      {isOpen && <View style={styles.accBody}>{children}</View>}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Écran principal
// ─────────────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const { loading: loadingHello, execute: executeHelloWorld } = useApi(helloWorld);
  const [loadingParcelles, setLoadingParcelles] = useState(false);
  const [features, setFeatures] = useState<ParcelleFeature[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneFeature[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);

  useEffect(() => {
    setLoadingParcelles(true);
    getParcelles()
      .then(data => {
        if (data.features.length > 0) {
          setFeatures(data.features);
          const region = computeRegion(data.features);
          if (region) {
            setTimeout(() => mapRef.current?.animateToRegion(region, 800), 300);
          }
        }
      })
      .catch((err: unknown) => {
        Alert.alert(
          'Erreur',
          `Impossible de charger les parcelles : ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      })
      .finally(() => setLoadingParcelles(false));
  }, []);

  const filteredParcelles = features
    .map((f, i) => ({ index: i, nom: f.properties?.nom_parcel ?? 'Sans nom' }))
    .filter(({ nom }) =>
      query.length === 0 || nom.toLowerCase().includes(query.toLowerCase()),
    );

  useEffect(() => {
    if (selectedId === null || selectedElement === null || features.length === 0) {
      setZones([]);
      return;
    }
    const feature = features[selectedId];
    const idParcel =
      feature.properties?.id_parcel ?? feature.properties?.id ?? feature.id;
    console.log('[zones] id_parcel:', feature.properties?.id_parcel, '| id:', feature.properties?.id, '| feature.id:', feature.id, '→', idParcel, '| element:', selectedElement);
    if (idParcel == null) {
      setZones([]);
      return;
    }
    let cancelled = false;
    setZones([]);
    setLoadingZones(true);
    getZones(idParcel, selectedElement)
      .then(data => { if (!cancelled) setZones(data.features); })
      .catch((err: unknown) => {
        if (!cancelled) console.warn('[zones] Erreur:', err instanceof Error ? err.message : err);
      })
      .finally(() => { if (!cancelled) setLoadingZones(false); });
    return () => { cancelled = true; };
  }, [selectedId, selectedElement, features]);

  const handleSelect = (index: number, nom: string) => {
    Keyboard.dismiss();
    setSelectedId(index);
    setQuery(nom);
    setDropdownOpen(false);
    setSelectedElement(prev => prev ?? 'P');
    setCollapseSignal(s => s + 1);
    setZones([]);
    const region = computeRegion([features[index]]);
    if (region) {
      mapRef.current?.animateToRegion(region, 600);
    }
  };

  const handleReset = () => {
    Keyboard.dismiss();
    setSelectedId(null);
    setQuery('');
    setDropdownOpen(false);
    setZones([]);
    const region = computeRegion(features);
    if (region) {
      mapRef.current?.animateToRegion(region, 600);
    }
  };

  const handleSelectElement = (code: string | null) => {
    setSelectedElement(code);
    if (code !== null && selectedId === null) {
      Alert.alert(
        'Aucune parcelle sélectionnée',
        'Sélectionnez d\'abord une parcelle pour afficher cette carte.',
        [{
          text: 'Choisir une parcelle',
          onPress: () => {
            setDropdownOpen(true);
            searchInputRef.current?.focus();
          },
        }],
      );
    }
  };

  const handleIconPress = async (id: string) => {
    if (id !== 'login') return;
    try {
      const { data, error } = await executeHelloWorld();
      if (error) {
        Alert.alert('Erreur', error);
      } else if (data) {
        Alert.alert('Succès', data.message);
      }
    } catch (e: unknown) {
      Alert.alert('Exception', e instanceof Error ? e.message : String(e));
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFallback}>
        <Text style={styles.webText}>
          La carte est disponible sur iOS et Android
        </Text>
      </View>
    );
  }

  const loading = loadingHello || loadingParcelles || loadingZones;
  const searchTop = insets.top + 10;
  const iconBarTop = searchTop + 54;

  return (
    <View style={styles.container}>
      {/* ── 1. Carte plein écran ─────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={DEFAULT_REGION}
        mapType="none">
        <UrlTile urlTemplate={IGN_ORTHO_URL} maximumZ={19} zIndex={-1} />
        {features.flatMap((feature, fi) => {
          const nom = feature.properties?.nom_parcel ?? 'Sans nom';
          const selected = fi === selectedId;
          const polygonProps = {
            fillColor: 'transparent',
            strokeColor: selected ? '#FFD700' : '#888888',
            strokeWidth: selected ? 3 : 1.5,
            tappable: true,
            onPress: () => handleSelect(fi, nom),
          };
          if (feature.geometry?.type === 'Polygon') {
            return [
              <Polygon
                key={fi}
                coordinates={feature.geometry.coordinates[0].map(coord => ({
                  latitude: coord[1],
                  longitude: coord[0],
                }))}
                {...polygonProps}
              />,
            ];
          }
          if (feature.geometry?.type === 'MultiPolygon') {
            return feature.geometry.coordinates.map((polygon, pi) => (
              <Polygon
                key={`${fi}-${pi}`}
                coordinates={polygon[0].map(coord => ({
                  latitude: coord[1],
                  longitude: coord[0],
                }))}
                {...polygonProps}
              />
            ));
          }
          return [];
        })}

        {zones.flatMap((zone, zi) => {
          const { fillColor, strokeColor, strokeWidth } = getZoneStyle(zone);
          if (zone.geometry?.type === 'Polygon') {
            return [
              <Polygon
                key={`zone-${zi}`}
                coordinates={zone.geometry.coordinates[0].map(coord => ({
                  latitude: coord[1],
                  longitude: coord[0],
                }))}
                fillColor={fillColor}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
              />,
            ];
          }
          if (zone.geometry?.type === 'MultiPolygon') {
            return zone.geometry.coordinates.map((polygon, pi) => (
              <Polygon
                key={`zone-${zi}-${pi}`}
                coordinates={polygon[0].map(coord => ({
                  latitude: coord[1],
                  longitude: coord[0],
                }))}
                fillColor={fillColor}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
              />
            ));
          }
          return [];
        })}
      </MapView>

      {/* ── Overlay fermeture dropdown au clic sur la carte ───────────── */}
      {dropdownOpen && (
        <Pressable
          style={styles.dropdownOverlay}
          onPress={() => setDropdownOpen(false)}
        />
      )}

      {/* ── 2. Barre de recherche ─────────────────────────────────────── */}
      <SearchBar
        topOffset={searchTop}
        query={query}
        onQueryChange={text => {
          setQuery(text);
          setDropdownOpen(true);
        }}
        onFocus={() => setDropdownOpen(true)}
        onGpsPress={handleReset}
        filteredParcelles={filteredParcelles}
        dropdownOpen={dropdownOpen}
        onSelectParcelle={handleSelect}
        inputRef={searchInputRef}
      />

      {/* ── 3. Barre d'icônes droite ──────────────────────────────────── */}
      <RightIconBar
        topOffset={iconBarTop}
        onPressIcon={handleIconPress}
        hasZones={zones.length > 0}
      />

      {/* ── Indicateur de chargement ──────────────────────────────────── */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      )}

      {/* ── Mini légende zones ────────────────────────────────────────── */}
      <MiniLegend zones={zones} selectedElement={selectedElement} />

      {/* ── 5. Panneau rétractable bas ────────────────────────────────── */}
      <BottomPanel
        bottomInset={insets.bottom}
        selectedElement={selectedElement}
        onSelectElement={handleSelectElement}
        collapseSignal={collapseSignal}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.13,
  shadowRadius: 8,
  elevation: 8,
} as const;

const styles = StyleSheet.create({
  // ── Layout ─────────────────────────────────────────────────────────────────
  container: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f8',
  },
  webText: { fontSize: 16, color: '#444' },

  // ── 2. Search bar + dropdown ───────────────────────────────────────────────
  searchBarWrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 100,
  },
  searchBar: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
    ...SHADOW,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    backgroundColor: 'transparent',
  },
  gpsBtn: {
    padding: 2,
  },
  dropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 6,
    maxHeight: 220,
    overflow: 'hidden',
    ...SHADOW,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  dropdownItemPressed: {
    backgroundColor: '#F5F5F5',
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },

  // ── 3. Barre d'icônes droite ───────────────────────────────────────────────
  iconBar: {
    position: 'absolute',
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 100,
    ...SHADOW,
  },
  iconBtn: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  iconBtnPressed: {
    opacity: 0.55,
  },

  // ── 4. Panneau bas ─────────────────────────────────────────────────────────
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 100,
    ...SHADOW,
    shadowOffset: { width: 0, height: -3 },
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 0.2,
  },
  panelDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 0,
  },
  panelScrollContent: {
    paddingTop: 2,
    paddingBottom: 12,
  },

  // ── Accordéon ──────────────────────────────────────────────────────────────
  accHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  accTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
    letterSpacing: 1.4,
  },
  accBody: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },

  // ── Pills ──────────────────────────────────────────────────────────────────
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  pill: {
    backgroundColor: '#EEEEEE',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillActive: {
    backgroundColor: '#FF6B00',
  },
  pillText: {
    fontSize: 11,
    color: '#555',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyNote: {
    fontSize: 11,
    color: '#9E9E9E',
    fontStyle: 'italic',
    paddingTop: 2,
  },

  // ── Mini légende ───────────────────────────────────────────────────────────
  miniLegend: {
    position: 'absolute',
    bottom: 56,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 270,
    zIndex: 90,
    ...SHADOW,
  },
  legendScroll: {
    maxHeight: 220,
  },
  miniLegendTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  legendSwatch: {
    width: 13,
    height: 13,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.18)',
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: 11,
    color: '#444',
    flex: 1,
  },
  legendDose: {
    fontSize: 10,
    color: '#666',
    flexShrink: 0,
  },
  legendDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D0D0D0',
    marginVertical: 5,
  },
  legendStats: {
    fontSize: 10,
    color: '#666',
    lineHeight: 15,
  },
  legendInfoLink: {
    color: '#1a3a5c',
    fontWeight: '700',
  },
});
