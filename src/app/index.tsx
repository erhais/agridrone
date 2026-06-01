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
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Dimensions,
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
  getParcelleDetails,
  getFormulaireEngrais,
  getZoneEngraisDetail,
  patchZoneEngrais,
  getSemisCulture,
  getSemisDefaults,
  postFormulaireEngrais,
  helloWorld,
  type ParcelleFeature,
  type ZoneDetail,
  type ZoneDetailProperties,
  type ParcelleStats,
  type Prelevement,
} from '../services/agridroneService';
import { apiService } from '../services/api';
import FormulaireEngrais, { type FormulaireData } from '../components/FormulaireEngrais';
import LoginModal, { clearSession } from '../components/LoginModal';
import { loadToken } from '../services/authService';
import SelectionCultureSemis, { type CultureSelection } from '../components/SelectionCultureSemis';
import FormulaireSemisBetterave, { type SemisBetteraveData } from '../components/FormulaireSemisBetterave';
import FormulaireZoneEngrais, { type ZoneEngraisData } from '../components/FormulaireZoneEngrais';
import FormulaireSemisBle from '../components/FormulaireSemisBle';
import { type SemisFormResponse } from '../services/agridroneService';
import MapView, { Circle, Marker, Polygon, UrlTile, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
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

function getZoneDetailStyle(zone: ZoneDetail): {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
} {
  const style = zone.style;
  if (!style) {
    return { fillColor: hexToRgba('#CCCCCC', 0.5), strokeColor: '#232323', strokeWidth: 1 };
  }
  return {
    fillColor: hexToRgba(style.fillColor, style.fillOpacity),
    strokeColor: style.dashArray != null ? hexToRgba(style.strokeColor, 0.5) : style.strokeColor,
    strokeWidth: style.strokeWidth,
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

function computeRegion(features: ParcelleFeature[], padding = 1.2): Region | null {
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
    latitudeDelta: Math.max((bbox.maxLat - bbox.minLat) * padding, 0.01),
    longitudeDelta: Math.max((bbox.maxLng - bbox.minLng) * padding, 0.01),
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
  { id: 'logout',     lib: 'ion', name: 'log-out-outline' },
  { id: 'geolocate',  lib: 'ion', name: 'navigate-outline' },
  { id: 'pin',        lib: 'ion', name: 'location-outline' },
  { id: 'doses',      lib: 'ion', name: 'pricetag-outline' },
  { id: 'attributs',  lib: 'ion', name: 'create-outline' },
  { id: 'formulaire', lib: 'ion', name: 'document-text-outline' },
  { id: 'tractor',    lib: 'mci', name: 'tractor' },
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
  pinActive = false,
  dosesActive = false,
  editActive = false,
  geolocateActive = false,
  visibleIds,
}: {
  topOffset: number;
  onPressIcon?: (id: string) => void;
  hasZones?: boolean;
  pinActive?: boolean;
  dosesActive?: boolean;
  editActive?: boolean;
  geolocateActive?: boolean;
  visibleIds?: string[];
}) {
  const icons = visibleIds ? RIGHT_ICONS.filter(i => visibleIds.includes(i.id)) : RIGHT_ICONS;
  return (
    <View style={[styles.iconBar, { top: topOffset }]}>
      {icons.map((item, index) => {
        const active = (item.id === 'info' && hasZones)
          || (item.id === 'pin' && pinActive)
          || (item.id === 'doses' && dosesActive)
          || (item.id === 'attributs' && editActive)
          || (item.id === 'geolocate' && geolocateActive);
        return (
          <Pressable
            key={item.id}
            onPress={() => onPressIcon?.(item.id)}
            style={({ pressed }) => [
              styles.iconBtn,
              item.bg ? { backgroundColor: item.bg } : null,
              index > 0 &&
                !item.bg &&
                !icons[index - 1].bg && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: '#EEEEEE',
                },
              pressed && styles.iconBtnPressed,
            ]}>
            <View style={active ? styles.iconHalo : undefined}>
              <Icon
                lib={item.lib}
                name={item.name}
                size={item.id === 'tractor' ? 28 : 24}
                color={
                  item.id === 'tractor' ? '#2E7D32'
                  : active ? '#2E7D32'
                  : (item.color ?? '#546E7A')
                }
              />
            </View>
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
  id: string | number;
  fillColor: string;
  label: string;
  dose: number | null;
  teneur: number | null;
  surf_ha: number;
}

const LABEL_FIELDS_ENGRAIS = [
  'label', 'libelle', 'classe', 'class_name', 'description', 'nom',
] as const;

const LABEL_FIELDS_SEMIS = [
  'id_type_sol', 'label', 'type_sol', 'nom_sol', 'libelle_sol',
  'libelle', 'description', 'sol', 'classe', 'nom',
] as const;

function resolveLabel(p: ZoneDetailProperties, element: string): string {
  // Engrais avec id_class valide : pas de label texte, la valeur est dans la colonne
  if (ENGRAIS_ELEMENTS.has(element) && p.id_class != null && p.id_class > 0) {
    return '';
  }
  // Semis : chercher le libellé du type de sol
  const fields = LABEL_FIELDS_SEMIS;
  for (const field of fields) {
    const v = p[field];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  if (p.id_sol != null) return `Sol ${p.id_sol}`;
  return '—';
}

const ENGRAIS_ELEMENTS = new Set(['P', 'K', 'MG']);

function buildLegendEntries(zones: ZoneDetail[], element: string): LegendEntry[] {
  const map = new Map<string | number, LegendEntry>();
  for (const zone of zones) {
    const p = zone.properties;
    const fillColor = zone.style?.fillColor ?? '#CCCCCC';

    if (!p) {
      if (!map.has('__no_props__')) {
        map.set('__no_props__', {
          id: '__no_props__',
          fillColor,
          label: ENGRAIS_ELEMENTS.has(element) ? 'Teneur —' : 'Sol —',
          dose: null,
          teneur: null,
          surf_ha: 0,
        });
      }
      continue;
    }

    let key: string | number;
    if (ENGRAIS_ELEMENTS.has(element) && p.id_class != null && p.id_class > 0) {
      key = p.id_class;
    } else if (!ENGRAIS_ELEMENTS.has(element) && p.id_type_sol != null) {
      key = `type_${p.id_type_sol}`;
    } else if (p.id_sol != null) {
      key = `sol_${p.id_sol}`;
    } else {
      key = fillColor;
    }

    const parseDose = (raw: unknown): number | null => {
      const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : null;
      return v !== null && !isNaN(v) && v >= 0 ? v : null;
    };
    const parseTeneur = (raw: unknown): number | null => {
      const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : null;
      return v !== null && !isNaN(v) && v > 0 ? v : null;
    };

    if (!map.has(key)) {
      map.set(key, {
        id: key,
        fillColor,
        label: resolveLabel(p, element),
        dose: parseDose(p.dose),
        teneur: parseTeneur(p.teneur),
        surf_ha: 0,
      });
    } else {
      const entry = map.get(key)!;
      if (entry.dose === null) entry.dose = parseDose(p.dose);
      if (entry.teneur === null) entry.teneur = parseTeneur(p.teneur);
    }
    if (typeof p.surface === 'number') {
      map.get(key)!.surf_ha += p.surface;
    }
  }
  const entries = Array.from(map.values());
  if (ENGRAIS_ELEMENTS.has(element)) {
    entries.sort((a, b) => {
      if (a.teneur === null) return 1;
      if (b.teneur === null) return -1;
      return a.teneur - b.teneur;
    });
  }
  return entries;
}

function MiniLegend({
  zones,
  selectedElement,
  stats,
  expanded,
  onToggle,
  cultureName,
  cultureId,
}: {
  zones: ZoneDetail[];
  selectedElement: string | null;
  stats: ParcelleStats | null;
  expanded: boolean;
  onToggle: () => void;
  cultureName?: string | null;
  cultureId?: number | null;
}) {

  if (zones.length === 0 || selectedElement === null) return null;

  const entries = buildLegendEntries(zones, selectedElement);
  const isSemis = selectedElement === 'S';
  const hasCulture = isSemis && cultureName && cultureName.length > 0;
  // Betterave (id=3) : graines/ha — toutes les autres céréales : kg/q
  const SEMIS_GRAINS_IDS = new Set([3]);
  const isGrainCount = isSemis && cultureId != null && SEMIS_GRAINS_IDS.has(cultureId);
  const semisUnit = isGrainCount ? 'Nbre gr/ha' : 'kg/q';
  const useDose = (stats ? stats.dose_moyenne !== null : entries.some(e => e.dose !== null))
    && (!isSemis || !!hasCulture);
  const baseTitle = ELEMENT_LABELS[selectedElement] ?? selectedElement;
  const title = isSemis
    ? hasCulture
      ? `SEMIS · ${cultureName}${useDose ? ` · ${semisUnit}` : ''}`
      : 'SEMIS'
    : `${baseTitle}${useDose ? ' · kg/ha' : ''}`;
  const hasLabels = entries.some(e => e.label.length > 0);

  const statParts: string[] = [];
  if (stats) {
    const superficie = stats.superficie_parcelle > 0 ? stats.superficie_parcelle : stats.surface_totale;
    if (superficie > 0) statParts.push(`${superficie.toFixed(2)} ha`);
    if (useDose && stats.dose_moyenne !== null)
      statParts.push(isSemis
        ? `moy ${stats.dose_moyenne.toFixed(1)} ${semisUnit}`
        : `moy ${stats.dose_moyenne.toFixed(1)} kg/ha`);
    else if (!useDose && stats.teneur_moyenne !== null)
      statParts.push(`moy ${stats.teneur_moyenne.toFixed(1)} mg/kg`);
    if (stats.nombre_zones > 0) statParts.push(`${stats.nombre_zones} zones`);
  }

  const totalDose = (() => {
    const sum = entries.reduce((acc, e) =>
      e.dose !== null && e.surf_ha > 0 ? acc + e.dose * e.surf_ha : acc, 0);
    return sum > 0 ? sum : null;
  })();

  return (
    <View style={styles.miniLegend}>
      <Pressable style={styles.legendTitleRow} onPress={onToggle}>
        <Text style={styles.miniLegendTitle}>{title}</Text>
        <View style={styles.legendToggleBtn}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#fff"
          />
        </View>
      </Pressable>

      {expanded && (
        <>
          <View style={styles.legendRow}>
            <View style={styles.legendSwatchSpacer} />
            {hasLabels && <Text style={[styles.legendLabel, styles.legendColHeader]} />}
            {!isSemis && <Text style={styles.legendColHeader}>Teneur</Text>}
            <Text style={styles.legendColHeader}>
              {isSemis ? (isGrainCount ? 'Gr/ha' : 'kg/q') : 'Dose'}
            </Text>
          </View>
          <View style={styles.legendDivider} />
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={styles.legendScroll}>
            {entries.map(entry => (
              <View key={String(entry.id)} style={styles.legendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: entry.fillColor }]} />
                {hasLabels && <Text style={styles.legendLabel}>{entry.label}</Text>}
                {!isSemis && (
                  <Text style={styles.legendColValue}>
                    {entry.teneur !== null ? String(entry.teneur) : '—'}
                  </Text>
                )}
                <Text style={styles.legendColValue}>
                  {entry.dose !== null ? String(entry.dose) : '—'}
                </Text>
              </View>
            ))}
          </ScrollView>
          {statParts.length > 0 && (
            <>
              <View style={styles.legendDivider} />
              <Text style={styles.legendStats}>{statParts.join(' · ')}</Text>
            </>
          )}
          {totalDose !== null && (
            <>
              <View style={styles.legendDivider} />
              <Text style={styles.legendStatsBold}>
                {isSemis
                  ? (isGrainCount
                      ? `À épandre : ${(totalDose / 1_000_000).toFixed(2)} M gr/ha`
                      : `À épandre : ${Math.round(totalDose)} kg`)
                  : `À épandre : ${Math.round(totalDose)} kg`}
              </Text>
            </>
          )}
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
            onToggle={() => {
              const opening = !acc.engrais;
              toggleAcc('engrais');
              // Sélectionne phosphore par défaut si aucun engrais actif
              if (opening && !['P', 'K', 'MG'].includes(selectedElement ?? '')) {
                onSelectElement('P');
              }
            }}>
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
            onToggle={() => {
              const opening = !acc.semis;
              toggleAcc('semis');
              if (opening) onSelectElement('S');
              else if (selectedElement === 'S') onSelectElement(null);
            }}>
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
  const [zones, setZones] = useState<ZoneDetail[]>([]);
  const [parcelleStats, setParcelleStats] = useState<ParcelleStats | null>(null);
  const [parcelleDbId, setParcelleDbId] = useState<number | null>(null);
  const [formulaireId, setFormulaireId] = useState<number | null>(null);
  const [lastFormulaireData, setLastFormulaireData] = useState<FormulaireData | null>(null);
  const [loadingFormulaire, setLoadingFormulaire] = useState(false);
  const [selectionCultureVisible, setSelectionCultureVisible] = useState(false);
  const [semisCultureDefinie, setSemisCultureDefinie] = useState<CultureSelection | null>(null);
  const [formulaireSemisVisible, setFormulaireSemisVisible] = useState(false);
  const [prelevements, setPrelevements] = useState<Prelevement[]>([]);
  const [showPrelevements, setShowPrelevements] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [showDoseLabels, setShowDoseLabels] = useState(false);
  const [doseLabelTracksView, setDoseLabelTracksView] = useState(true);
  const [editZoneMode, setEditZoneMode] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [mapLatDelta, setMapLatDelta] = useState(10);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Vérifier le token JWT au démarrage (valide + non expiré)
  useEffect(() => {
    loadToken()
      .then(token => { if (token) setIsAuthenticated(true); })
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, []);
  const [selectedZoneIdx, setSelectedZoneIdx] = useState<number | null>(null);
  const [showEditHint, setShowEditHint] = useState(false);
  const [zoneFormVisible, setZoneFormVisible] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneDetail | null>(null);
  const [zoneEngraisDetail, setZoneEngraisDetail] = useState<import('../services/agridroneService').EngraisZoneDetail | null>(null);
  const [zoneAllowDosage, setZoneAllowDosage] = useState(false);
  const [zoneAllowRendement, setZoneAllowRendement] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const geoMsgOpacity = useRef(new Animated.Value(0)).current;
  const [formulaireVisible, setFormulaireVisible] = useState(false);
  const [loadingShapefile, setLoadingShapefile] = useState(false);
  const iconBarOpacity = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    Animated.timing(iconBarOpacity, {
      toValue: selectedId !== null ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [selectedId]);

  useEffect(() => {
    if (editZoneMode) {
      setShowEditHint(true);
      const t = setTimeout(() => setShowEditHint(false), 6000);
      return () => clearTimeout(t);
    } else {
      setShowEditHint(false);
    }
  }, [editZoneMode]);

  useEffect(() => {
    if (!isGeolocating) {
      geoMsgOpacity.setValue(0);
      return;
    }
    Animated.sequence([
      Animated.timing(geoMsgOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(4400),
      Animated.timing(geoMsgOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [isGeolocating]);

  // Passe tracksViewChanges à false après le rendu initial des étiquettes
  // pour éviter le recalcul de bounding box Android au toggle
  useEffect(() => {
    if (showDoseLabels) {
      setDoseLabelTracksView(true);
      const t = setTimeout(() => setDoseLabelTracksView(false), 600);
      return () => clearTimeout(t);
    } else {
      setDoseLabelTracksView(true);
    }
  }, [showDoseLabels]);

  // Redéclenche le cycle tracksViewChanges quand les zones changent
  // avec les étiquettes actives (changement d'élément)
  useEffect(() => {
    if (!showDoseLabels || zones.length === 0) return;
    setDoseLabelTracksView(true);
    const t = setTimeout(() => setDoseLabelTracksView(false), 600);
    return () => clearTimeout(t);
  }, [zones]);

  const filteredParcelles = features
    .map((f, i) => ({ index: i, nom: f.properties?.nom_parcel ?? 'Sans nom' }))
    .filter(({ nom }) =>
      query.length === 0 || nom.toLowerCase().includes(query.toLowerCase()),
    );

  useEffect(() => {
    if (selectedId === null || selectedElement === null || features.length === 0) {
      setZones([]);
      setParcelleStats(null);
      return;
    }
    const feature = features[selectedId];
    const idParcel =
      feature.properties?.id_parcel ?? feature.properties?.id ?? feature.id;

    if (idParcel == null) {
      setZones([]);
      setParcelleStats(null);
      return;
    }
    let cancelled = false;
    setZones([]);
    setParcelleStats(null);
    setLoadingZones(true);
    // Pour semis : récupérer aussi le nom de la culture
    if (selectedElement === 'S') {
      getSemisCulture(Number(idParcel))
        .then(async result => {
          if (!cancelled && result && result.id_culture > 0) {
            const defaults = await getSemisDefaults(Number(idParcel), result.id_culture);
            if (!cancelled && defaults?.nom) {
              setSemisCultureDefinie({ id: result.id_culture, nom: defaults.nom });
            }
          }
        })
        .catch(() => {});
    }

    getParcelleDetails(idParcel, selectedElement)
      .then(data => {
        if (!cancelled) {
          setZones(data.zones);
          setParcelleStats(data.stats);
          setParcelleDbId(data.parcelle.id);
          setPrelevements(data['prélevements'] ?? []);
        }
      })
      .catch((err: unknown) => {
        console.warn('[details] Erreur (cancelled=' + String(cancelled) + '):', err instanceof Error ? err.message : err);
      })
      .finally(() => { if (!cancelled) setLoadingZones(false); });
    return () => { cancelled = true; };
  }, [selectedId, selectedElement, features, reloadTrigger]);

  const handleSelect = (index: number, nom: string) => {
    Keyboard.dismiss();
    setSelectedId(index);
    setQuery(nom);
    setDropdownOpen(false);
    setSelectedElement(prev => prev ?? 'P');
    setCollapseSignal(s => s + 1);
    setZones([]);
    setPrelevements([]);
    setShowPrelevements(false);
    setShowDoseLabels(false);
    setEditZoneMode(false);
    setSelectedZoneIdx(null);
    setReloadTrigger(t => t + 1);
    const region = computeRegion([features[index]], 1.6);
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
    setParcelleStats(null);
    setParcelleDbId(null);
    setPrelevements([]);
    setShowPrelevements(false);
    setShowDoseLabels(false);
    setEditZoneMode(false);
    setSelectedZoneIdx(null);
    setLastFormulaireData(null);
    const region = computeRegion(features);
    if (region) {
      mapRef.current?.animateToRegion(region, 600);
    }
  };

  const centerOnParcelle = () => {
    if (selectedId === null) return;
    const region = computeRegion([features[selectedId]], 1.6);
    if (region) mapRef.current?.animateToRegion(region, 600);
  };

  const handleSemisSuccess = (result: SemisFormResponse) => {
    setFormulaireSemisVisible(false);
    centerOnParcelle();
    const dbId = parcelleDbId ?? Number(
      selectedId !== null
        ? (features[selectedId]?.properties?.id_parcel ??
           features[selectedId]?.properties?.id ??
           selectedId)
        : 0,
    );
    // Toujours recharger les zones pour avoir les doses à jour
    setLoadingZones(true);
    getParcelleDetails(dbId, 'S')
      .then(data => {
        setZones(data.zones);
        setParcelleStats(data.stats);
        setPrelevements(data['prélevements'] ?? []);
        setLegendExpanded(true);
        // Activer les étiquettes si des zones ont des doses
        const hasDoses = data.zones.some(
          z => z.properties?.dose != null && (z.properties.dose as number) >= 0,
        );
        if (hasDoses) setShowDoseLabels(true);
        if (result.doses_recalculees) {
          Alert.alert(
            'Semis enregistré ✅',
            `${result.zones_mises_a_jour} zone(s) mise(s) à jour\n${result.zones_dosage_manuel} zone(s) en dosage manuel`,
          );
        } else {
          Alert.alert('Succès', 'Semis enregistré ✅');
        }
      })
      .catch(() => Alert.alert('Succès', 'Semis enregistré ✅'))
      .finally(() => setLoadingZones(false));
  };

  const handleSelectElement = (code: string | null) => {
    setSelectedElement(code);
    if (code !== null) setCollapseSignal(s => s + 1);
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
    } else if (code !== null && selectedId !== null) {
      const region = computeRegion([features[selectedId]], 1.6);
      if (region) mapRef.current?.animateToRegion(region, 600);
    }
  };

  const legendEntries = zones.length > 0 && selectedElement
    ? buildLegendEntries(zones, selectedElement)
    : [];
  const formValuesValid = !lastFormulaireData || (
    parseFloat(lastFormulaireData.obj_rendement) > 0 &&
    parseFloat(lastFormulaireData.teneur_engrais) > 0
  );
  const allDosesSet = legendEntries.length > 0 && selectedId !== null &&
    formValuesValid &&
    legendEntries.every(e => e.dose !== null && e.dose >= 0);

  const handleTractorPress = async () => {
    if (selectedId === null) {
      Alert.alert('Erreur', 'Veuillez sélectionner une parcelle');
      return;
    }
    const dosedZones = zones.filter(z => {
      const raw = z.properties?.dose;
      const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : null;
      return v !== null && !isNaN(v);
    });
    if (dosedZones.length === 0) {
      Alert.alert('Erreur', 'Aucune dose disponible pour cette parcelle');
      return;
    }
    const nomParcelle = features[selectedId]?.properties?.nom_parcel ?? 'parcelle';
    const body = {
      nom_parcelle: nomParcelle,
      element: selectedElement,
      zones: dosedZones.map(z => ({
        geometry: z.geometry,
        dose: z.properties!.dose,
      })),
    };
    try {
      setLoadingShapefile(true);
      const buffer = await apiService.postArrayBuffer('/api/v1/parcelles/shapefile', body);
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const fileName = `${nomParcelle}_${selectedElement ?? 'zones'}_shapefile.zip`;
      const fileUri = (FileSystem.documentDirectory ?? '') + fileName;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/zip',
          dialogTitle: `Shapefile — ${nomParcelle}`,
        });
      } else {
        Alert.alert('Succès', `Fichier sauvegardé : ${fileName}`);
      }
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de générer le shapefile');
    } finally {
      setLoadingShapefile(false);
    }
  };

  const handleIconPress = (id: string) => {
    if (id === 'logout') {
      Alert.alert(
        'Déconnexion',
        'Voulez-vous vous déconnecter ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Se déconnecter',
            style: 'destructive',
            onPress: () => {
              void clearSession().then(() => setIsAuthenticated(false));
            },
          },
        ],
      );
      return;
    }
    if (id === 'geolocate') {
      if (isGeolocating) {
        locationSubRef.current?.remove();
        locationSubRef.current = null;
        setIsGeolocating(false);
        setUserLocation(null);
        return;
      }
      void (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission refusée', 'Activez la localisation dans les réglages.');
          return;
        }
        setIsGeolocating(true);
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5 },
          loc => {
            const pos = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? 10,
            };
            setUserLocation(pos);
            // Centrer uniquement au premier fix
            if (!locationSubRef.current) return;
            mapRef.current?.animateToRegion({
              ...pos,
              latitudeDelta: 0.0008,
              longitudeDelta: 0.0008,
            }, 800);
          },
        );
        locationSubRef.current = sub;
      })();
    }
    if (id === 'pin') setShowPrelevements(v => !v);
    if (id === 'doses') setShowDoseLabels(v => !v);
    if (id === 'attributs') {
      setEditZoneMode(v => {
        if (v) setSelectedZoneIdx(null); // reset sélection à la désactivation
        return !v;
      });
    }
    if (id === 'tractor') void handleTractorPress();
    if (id === 'formulaire') {
      if (selectedId === null || selectedElement === null) return;

      // Semis : vérifier si culture déjà définie
      if (selectedElement === 'S') {
        const dbId = parcelleDbId ?? Number(
          features[selectedId]?.properties?.id_parcel ??
          features[selectedId]?.properties?.id ??
          selectedId,
        );
        setLoadingFormulaire(true);
        getSemisCulture(dbId)
          .then(result => {
            setSemisCultureDefinie(
              result ? { id: result.id_culture, nom: '' } : null,
            );
            setSelectionCultureVisible(true);
          })
          .finally(() => setLoadingFormulaire(false));
        return;
      }

      const dbId = parcelleDbId ?? Number(
        features[selectedId]?.properties?.id_parcel ??
        features[selectedId]?.properties?.id ??
        selectedId,
      );
      setLoadingFormulaire(true);
      getFormulaireEngrais(dbId, selectedElement)
        .then(existing => {
          if (existing) {
            setFormulaireId(existing.id);
            setLastFormulaireData({
              annee_recolte: String(existing.annee_recolte),
              id_culture: existing.id_culture,
              double_culture: existing.double_culture,
              id_engrais_frequence: existing.id_engrais_frequence,
              obj_rendement: String(existing.obj_rendement),
              rendement_specifique_zone: existing.rendement_specifique_zone,
              teneur_engrais: String(existing.teneur_engrais),
              dosage_manuel_zone: existing.dosage_manuel_zone,
              qte_deja_apportee: String(existing.qte_deja_apportee),
              paille: existing.paille,
              visible_plan_fumure: existing.visible_plan_fumure,
            });
          } else {
            setLastFormulaireData(null);
          }
        })
        .finally(() => {
          setLoadingFormulaire(false);
          setFormulaireVisible(true);
        });
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

  const loading = loadingHello || loadingParcelles || loadingZones || loadingShapefile || loadingFormulaire;
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
        mapType="none"
        onRegionChange={r => setMapLatDelta(r.latitudeDelta)}>
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
          const { fillColor, strokeColor, strokeWidth } = getZoneDetailStyle(zone);
          const isSelected = editZoneMode && selectedZoneIdx === zi;
          const zFill   = isSelected ? 'rgba(255,0,0,0.4)' : fillColor;
          const zStroke = isSelected ? '#FF0000' : strokeColor;
          const zWidth  = isSelected ? 2.5 : strokeWidth;
          const onPressZone = editZoneMode
            ? () => {
                setSelectedZoneIdx(prev => prev === zi ? null : zi);
                setSelectedZone(zone);
                const numZone = zone.num_zone ?? (zi + 1);
                const fert = selectedElement ?? 'P';
                const sidx = selectedId ?? 0;
                const dbId = parcelleDbId ?? Number(
                  features[sidx]?.properties?.id_parcel ??
                  features[sidx]?.properties?.id ??
                  sidx,
                );
                setLoadingZones(true);
                Promise.all([
                  getZoneEngraisDetail(numZone, fert),
                  getFormulaireEngrais(dbId, fert),
                ])
                  .then(([detail, formData]) => {
                    setZoneEngraisDetail(detail);
                    const dosage = formData?.dosage_manuel_zone
                      ?? lastFormulaireData?.dosage_manuel_zone
                      ?? false;
                    const rend = formData?.rendement_specifique_zone
                      ?? lastFormulaireData?.rendement_specifique_zone
                      ?? false;
                    console.log('[zone-auth] allowDosage:', dosage, '| allowRend:', rend, '| formData:', formData?.dosage_manuel_zone, formData?.rendement_specifique_zone);
                    setZoneAllowDosage(dosage);
                    setZoneAllowRendement(rend);
                    setZoneFormVisible(true);
                  })
                  .finally(() => setLoadingZones(false));
              }
            : undefined;

          if (zone.geometry?.type === 'Polygon') {
            return [
              <Polygon
                key={`zone-${zi}`}
                coordinates={zone.geometry.coordinates[0].map(coord => ({
                  latitude: coord[1],
                  longitude: coord[0],
                }))}
                fillColor={zFill}
                strokeColor={zStroke}
                strokeWidth={zWidth}
                tappable={editZoneMode}
                onPress={onPressZone}
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
                fillColor={zFill}
                strokeColor={zStroke}
                strokeWidth={zWidth}
                tappable={editZoneMode}
                onPress={onPressZone}
              />
            ));
          }
          return [];
        })}

        {showPrelevements && prelevements.map((p, pi) => (
          <Marker
            key={`prel-${pi}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            anchor={{ x: 0.5, y: 0 }}
            tracksViewChanges={true}>
            <View style={styles.markerWrapper}>
              <View style={styles.markerDot} />
              <View style={styles.markerLabelBg}>
                <Text style={styles.markerLabelText}>{p.nom}</Text>
              </View>
            </View>
          </Marker>
        ))}

        {/* ── Position utilisateur ─────────────────────────────────────── */}
        {userLocation && (
          <>
            <Circle
              center={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
              radius={userLocation.accuracy}
              fillColor="rgba(0,95,255,0.08)"
              strokeColor="rgba(0,95,255,0.5)"
              strokeWidth={1}
            />
            <Marker
              coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={true}>
              <View style={styles.userLocationDot}>
                <View style={styles.userLocationInner} />
              </View>
            </Marker>
          </>
        )}

        {/* ── Étiquettes doses (déduplication anti-chevauchement) ──────── */}
        {showDoseLabels && (() => {
          const { height: screenH } = Dimensions.get('window');
          // Seuil en degrés : ~60px en coordonnées carte
          const threshold = mapLatDelta * (60 / screenH);
          const placed: { lat: number; lng: number }[] = [];
          return zones.map((zone, zi) => {
            const dose = zone.properties?.dose;
            const c = zone.centroid;
            if (!c || dose == null || (dose as number) < 0) return null;
            // Vérifier si trop proche d'une étiquette déjà placée
            const tooClose = placed.some(p =>
              Math.abs(p.lat - c.lat) < threshold &&
              Math.abs(p.lng - c.lng) < threshold * 1.5,
            );
            if (tooClose) return null;
            placed.push({ lat: c.lat, lng: c.lng });
            const v = Number(dose);
            const doseStr = v >= 10 ? Math.round(v).toString() : v.toFixed(2);
            return (
              <Marker
                key={`dose-label-${zi}`}
                coordinate={{ latitude: c.lat, longitude: c.lng }}
                tracksViewChanges={doseLabelTracksView}>
                <Text style={styles.doseLabelText} allowFontScaling={false}>{doseStr}</Text>
              </Marker>
            );
          });
        })()}
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
        onFocus={() => { setQuery(''); setDropdownOpen(true); }}
        onGpsPress={handleReset}
        filteredParcelles={filteredParcelles}
        dropdownOpen={dropdownOpen}
        onSelectParcelle={handleSelect}
        inputRef={searchInputRef}
      />

      {/* ── 3. Barre d'icônes droite ──────────────────────────────────── */}
      <Animated.View
        style={{ opacity: 1 }}
        pointerEvents="box-none">
        <RightIconBar
          topOffset={iconBarTop}
          onPressIcon={handleIconPress}
          hasZones={zones.length > 0}
          pinActive={showPrelevements}
          dosesActive={showDoseLabels}
          editActive={editZoneMode}
          geolocateActive={isGeolocating}
          visibleIds={[
            'logout',
            'geolocate',
            ...(prelevements.length > 0 ? ['pin'] : []),
            ...(allDosesSet ? ['tractor'] : []),
            ...(zones.length > 0 ? ['doses', 'attributs'] : []),
            'formulaire',
          ]}
        />
      </Animated.View>

      {/* ── Indicateur de chargement ──────────────────────────────────── */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      )}

      {/* ── Message géolocalisation ──────────────────────────────────── */}
      <Animated.View
        style={[styles.geoMsg, { opacity: geoMsgOpacity }]}
        pointerEvents="none">
        <Ionicons name="navigate" size={13} color="#fff" />
        <Text style={styles.geoMsgText}>Géolocalisation activée</Text>
      </Animated.View>

      {/* ── Message mode édition zone ────────────────────────────────── */}
      {editZoneMode && selectedZoneIdx === null && showEditHint && (
        <View style={styles.editZoneHint} pointerEvents="none">
          <Ionicons name="create-outline" size={14} color="#fff" />
          <Text style={styles.editZoneHintText}>
            {selectedElement === 'S' && semisCultureDefinie?.nom
              ? `${semisCultureDefinie.nom} — Cliquer sur une zone de la parcelle`
              : 'Cliquer sur une zone de la parcelle'}
          </Text>
        </View>
      )}

      {/* ── Mini légende zones ────────────────────────────────────────── */}
      <MiniLegend
        zones={zones}
        selectedElement={selectedElement}
        stats={parcelleStats}
        expanded={legendExpanded}
        onToggle={() => setLegendExpanded(v => !v)}
        cultureName={selectedElement === 'S' ? (semisCultureDefinie?.nom ?? null) : null}
        cultureId={selectedElement === 'S' ? (semisCultureDefinie?.id ?? null) : null}
      />

      {/* ── 5. Panneau rétractable bas ────────────────────────────────── */}
      <BottomPanel
        bottomInset={insets.bottom}
        selectedElement={selectedElement}
        onSelectElement={handleSelectElement}
        collapseSignal={collapseSignal}
      />

      {/* ── Formulaire zone engrais ──────────────────────────────────── */}
      {selectedZone !== null && selectedId !== null && ENGRAIS_ELEMENTS.has(selectedElement ?? '') && (
        <FormulaireZoneEngrais
          visible={zoneFormVisible}
          zone={{
            id: selectedZone.id,
            num_zone: selectedZone.num_zone ?? (zones.indexOf(selectedZone) + 1),
            properties: selectedZone.properties ?? {},
            style: selectedZone.style ? { fillColor: selectedZone.style.fillColor } : undefined,
          }}
          parcelle={{
            id: parcelleDbId ?? Number(features[selectedId]?.properties?.id_parcel ?? selectedId),
            nom: features[selectedId]?.properties?.nom_parcel ?? 'Parcelle',
          }}
          rendementGlobal={lastFormulaireData ? parseFloat(lastFormulaireData.obj_rendement) : undefined}
          initialDetail={zoneEngraisDetail}
          allowDosageManuel={zoneAllowDosage}
          allowRendementSpec={zoneAllowRendement}
          onClose={() => setZoneFormVisible(false)}
          onRecopie={() => {
            setZoneFormVisible(false);
            Alert.alert('Recopie', 'Fonctionnalité à implémenter');
          }}
          onSave={async (data: ZoneEngraisData) => {
            const fert = selectedElement ?? 'P';
            const rendVal = data.perso_rendement && data.rendement > 0 ? data.rendement : null;
            const doseVal = data.perso_dose && data.dose >= 0 ? data.dose : null;
            if (rendVal !== null || doseVal !== null) {
              await patchZoneEngrais(data.num_zone, fert, {
                rendement: rendVal,
                dose: doseVal,
              });
            }
            setZoneFormVisible(false);
            Alert.alert('Succès', 'Zone enregistrée ✅');
          }}
        />
      )}

      {/* ── Sélection culture semis ───────────────────────────────────── */}
      <SelectionCultureSemis
        visible={selectionCultureVisible}
        parcelleName={
          selectedId !== null
            ? (features[selectedId]?.properties?.nom_parcel ?? 'Parcelle')
            : 'Parcelle'
        }
        initialCultureId={semisCultureDefinie?.id ?? null}
        onClose={() => setSelectionCultureVisible(false)}
        onSelect={culture => {
          setSemisCultureDefinie(culture);
          setSelectionCultureVisible(false);
          setFormulaireSemisVisible(true);
        }}
      />

      {/* ── Formulaires semis (selon culture) ────────────────────────── */}
      {selectedId !== null && semisCultureDefinie !== null && (() => {
        const parcelleSemis = {
          id: parcelleDbId ?? Number(
            features[selectedId]?.properties?.id_parcel ??
            features[selectedId]?.properties?.id ??
            selectedId,
          ),
          nom: features[selectedId]?.properties?.nom_parcel ?? 'Parcelle',
        };
        const sharedProps = {
          visible: formulaireSemisVisible,
          parcelle: parcelleSemis,
          idCulture: semisCultureDefinie.id,
          onClose: () => setFormulaireSemisVisible(false),
          onSuccess: handleSemisSuccess,
        };
        switch (semisCultureDefinie.id) {
          case 1:
          case 14:
          case 26:
          case 27:
          case 28: return <FormulaireSemisBle key="ble" {...sharedProps} />;
          case 3: return <FormulaireSemisBetterave key="betterave" {...sharedProps} cultureName={semisCultureDefinie.nom} />;
          default: return null;
        }
      })()}

      {/* ── Formulaire engrais ────────────────────────────────────────── */}
      {selectedId !== null && selectedElement !== null && (
        <FormulaireEngrais
          visible={formulaireVisible}
          parcelle={{
            id: Number(
              features[selectedId]?.properties?.id_parcel ??
              features[selectedId]?.properties?.id ??
              selectedId,
            ),
            nom: features[selectedId]?.properties?.nom_parcel ?? 'Parcelle',
          }}
          element={selectedElement}
          initialData={lastFormulaireData}
          onClose={() => setFormulaireVisible(false)}
          onSave={async (data: FormulaireData) => {
            try {
              const payload = {
                id_parcel: parcelleDbId ?? Number(
                  features[selectedId!]?.properties?.id_parcel ??
                  features[selectedId!]?.properties?.id ??
                  selectedId,
                ),
                element: selectedElement!,
                annee_recolte: parseInt(data.annee_recolte, 10),
                id_culture: data.id_culture,
                id_engrais_frequence: data.id_engrais_frequence,
                paille: data.paille,
                obj_rendement: parseInt(data.obj_rendement, 10),
                teneur_engrais: parseInt(data.teneur_engrais, 10),
                double_culture: data.double_culture,
                rendement_specifique_zone: data.rendement_specifique_zone,
                dosage_manuel_zone: data.dosage_manuel_zone,
                qte_deja_apportee: parseInt(data.qte_deja_apportee, 10),
                visible_plan_fumure: data.visible_plan_fumure,
              };
              const result = await postFormulaireEngrais(payload);
              setFormulaireId(result.id);
              setLastFormulaireData(data);
              setFormulaireVisible(false);
              centerOnParcelle();
              // Recharger les zones et activer les étiquettes doses
              const dbId = parcelleDbId ?? Number(
                features[selectedId!]?.properties?.id_parcel ??
                features[selectedId!]?.properties?.id ??
                selectedId,
              );
              getParcelleDetails(dbId, selectedElement!)
                .then(detail => {
                  setZones(detail.zones);
                  setParcelleStats(detail.stats);
                  setPrelevements(detail['prélevements'] ?? []);
                  setLegendExpanded(true);
                  const hasDoses = detail.zones.some(
                    z => z.properties?.dose != null && (z.properties.dose as number) >= 0,
                  );
                  if (hasDoses) setShowDoseLabels(true);
                })
                .catch(() => {});
              Alert.alert('Succès', 'Formulaire enregistré ✅');
            } catch (err: unknown) {
              Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible d\'enregistrer le formulaire');
            }
          }}
        />
      )}

      {/* ── Écran de connexion ────────────────────────────────────────── */}
      {sessionChecked && !isAuthenticated && (
        <LoginModal onSuccess={() => setIsAuthenticated(true)} />
      )}
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
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  iconBtnPressed: {
    opacity: 0.55,
  },
  iconHalo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(46,125,50,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(46,125,50,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 190,
    zIndex: 90,
    ...SHADOW,
  },
  legendScroll: {
    maxHeight: 220,
  },
  legendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  userLocationDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,100,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#005FFF',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#005FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 6,
  },
  geoMsg: {
    position: 'absolute',
    alignSelf: 'center',
    top: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,95,255,0.85)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    zIndex: 95,
  },
  geoMsgText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  editZoneHint: {
    position: 'absolute',
    alignSelf: 'center',
    top: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30,30,30,0.75)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 95,
  },
  editZoneHintText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  legendToggleBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#546E7A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLegendTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 0.8,
    flex: 1,
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
  legendSwatchSpacer: {
    width: 13,
    flexShrink: 0,
  },
  legendColHeader: {
    width: 40,
    fontSize: 10,
    color: '#444',
    textAlign: 'right',
    fontWeight: '700',
    flexShrink: 0,
  },
  legendColValue: {
    width: 40,
    fontSize: 10,
    color: '#555',
    textAlign: 'right',
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
  legendStatsBold: {
    fontSize: 10,
    color: '#333',
    fontWeight: '700',
    lineHeight: 15,
  },
  legendInfoLink: {
    color: '#1a3a5c',
    fontWeight: '700',
  },

  // ── Marqueurs prélèvements ─────────────────────────────────────────────────
  doseLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111111',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 4,
    borderRadius: 4,
  },
  markerWrapper: {
    width: 50,
    alignItems: 'center',
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FF6B00',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  markerLabelBg: {
    backgroundColor: '#FF6B00',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 3,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  markerLabelText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
    lineHeight: 13,
  },
});
