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
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Dimensions,
  Keyboard,
  Modal,
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
  getCultures,
  getTypeSol,
  helloWorld,
  type ParcelleFeature,
  type ZoneDetail,
  type ZoneDetailProperties,
  type ParcelleStats,
  type Prelevement,
  type ReferentielItem,
  type TypeSolItem,
} from '../services/agridroneService';
import { apiService, ApiError, registerSessionExpiredHandler, unregisterSessionExpiredHandler } from '../services/api';
import { config } from '../config/env';
import FormulaireEngrais, { type FormulaireData } from '../components/FormulaireEngrais';
import LoginModal, { clearSession } from '../components/LoginModal';
import { loadToken, refreshToken, fetchRepositoriesStored, getStoredCredentials, switchRepository, type AuthRepository } from '../services/authService';
import SelectionCultureSemis, { type CultureSelection } from '../components/SelectionCultureSemis';
import FormulaireSemisBetterave, { type SemisBetteraveData } from '../components/FormulaireSemisBetterave';
import FormulaireZoneEngrais, { type ZoneEngraisData } from '../components/FormulaireZoneEngrais';
import FormulaireZoneSemis from '../components/FormulaireZoneSemis';
import FormulaireZoneLibre from '../components/FormulaireZoneLibre';
import FormulaireSemisBle from '../components/FormulaireSemisBle';
import ReportCard, { type ReportProps } from '../components/ReportCard';
import { ZoneDoseBubble, type ZoneBubbleInfo } from '../components/ZoneDoseBubble';
import TracteurModeModal, { type TracteurMode } from '../components/TracteurModeModal';
import CalibrationModal, { type CalibrationResult } from '../components/CalibrationModal';
import AgriboxModal from '../components/AgriboxModal';
import { computeTargetSetting, formatSetting } from '../utils/calibrationUtils';
import { type SemisFormResponse } from '../services/agridroneService';
import {
  bearingDeg, bearingToCompass, distanceMeters,
  nearestOnBoundary, nudgeLatLng, pointInZoneGeometry, type LatLng,
} from '../utils/geoUtils';
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

// Au-delà de ce latitudeDelta (carte trop dézoomée), on masque les étiquettes de dose
// pour éviter l'encombrement. En dessous, elles s'affichent automatiquement.
const DOSE_LABELS_MAX_DELTA = 0.06;

// Palette des marqueurs de prélèvement : une couleur distincte par zone (num_zone).
// Tous les points d'une même zone partagent la même couleur.
const ZONE_MARKER_COLORS = [
  '#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA',
  '#00897B', '#3949AB', '#C0CA33', '#D81B60', '#6D4C41',
];
const PRELEV_DEFAULT_COLOR = '#FF6B00'; // repli si num_zone absent (back pas encore à jour)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers style zones
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgba(hex: string | null | undefined, opacity: number): string {
  if (!hex || typeof hex !== 'string') return `rgba(128,128,128,${opacity})`;
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
  const style = zone.style as ({ fillColor?: string; fillOpacity?: number; strokeColor?: string; color?: string; strokeWidth?: number; weight?: number; dashArray?: string | null } | null);
  if (!style) {
    return { fillColor: hexToRgba('#CCCCCC', 0.5), strokeColor: '#232323', strokeWidth: 1 };
  }
  const strokeColor = style.strokeColor ?? style.color ?? '#232323';
  const strokeWidth = style.strokeWidth ?? style.weight ?? 1;
  return {
    fillColor: hexToRgba(style.fillColor, style.fillOpacity ?? 0.75),
    strokeColor: style.dashArray != null ? hexToRgba(strokeColor, 0.5) : strokeColor,
    strokeWidth,
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

// Version de PDF.js chargée depuis un CDN dans la WebView du viewer d'analyses.
const PDFJS_VERSION = '3.11.174';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

/**
 * Construit une page HTML autonome qui rend un PDF (fourni en base64) avec PDF.js,
 * chaque page dessinée dans un canvas empilé verticalement (scroll + zoom natif WebView).
 * Utilisée pour un rendu identique du rapport d'analyse sur iOS et Android.
 */
function buildPdfViewerHtml(base64: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes" />
<style>
  html, body { margin:0; padding:0; height:100%; background:#1A1A1A; overflow:hidden; }
  /* Pagination horizontale : une page A4 par écran, glisser pour la suivante */
  #pages {
    display:flex; flex-direction:row; height:100vh;
    overflow-x:auto; overflow-y:hidden;
    scroll-snap-type:x mandatory;
    -webkit-overflow-scrolling:touch;
  }
  .slide {
    flex:0 0 100vw; width:100vw; height:100vh;
    display:flex; align-items:center; justify-content:center;
    scroll-snap-align:center; box-sizing:border-box; padding:8px;
    overflow-y:auto; -webkit-overflow-scrolling:touch;
  }
  .slide canvas { width:100%; height:auto; box-shadow:0 1px 8px rgba(0,0,0,0.5); background:#fff; }
  #counter {
    position:fixed; bottom:14px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.6); color:#fff; font-family:-apple-system,Roboto,sans-serif;
    font-size:13px; font-weight:600; padding:5px 12px; border-radius:14px; display:none;
  }
  #msg { color:#fff; font-family:-apple-system,Roboto,sans-serif; font-size:15px; text-align:center; padding:40px 20px; }
</style>
</head>
<body>
<div id="msg">Chargement du rapport…</div>
<div id="pages"></div>
<div id="counter"></div>
<script src="${PDFJS_CDN}/pdf.min.js"></script>
<script>
  var A4_RATIO = 297 / 210; // hauteur/largeur d'une A4 portrait
  var BASE64 = "${base64}";
  (function () {
    function fail() { document.getElementById('msg').textContent = "Impossible d'afficher le PDF."; }
    if (!window.pdfjsLib) { fail(); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS_CDN}/pdf.worker.min.js";
    try {
      var bin = atob(BASE64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
        var container = document.getElementById('pages');
        var counter = document.getElementById('counter');
        var dpr = window.devicePixelRatio || 1;
        var frameW = window.innerWidth - 16; // largeur utile (padding .slide)
        var slideCount = 0;

        function refreshCounter() {
          if (slideCount <= 1) return;
          counter.style.display = 'block';
          container.addEventListener('scroll', function () {
            var idx = Math.round(container.scrollLeft / window.innerWidth) + 1;
            if (idx < 1) idx = 1; if (idx > slideCount) idx = slideCount;
            counter.textContent = idx + ' / ' + slideCount;
          }, { passive:true });
          counter.textContent = '1 / ' + slideCount;
        }

        // Rend une page source, la découpe en colonnes A4 portrait (une A3 paysage = 2 A4),
        // chaque colonne ajustée à la largeur de l'écran = une page navigable.
        function renderPage(pageNum) {
          return pdf.getPage(pageNum).then(function (page) {
            var base = page.getViewport({ scale: 1 });
            // Nombre de colonnes A4 portrait tenant dans la page (A3 paysage → 2, A4 → 1)
            var cols = Math.max(1, Math.round((base.width / base.height) * A4_RATIO));
            var colWpt = base.width / cols;
            // Échelle pour qu'UNE colonne remplisse la largeur de l'écran
            var scale = (frameW / colWpt) * dpr;
            var vp = page.getViewport({ scale: scale });
            // Rendu complet de la page hors écran
            var full = document.createElement('canvas');
            full.width = vp.width;
            full.height = vp.height;
            return page.render({ canvasContext: full.getContext('2d'), viewport: vp }).promise.then(function () {
              var colWpx = vp.width / cols;
              for (var s = 0; s < cols; s++) {
                var srcX = Math.round(s * colWpx);
                var w = (s === cols - 1) ? (vp.width - srcX) : Math.round(colWpx);
                var slide = document.createElement('div');
                slide.className = 'slide';
                var c = document.createElement('canvas');
                c.width = w;
                c.height = vp.height;
                c.getContext('2d').drawImage(full, srcX, 0, w, vp.height, 0, 0, w, vp.height);
                slide.appendChild(c);
                container.appendChild(slide);
                slideCount++;
              }
            });
          });
        }

        var chain = Promise.resolve();
        for (var n = 1; n <= pdf.numPages; n++) {
          (function (p) { chain = chain.then(function () { return renderPage(p); }); })(n);
        }
        return chain.then(function () {
          document.getElementById('msg').style.display = 'none';
          refreshCounter();
        });
      }).catch(fail);
    } catch (e) { fail(); }
  })();
</script>
</body>
</html>`;
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
  tooltip: string;
  label: string;
}

const RIGHT_ICONS: IconDef[] = [
  { id: 'account',    lib: 'ion', name: 'person-circle-outline',   tooltip: 'Compte',                  label: 'Compte'   },
  { id: 'screenshot', lib: 'ion', name: 'camera-outline',          tooltip: 'Rapport parcelle',        label: 'Rapport'  },
  { id: 'pin',        lib: 'ion', name: 'location-outline',        tooltip: "Points d'analyse",        label: 'Analyse'  },
  { id: 'attributs',  lib: 'ion', name: 'create-outline',          tooltip: 'Éditer les zones',        label: 'Zone'     },
  { id: 'formulaire', lib: 'ion', name: 'document-text-outline',   tooltip: 'Formulaire parcelle',     label: 'Parcelle' },
  { id: 'tractor',    lib: 'mci', name: 'tractor',                 tooltip: 'Mode conduite / Shapefile', label: 'Moduler' },
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

const ICON_BTN_H = 64;

function RightIconBar({
  topOffset,
  onPressIcon,
  hasZones = false,
  pinActive = false,
  editActive = false,
  conduiteActive = false,
  onIconTouch,
  visibleIds,
}: {
  topOffset: number;
  onPressIcon?: (id: string) => void;
  hasZones?: boolean;
  pinActive?: boolean;
  editActive?: boolean;
  conduiteActive?: boolean;
  onIconTouch?: () => void;
  visibleIds?: string[];
}) {
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = (id: string) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipId(id);
    tooltipTimer.current = setTimeout(() => setTooltipId(null), 2000);
  };

  const icons = visibleIds ? RIGHT_ICONS.filter(i => visibleIds.includes(i.id)) : RIGHT_ICONS;

  return (
    <View style={[styles.iconBar, { top: topOffset }]}>
      {icons.map((item, index) => {
        const active = (item.id === 'info' && hasZones)
          || (item.id === 'pin' && pinActive)
          || (item.id === 'attributs' && editActive)
          || (item.id === 'tractor' && conduiteActive);
        return (
          <View key={item.id} style={{ position: 'relative' }}>
            {tooltipId === item.id && (
              <View style={[styles.iconTooltip, { top: (ICON_BTN_H - 28) / 2 }]}>
                <Text style={styles.iconTooltipText}>{item.tooltip}</Text>
              </View>
            )}
            <Pressable
              onPressIn={() => onIconTouch?.()}
              onPress={() => onPressIcon?.(item.id)}
              onLongPress={() => showTooltip(item.id)}
              delayLongPress={400}
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
                  size={item.id === 'tractor' ? 26 : 22}
                  color={
                    item.id === 'tractor' ? '#2E7D32'
                    : active ? '#2E7D32'
                    : (item.color ?? '#546E7A')
                  }
                />
              </View>
              <Text style={[styles.iconLabel, active && styles.iconLabelActive, item.color ? { color: item.color } : null]}>
                {item.label}
              </Text>
            </Pressable>
          </View>
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
  Z:  'ZONAGE LIBRE',
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

// Accumulateurs internes pour le calcul de la dose moyenne pondérée par groupe
interface LegendAcc extends LegendEntry {
  _doseSum: number;   // somme(dose_i × surface_i)
  _doseSurf: number;  // somme(surface_i) où dose_i != null
}

function buildLegendEntries(zones: ZoneDetail[], element: string): LegendEntry[] {
  const map = new Map<string | number, LegendAcc>();

  const parseDose = (raw: unknown): number | null => {
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : null;
    return v !== null && !isNaN(v) && v >= 0 ? v : null;
  };
  const parseTeneur = (raw: unknown): number | null => {
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : null;
    return v !== null && !isNaN(v) && v > 0 ? v : null;
  };

  for (const zone of zones) {
    const p = zone.properties;
    const fillColor = zone.style?.fillColor ?? '#CCCCCC';

    if (!p) {
      if (!map.has('__no_props__')) {
        map.set('__no_props__', {
          id: '__no_props__', fillColor,
          label: ENGRAIS_ELEMENTS.has(element) ? 'Teneur —' : 'Sol —',
          dose: null, teneur: null, surf_ha: 0, _doseSum: 0, _doseSurf: 0,
        });
      }
      continue;
    }

    let key: string | number;
    if (ENGRAIS_ELEMENTS.has(element) && p.id_class != null && p.id_class > 0) {
      key = p.id_class;
    } else if (!ENGRAIS_ELEMENTS.has(element)) {
      // S et Z : clé = label résolu (même logique que resolveLabel → cohérence garantie)
      const resolvedLbl = resolveLabel(p, element);
      key = resolvedLbl.length > 0 && resolvedLbl !== '—' ? `label_${resolvedLbl}` : fillColor;
    } else {
      key = fillColor;
    }

    const dose = parseDose(p.dose);
    const surf = typeof p.surface === 'number' ? p.surface : 0;

    if (!map.has(key)) {
      map.set(key, {
        id: key, fillColor,
        label: resolveLabel(p, element),
        dose: null, teneur: parseTeneur(p.teneur), surf_ha: surf,
        _doseSum: dose !== null ? dose * surf : 0,
        _doseSurf: dose !== null ? surf : 0,
      });
    } else {
      const entry = map.get(key)!;
      entry.surf_ha += surf;
      if (dose !== null) {
        entry._doseSum += dose * surf;
        entry._doseSurf += surf;
      }
      if (entry.teneur === null) entry.teneur = parseTeneur(p.teneur);
    }
  }

  // Calcul de la dose moyenne pondérée par surface pour chaque groupe
  const entries: LegendEntry[] = Array.from(map.values()).map(acc => {
    const dose = acc._doseSurf > 0 ? acc._doseSum / acc._doseSurf : null;
    return { id: acc.id, fillColor: acc.fillColor, label: acc.label, dose, teneur: acc.teneur, surf_ha: acc.surf_ha };
  });

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
  const [legendLarge, setLegendLarge] = useState(false);
  const bodyTapRef = useRef(0);

  if (zones.length === 0 || selectedElement === null) return null;

  const sz = legendLarge ? 1.45 : 1;  // facteur de grossissement
  const entries = buildLegendEntries(zones, selectedElement);
  const isSemis = selectedElement === 'S' || selectedElement === 'Z';
  const hasCulture = isSemis && cultureName && cultureName.length > 0;
  // Betterave (id=3) : graines/ha — toutes les autres céréales : kg/q
  const SEMIS_GRAINS_IDS = new Set([3]);
  const isGrainCount = isSemis && cultureId != null && SEMIS_GRAINS_IDS.has(cultureId);
  const semisUnit = isGrainCount ? 'Nbre gr/ha' : 'kg/q';
  const formatDose = (v: number): string => String(Math.ceil(v));
  const useDose = (stats ? stats.dose_moyenne !== null : entries.some(e => e.dose !== null))
    && (!isSemis || !!hasCulture);
  const baseTitle = ELEMENT_LABELS[selectedElement] ?? selectedElement;
  const title = selectedElement === 'Z'
    ? `${baseTitle}${useDose ? ` · ${semisUnit}` : ''}`
    : isSemis
      ? hasCulture
        ? `SEMIS · ${cultureName}${useDose ? ` · ${semisUnit}` : ''}`
        : 'SEMIS'
      : `${baseTitle}${useDose ? ' · kg/ha' : ''}`;
  const hasLabels = entries.some(e => e.label.length > 0);

  const statParts: string[] = [];
  if (stats) {
    const superficie = stats.superficie_parcelle > 0 ? stats.superficie_parcelle : stats.surface_totale;
    if (superficie > 0) statParts.push(`${superficie.toFixed(2)} ha`);
    if (useDose && stats.dose_moyenne != null)
      statParts.push(isSemis
        ? `moy ${stats.dose_moyenne.toFixed(1)} ${semisUnit}`
        : `moy ${stats.dose_moyenne.toFixed(1)} kg/ha`);
    else if (!useDose && stats.teneur_moyenne != null)
      statParts.push(`moy ${stats.teneur_moyenne.toFixed(1)} mg/kg`);
    if (stats.nombre_zones > 0) statParts.push(`${stats.nombre_zones} zones`);
  }

  const totalDose = (() => {
    const sum = entries.reduce((acc, e) =>
      e.dose !== null && e.surf_ha > 0 ? acc + e.dose * e.surf_ha : acc, 0);
    return sum > 0 ? sum : null;
  })();

  return (
    <View style={[styles.miniLegend, legendLarge && { width: 270 }]}>
      <Pressable style={styles.legendTitleRow} onPress={onToggle}>
        <Text style={[styles.miniLegendTitle, legendLarge && { fontSize: 13 }]}>{title}</Text>
        <View style={styles.legendToggleBtn}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#fff"
          />
        </View>
      </Pressable>

      {expanded && (
        <>
          <View style={styles.legendDivider} />
          <Pressable onPress={() => {
            const now = Date.now();
            if (now - bodyTapRef.current < 300) setLegendLarge(v => !v);
            bodyTapRef.current = now;
          }}>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={[styles.legendScroll, legendLarge && { maxHeight: 380 }]}>
            {entries.map(entry => (
              <View key={String(entry.id)} style={[styles.legendEntry, legendLarge && { marginBottom: 11 }]}>
                {/* Ligne 1 : pastille + libellé */}
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch,
                    { backgroundColor: entry.fillColor },
                    legendLarge && { width: 18, height: 18, borderRadius: 4 }]}
                  />
                  <Text style={[styles.legendLabel, legendLarge && { fontSize: Math.round(11 * sz) }]}>
                    {entry.label || '—'}
                  </Text>
                </View>
                {/* Ligne 2 : teneur et/ou dose */}
                {(entry.teneur !== null || entry.dose !== null) && (
                  <View style={[styles.legendSubRow, legendLarge && { marginLeft: 26 }]}>
                    {!isSemis && entry.teneur !== null && (
                      <Text style={[styles.legendSubText, legendLarge && { fontSize: Math.round(10 * sz) }]}>
                        Ten. {String(entry.teneur)}
                      </Text>
                    )}
                    {entry.dose !== null && (
                      <Text style={[styles.legendSubText, legendLarge && { fontSize: Math.round(10 * sz) }]}>
                        {`Dose moy. ${formatDose(entry.dose)}`}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
          </Pressable>
          {statParts.length > 0 && (
            <>
              <View style={styles.legendDivider} />
              <Text style={[styles.legendStats, legendLarge && { fontSize: Math.round(10 * sz) }]}>{statParts.join(' · ')}</Text>
            </>
          )}
          {totalDose !== null && (
            <>
              <View style={styles.legendDivider} />
              <Text style={styles.legendStatsBold}>
                {selectedElement === 'Z'
                  ? `À épandre : ${Math.ceil(totalDose as number)}`
                  : isSemis
                    ? (isGrainCount
                        ? `À épandre : ${Math.ceil((totalDose as number) / 1_000_000)} M gr`
                        : `À épandre : ${Math.ceil(totalDose as number)} kg`)
                    : `À épandre : ${Math.ceil(totalDose as number)} kg`}
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

const ENGRAIS_PILLS: { label: string; code: string }[] = [
  { label: 'phosphore', code: 'P' },
  { label: 'potassium', code: 'K' },
  { label: 'magnésie', code: 'MG' },
];

const SEMIS_PILLS: { label: string; code: string }[] = [
  { label: 'semis conseillé', code: 'S' },
  { label: 'zonage libre', code: 'Z' },
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

          <PanelSection
            title="ENGRAIS"
            pills={ENGRAIS_PILLS}
            selectedElement={selectedElement}
            onPill={handlePill}
          />

          <View style={styles.sectionDivider} />

          <PanelSection
            title="SEMIS"
            pills={SEMIS_PILLS}
            selectedElement={selectedElement}
            onPill={handlePill}
          />

        </ScrollView>
      </Animated.View>
    </View>
  );
}

function PanelSection({
  title,
  pills,
  selectedElement,
  onPill,
}: {
  title: string;
  pills: { label: string; code: string }[];
  selectedElement: string | null;
  onPill: (code: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.pillsRow}>
        {pills.map(({ label, code }) => {
          const active = selectedElement === code;
          return (
            <Pressable
              key={code}
              onPress={() => onPill(code)}
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
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Écran principal
// ─────────────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // Horodatage du dernier appui sur une icône : évite qu'un tap sur une icône
  // sélectionne aussi la parcelle située dessous (le tap du polygone se déclenche au niveau natif).
  const iconTouchAtRef = useRef(0);
  const [reportVisible, setReportVisible] = useState(false);
  const [switchProjectVisible, setSwitchProjectVisible] = useState(false);
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{
    login: string;
    repository: string;
    nom: string | null;
    prenom: string | null;
  } | null>(null);
  const [switchRepos, setSwitchRepos] = useState<AuthRepository[]>([]);
  const [switchLoading, setSwitchLoading] = useState(false);
  const [switchSearch, setSwitchSearch] = useState('');
  const [capturingMap, setCapturingMap] = useState(false);
  const [mapCaptureUri, setMapCaptureUri] = useState<string | null>(null);
  const [reportCultureName, setReportCultureName] = useState<string | null>(null);
  const [reportTeneurEngrais, setReportTeneurEngrais] = useState<string | null>(null);
  const [reportObjRendement, setReportObjRendement] = useState<string | null>(null);
  const reportRef = useRef<View>(null);
  const searchInputRef = useRef<TextInput>(null);
  const { loading: loadingHello, execute: executeHelloWorld } = useApi(helloWorld);
  const [loadingParcelles, setLoadingParcelles] = useState(false);
  const [features, setFeatures] = useState<ParcelleFeature[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneDetail[]>([]);
  const [parcelleStats, setParcelleStats] = useState<ParcelleStats | null>(null);
  const [parcelleDbId, setParcelleDbId] = useState<number | null>(null);
  const [isEditeur, setIsEditeur] = useState(false);
  const [carteValue, setCarteValue] = useState(0);
  const [typeSols, setTypeSols] = useState<import('../services/agridroneService').TypeSolItem[]>([]);
  const [formulaireId, setFormulaireId] = useState<number | null>(null);
  const [lastFormulaireData, setLastFormulaireData] = useState<FormulaireData | null>(null);
  const [loadingFormulaire, setLoadingFormulaire] = useState(false);
  const [selectionCultureVisible, setSelectionCultureVisible] = useState(false);
  const [selectionCultureContext, setSelectionCultureContext] = useState<'formulaire' | 'zone'>('formulaire');
  const [semisCultureDefinie, setSemisCultureDefinie] = useState<CultureSelection | null>(null);
  const [formulaireSemisVisible, setFormulaireSemisVisible] = useState(false);
  const [prelevements, setPrelevements] = useState<Prelevement[]>([]);
  const [showPrelevements, setShowPrelevements] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [labelPositions, setLabelPositions] = useState<
    Array<{ key: string; x: number; y: number; doseStr: string; perso: boolean }>
  >([]);
  const [editZoneMode, setEditZoneMode] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [mapLatDelta, setMapLatDelta] = useState(10);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Charge l'identité (identifiant + dépôt courant) et la liste des dépôts pour le menu Compte
  const hydrateAccountContext = useCallback(() => {
    fetchRepositoriesStored().then(repos => {
      if (repos && repos.length > 0) setSwitchRepos(repos);
    }).catch(() => {});
    getStoredCredentials().then(info => {
      if (info) setAccountInfo(info);
    }).catch(() => {});
  }, []);

  // Vérifier le token JWT au démarrage — refresh silencieux si expiré
  useEffect(() => {
    (async () => {
      try {
        let token = await loadToken();
        if (!token) token = await refreshToken();
        if (token) {
          setIsAuthenticated(true);
          hydrateAccountContext();
        }
      } catch {
        // pas de session valide → LoginModal
      } finally {
        setSessionChecked(true);
      }
    })();
  }, [hydrateAccountContext]);

  // Retour à la connexion si le BO rejette le token et que le refresh échoue
  useEffect(() => {
    registerSessionExpiredHandler(() => setIsAuthenticated(false));
    return () => unregisterSessionExpiredHandler();
  }, []);

  const [selectedZoneIdx, setSelectedZoneIdx] = useState<number | null>(null);
  const [showEditHint, setShowEditHint] = useState(false);
  const [zoneFormVisible, setZoneFormVisible] = useState(false);
  const [zoneSemisFormVisible, setZoneSemisFormVisible] = useState(false);
  const [zoneLibreFormVisible, setZoneLibreFormVisible] = useState(false);
  const [zoneLibreFertilisant, setZoneLibreFertilisant] = useState('Z');
  const [selectedZone, setSelectedZone] = useState<ZoneDetail | null>(null);
  const [zoneEngraisDetail, setZoneEngraisDetail] = useState<import('../services/agridroneService').EngraisZoneDetail | null>(null);
  const [zoneAllowDosage, setZoneAllowDosage] = useState(false);
  const [zoneAllowRendement, setZoneAllowRendement] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [conduiteMode, setConduiteMode] = useState(false);
  const conduiteModeRef = useRef(false);
  const [tracteurModalVisible, setTracteurModalVisible] = useState(false);
  const [calibrationModalVisible, setCalibrationModalVisible] = useState(false);
  const [agriboxModalVisible, setAgriboxModalVisible] = useState(false);
  const [agriboxFileUri, setAgriboxFileUri] = useState('');
  const [agriboxFileName, setAgriboxFileName] = useState('');
  const [pendingConduiteMode, setPendingConduiteMode] = useState<'vitesse' | 'dosage'>('vitesse');
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const geoMsgOpacity = useRef(new Animated.Value(0)).current;
  const warnOpacity = useRef(new Animated.Value(0)).current;
  const [warnVisible, setWarnVisible] = useState(false);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorOpacity = useRef(new Animated.Value(0)).current;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formulaireVisible, setFormulaireVisible] = useState(false);
  const [loadingShapefile, setLoadingShapefile] = useState(false);
  const iconBarOpacity = useRef(new Animated.Value(0)).current;
  const [loadingZones, setLoadingZones] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [flashZoneNum, setFlashZoneNum] = useState<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated]);

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

  useEffect(() => () => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

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


  const filteredParcelles = features
    .map((f, i) => {
      const raw = f.properties?.nom_parcel ?? 'Sans nom';
      const nom = raw.length > 0 ? raw[0].toUpperCase() + raw.slice(1) : raw;
      return { index: i, nom };
    })
    .filter(({ nom }) =>
      query.length === 0 || nom.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

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
          const editeur = data.is_editeur ?? data.parcelle.is_editeur ?? false;
          const carte = (data.zones[0]?.properties?.['carte'] as number | undefined) ?? 0;
          setIsEditeur(editeur);
          setCarteValue(carte);
          if (editeur) {
            getTypeSol(carte).then(setTypeSols).catch(() => setTypeSols([]));
          } else {
            setTypeSols([]);
          }
        }
      })
      .catch((err: unknown) => {
        // erreur silencieuse — l'UI reste dans son état précédent
      })
      .finally(() => { if (!cancelled) setLoadingZones(false); });
    return () => { cancelled = true; };
  }, [selectedId, selectedElement, features, reloadTrigger]);

  const handleSelect = (index: number, nom: string) => {
    // Ignorer un tap de polygone survenant juste après un appui sur une icône
    // (icône superposée à une parcelle → évite le changement de parcelle inopiné).
    if (Date.now() - iconTouchAtRef.current < 500) return;
    Keyboard.dismiss();
    setSelectedId(index);
    setQuery(nom);
    setDropdownOpen(false);
    setSelectedElement(prev => prev ?? 'P');
    setCollapseSignal(s => s + 1);
    setZones([]);
    setPrelevements([]);
    setShowPrelevements(false);
    setEditZoneMode(false);
    setSelectedZoneIdx(null);
    // Réinitialiser les données de Fiche : sinon elles restent « collées » à la
    // parcelle précédente (ex. obj_rendement = -1) et invalident formValuesValid,
    // ce qui masque à tort l'icône « Moduler ».
    setLastFormulaireData(null);
    setFormulaireId(null);
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
    setEditZoneMode(false);
    setSelectedZoneIdx(null);
    setLastFormulaireData(null);
    const region = computeRegion(features);
    if (region) {
      mapRef.current?.animateToRegion(region, 600);
    }
  };

  // Affichage automatique des étiquettes de dose : dès qu'une parcelle a des zones,
  // que la carte est assez zoomée, et hors mode conduite (modulation manuelle dose/vitesse).
  const doseLabelsVisible =
    zones.length > 0 && !conduiteMode && mapLatDelta <= DOSE_LABELS_MAX_DELTA;

  const updateLabelPositions = useCallback(async () => {
    if (!mapRef.current || zones.length === 0) {
      setLabelPositions([]);
      return;
    }
    if (!doseLabelsVisible) return; // garder les positions en cache, ne pas recalculer
    const { height: screenH } = Dimensions.get('window');
    const threshold = mapLatDelta * (60 / screenH);
    const placed: { lat: number; lng: number }[] = [];
    const toProcess: Array<{ zi: number; lat: number; lng: number; doseStr: string; perso: boolean }> = [];

    zones.forEach((zone, zi) => {
      const dose = zone.properties?.dose;
      const c = zone.centroid;
      if (!c || dose == null || (dose as number) < 0) return;
      const tooClose = placed.some(p =>
        Math.abs(p.lat - c.lat) < threshold && Math.abs(p.lng - c.lng) < threshold * 1.5,
      );
      if (tooClose) return;
      placed.push({ lat: c.lat, lng: c.lng });
      const v = Number(dose);
      const perso = Number(zone.properties?.perso_dose) === 1;
      toProcess.push({
        zi,
        lat: c.lat,
        lng: c.lng,
        doseStr: v >= 10 ? Math.round(v).toString() : v.toFixed(2),
        perso,
      });
    });

    if (toProcess.length === 0) { setLabelPositions([]); return; }

    const results = await Promise.all(
      toProcess.map(item =>
        mapRef.current!
          .pointForCoordinate({ latitude: item.lat, longitude: item.lng })
          .then(pt => ({ key: `dose-${item.zi}`, x: pt.x, y: pt.y, doseStr: item.doseStr, perso: item.perso }))
          .catch(() => null),
      ),
    );
    setLabelPositions(results.filter(Boolean) as typeof labelPositions);
  }, [doseLabelsVisible, zones, mapLatDelta]);

  useEffect(() => { void updateLabelPositions(); }, [doseLabelsVisible, zones, mapLatDelta]);

  // ── Bulle dose : zone courante + prochaine zone < 10 m ────────────────────
  // Mode simulation réservé aux éditeurs avec plusieurs projets
  const [simMode, setSimMode] = useState(false);
  const [simLocation, setSimLocation] = useState<LatLng | null>(null);
  const simRepeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopSimMove = useCallback(() => {
    if (simRepeatRef.current !== null) {
      clearInterval(simRepeatRef.current);
      simRepeatRef.current = null;
    }
  }, []);
  const startSimMove = useCallback((dLat: number, dLng: number) => {
    if (simRepeatRef.current !== null) return; // déjà actif
    setSimLocation(p => p ? nudgeLatLng(p, dLat, dLng) : p);
    simRepeatRef.current = setInterval(() => {
      setSimLocation(p => p ? nudgeLatLng(p, dLat, dLng) : p);
    }, 120);
  }, []);
  const canUseSim = isGeolocating && switchRepos.length > 1;

  const activeLocation: LatLng | null = (simMode && simLocation) ? simLocation : (userLocation ?? null);

  // Cap de déplacement : mis à jour quand la position change d'au moins 1 m
  const prevLocationRef = useRef<LatLng | null>(null);
  const [movementBearing, setMovementBearing] = useState<number | null>(null);
  useEffect(() => {
    if (!activeLocation) { prevLocationRef.current = null; setMovementBearing(null); return; }
    const prev = prevLocationRef.current;
    if (prev && distanceMeters(prev, activeLocation) >= 1) {
      setMovementBearing(bearingDeg(prev, activeLocation));
    }
    prevLocationRef.current = activeLocation;
  }, [activeLocation]);

  const zoneBubbleInfo = useMemo<ZoneBubbleInfo | null>(() => {
    if (!activeLocation || zones.length === 0 || selectedElement === null) return null;

    const currentZone = zones.find(z => z.geometry && pointInZoneGeometry(activeLocation, z.geometry));
    if (!currentZone) return null;

    const { fillColor } = getZoneDetailStyle(currentZone);
    const currentDose = (currentZone.properties?.dose as number | null) ?? null;
    const unite = (currentZone.properties?.unite as string | undefined) ?? 'kg/ha';

    const toSettingLabel = (dose: number | null): string | null => {
      if (!calibration || dose === null) return null;
      const v = computeTargetSetting(dose, calibration.points, calibration.mode);
      return v !== null ? formatSetting(v, calibration.unite, calibration.mode) : null;
    };

    const speedGuidance = (() => {
      if (!calibration || calibration.mode !== 'vitesse' || currentSpeedKmh === null || currentDose === null) return null;
      const SENTINEL = { targetKmh: null as null, currentKmh: currentSpeedKmh, deltaKmh: 0 };
      if (currentDose === 0) {
        return { ...SENTINEL, direction: 'closed' as const, color: '#FF6B35' };
      }
      const targetKmh = computeTargetSetting(currentDose, calibration.points, 'vitesse');
      const MIN_KMH = 0.5;
      const MAX_KMH = 25;
      if (targetKmh === null || targetKmh < MIN_KMH || targetKmh > MAX_KMH) {
        return { ...SENTINEL, direction: 'out_of_range' as const, color: '#FF9800' };
      }
      const deltaKmh = currentSpeedKmh - targetKmh;
      const relDiff = Math.abs(deltaKmh) / targetKmh;
      const TOLERANCE = 0.10;
      let direction: 'ok' | 'accelerate' | 'decelerate' = 'ok';
      let color = '#4CAF50';
      if (relDiff > TOLERANCE) {
        if (deltaKmh > 0) { direction = 'decelerate'; color = '#FF6B35'; }
        else { direction = 'accelerate'; color = '#4FC3F7'; }
      }
      return { targetKmh, currentKmh: currentSpeedKmh, direction, deltaKmh, color };
    })();

    // Chercher la zone avec dose différente la plus proche (seuil 10 m)
    // et dans la direction de déplacement (différence angulaire ≤ 90°)
    const THRESHOLD = 10;
    let nextZone: ZoneBubbleInfo['nextZone'] = null;
    let minDist = THRESHOLD;

    for (const zone of zones) {
      if (zone === currentZone) continue;
      const zoneDose = (zone.properties?.dose as number | null) ?? null;
      if (zoneDose === currentDose) continue;
      if (!zone.geometry) continue;

      const coords = zone.geometry.type === 'Polygon'
        ? (zone.geometry.coordinates as number[][][])[0]
        : (zone.geometry.coordinates as number[][][][])[0]?.[0];
      if (!coords) continue;

      const { nearest, distanceM } = nearestOnBoundary(activeLocation, coords);
      if (distanceM >= minDist) continue;

      const bearingToZone = bearingDeg(activeLocation, nearest);

      // Filtrer par direction de déplacement si elle est connue
      if (movementBearing !== null) {
        const angleDiff = Math.abs(((bearingToZone - movementBearing + 540) % 360) - 180);
        if (angleDiff > 90) continue; // l'utilisateur s'éloigne de cette zone
      }

      minDist = distanceM;
      nextZone = {
        direction: bearingToCompass(bearingToZone),
        distanceM,
        dose: zoneDose,
        fillColor: getZoneDetailStyle(zone).fillColor,
        settingLabel: toSettingLabel(zoneDose),
      };
    }

    return { fillColor, dose: currentDose, unite, settingLabel: toSettingLabel(currentDose), speedGuidance, nextZone };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocation, zones, selectedElement, movementBearing, calibration, currentSpeedKmh]);

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
        if (result.doses_recalculees) {
          Alert.alert(
            'Semis enregistré ✅',
            `${result.zones_mises_a_jour} zone(s) mise(s) à jour\n${result.zones_dosage_manuel} zone(s) en dosage manuel`,
          );
        } else {
          showSuccess('Semis enregistré');
        }
      })
      .catch(() => showSuccess('Semis enregistré'))
      .finally(() => setLoadingZones(false));
  };

  const showNoParcelleWarning = () => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    setWarnVisible(true);
    Animated.timing(warnOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    warnTimerRef.current = setTimeout(() => {
      Animated.timing(warnOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(() => setWarnVisible(false));
    }, 3500);
  };

  const handleWarnPress = () => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    Animated.timing(warnOpacity, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(() => setWarnVisible(false));
    setDropdownOpen(true);
    searchInputRef.current?.focus();
  };

  const showSuccess = (msg: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMsg(msg);
    Animated.timing(successOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    successTimerRef.current = setTimeout(() => {
      Animated.timing(successOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(() => setSuccessMsg(null));
    }, 2500);
  };

  // Bandeau d'erreur (rouge) — affiché un peu plus longtemps que le succès.
  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setErrorMsg(msg);
    Animated.timing(errorOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    errorTimerRef.current = setTimeout(() => {
      Animated.timing(errorOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(() => setErrorMsg(null));
    }, 4000);
  };

  // Traduit une erreur technique en message clair et rassurant pour l'agriculteur.
  const friendlyError = (e: unknown, fallback: string): string => {
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403) {
        return 'Votre session a expiré. Reconnectez-vous puis réessayez.';
      }
      if (e.status === 400 || e.status === 422) {
        return 'Certaines informations saisies sont incorrectes. Vérifiez le formulaire et réessayez.';
      }
      if (e.status >= 500) {
        return "Le service a rencontré un problème. Réessayez dans un instant ; si ça persiste, prévenez le support.";
      }
    }
    // Erreur réseau (fetch échoué, hors ligne…)
    if (e instanceof TypeError) {
      return 'Connexion impossible. Vérifiez votre connexion internet, puis réessayez.';
    }
    return fallback;
  };

  const handleSelectElement = (code: string | null) => {
    setSelectedElement(code);
    if (code !== null) setCollapseSignal(s => s + 1);
    if (code !== null && selectedId === null) {
      showNoParcelleWarning();
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


  const handleExportShapefile = async () => {
    if (selectedId === null) return;
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
      if (Platform.OS === 'android') {
        // SAF : sélecteur de dossier Android — inclut les clés USB OTG
        const perms = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perms.granted) {
          const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
            perms.directoryUri,
            fileName,
            'application/zip',
          );
          await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert('✅ Enregistré', `${fileName}\nsauvegardé dans le dossier sélectionné.`);
        }
      } else {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/zip',
          dialogTitle: `Shapefile — ${nomParcelle}`,
        });
      }
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de générer le shapefile');
    } finally {
      setLoadingShapefile(false);
    }
  };

  const handleVerseConsole = async () => {
    if (selectedId === null) return;
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
      const fName = `${nomParcelle}_${selectedElement ?? 'zones'}_shapefile.zip`;
      const fUri = (FileSystem.documentDirectory ?? '') + fName;
      await FileSystem.writeAsStringAsync(fUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setAgriboxFileName(fName);
      setAgriboxFileUri(fUri);
      setAgriboxModalVisible(true);
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de générer le shapefile');
    } finally {
      setLoadingShapefile(false);
    }
  };

  const stopConduite = useCallback(() => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    setIsGeolocating(false);
    setUserLocation(null);
    setCurrentSpeedKmh(null);
    setCalibration(null);
    conduiteModeRef.current = false;
    setConduiteMode(false);
    stopSimMove();
    setSimMode(false);
  }, [stopSimMove]);

  const handleStartConduite = useCallback(async () => {
    if (!isGeolocating) {
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
          if (loc.coords.speed !== null && loc.coords.speed >= 0) {
            setCurrentSpeedKmh(loc.coords.speed * 3.6);
          }
          if (conduiteModeRef.current) {
            mapRef.current?.animateToRegion(
              { ...pos, latitudeDelta: 0.0008, longitudeDelta: 0.0008 },
              500,
            );
          }
        },
      );
      locationSubRef.current = sub;
    }
    conduiteModeRef.current = true;
    setConduiteMode(true);
  }, [isGeolocating]);

  const handleTractorPress = () => {
    if (selectedId === null) {
      Alert.alert('Erreur', 'Veuillez sélectionner une parcelle');
      return;
    }
    setTracteurModalVisible(true);
  };

  const handleModeSelect = (mode: TracteurMode) => {
    setTracteurModalVisible(false);
    if (mode === 'modulation') {
      void handleVerseConsole();
    } else {
      if (conduiteMode) stopConduite();
      setPendingConduiteMode(mode);
      setCalibrationModalVisible(true);
    }
  };

  const handleCalibrationConfirm = (result: CalibrationResult) => {
    setCalibrationModalVisible(false);
    setCalibration(result);
    void handleStartConduite();
  };

  const handleLogout = () => {
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
  };

  const handleSwitchProject = async () => {
    setSwitchLoading(true);
    const repos = await fetchRepositoriesStored();
    setSwitchLoading(false);
    if (!repos || repos.length === 0) {
      Alert.alert('Indisponible', 'Reconnectez-vous pour changer de projet.');
      return;
    }
    if (repos.length === 1) {
      Alert.alert('Info', 'Vous n\'avez qu\'un seul projet associé à votre compte.');
      return;
    }
    setSwitchRepos(repos);
    setSwitchSearch('');
    setSwitchProjectVisible(true);
  };

  const handleSelectProject = async (repo: AuthRepository) => {
    setSwitchProjectVisible(false);
    setSwitchLoading(true);
    const token = await switchRepository(repo.cle).finally(() => setSwitchLoading(false));
    if (!token) { Alert.alert('Erreur', 'Impossible de changer de projet.'); return; }
    // Rafraîchir l'identité (dépôt courant, nom/prénom) affichée dans le menu Compte
    hydrateAccountContext();
    // Réinitialiser la carte et recharger les parcelles du nouveau projet
    setFeatures([]);
    setZones([]);
    setSelectedId(null);
    setSelectedElement(null);
    setParcelleStats(null);
    setParcelleDbId(null);
    setIsAuthenticated(false);
    setTimeout(() => setIsAuthenticated(true), 50);
  };

  const handleScreenshot = async () => {
    setCapturingMap(true);
    try {
      // Charger culture + teneur engrais depuis l'API
      const dbId = parcelleDbId ?? (selectedId !== null ? Number(
        features[selectedId]?.properties?.id_parcel ??
        features[selectedId]?.properties?.id ?? selectedId,
      ) : null);

      if (dbId !== null && selectedElement && !['S','Z'].includes(selectedElement)) {
        // Engrais : charger formulaire pour culture + teneur
        const formData = await getFormulaireEngrais(dbId, selectedElement);
        if (formData) {
          const cultures = await getCultures().catch(() => []);
          const culture = cultures.find((c: ReferentielItem) => c.id === formData.id_culture);
          setReportCultureName(culture?.nom ?? null);
          setReportTeneurEngrais(formData.teneur_engrais != null ? String(formData.teneur_engrais) : null);
          setReportObjRendement(formData.obj_rendement != null ? String(formData.obj_rendement) : null);
        } else {
          setReportCultureName(null);
          setReportTeneurEngrais(null);
          setReportObjRendement(null);
        }
      } else if (selectedElement === 'S') {
        setReportCultureName(semisCultureDefinie?.nom ?? null);
        setReportTeneurEngrais(null);
        setReportObjRendement(null);
      } else {
        setReportCultureName(null);
        setReportTeneurEngrais(null);
        setReportObjRendement(null);
      }

      if (mapRef.current) {
        try {
          const region = selectedId !== null
            ? computeRegion([features[selectedId]], 1.5) ?? undefined
            : undefined;
          const { width } = Dimensions.get('window');
          const uri = await mapRef.current.takeSnapshot({
            width,
            height: Math.round(width * 0.75),
            region,
            format: 'jpg',
            quality: 0.9,
            result: 'file',
          });
          setMapCaptureUri(uri);
        } catch {
          setMapCaptureUri(null);
        }
      }
    } finally {
      setCapturingMap(false);
    }
    setReportVisible(true);
  };

  const handleCaptureReport = async () => {
    if (!reportRef.current) return;
    await new Promise(r => setTimeout(r, 200));
    try {
      const uri = await captureRef(reportRef, { format: 'jpg', quality: 0.95 });
      const nomParcelle = selectedId !== null
        ? (features[selectedId]?.properties?.nom_parcel ?? 'parcelle')
        : 'rapport';
      const fileName = `AgriDrone_${nomParcelle}_${new Date().toISOString().slice(0, 10)}.jpg`;
      const dest = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '') + fileName;
      await FileSystem.copyAsync({ from: uri, to: dest });
      setReportVisible(false);
      await Sharing.shareAsync(dest, { mimeType: 'image/jpeg', dialogTitle: `Rapport ${nomParcelle}` });
    } catch {
      setReportVisible(false);
      Alert.alert('Erreur', 'Impossible de générer le rapport.');
    }
  };

  const [downloadingEch, setDownloadingEch] = useState<string | null>(null);
  // HTML (viewer PDF.js) à afficher plein écran dans la WebView, iOS ET Android
  const [pdfViewerHtml, setPdfViewerHtml] = useState<string | null>(null);

  const handleDownloadAnalyse = async (ech: string) => {
    setDownloadingEch(ech);
    try {
      const token = await loadToken();
      const url = `${config.baseURL}/api/v1/parcelles/analyses/${encodeURIComponent(ech)}/pdf`;

      // Web : l'endpoint exige un Bearer, donc pas de window.open direct.
      // On récupère le PDF en blob puis on l'ouvre dans un nouvel onglet → viewer PDF natif du navigateur.
      if (Platform.OS === 'web') {
        const resp = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        // Libérer l'URL objet une fois l'onglet chargé.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        return;
      }

      // Natif (iOS + Android) : télécharger le PDF (Bearer requis), le lire en base64,
      // puis l'afficher dans une WebView via PDF.js → rendu identique sur les deux plateformes.
      const target = `${FileSystem.cacheDirectory}analyse_${ech}.pdf`;
      const res = await FileSystem.downloadAsync(url, target, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const base64 = await FileSystem.readAsStringAsync(res.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setPdfViewerHtml(buildPdfViewerHtml(base64));
    } catch (e) {
      showError(friendlyError(e, "Impossible d'ouvrir le rapport d'analyse. Réessayez dans un instant."));
    } finally {
      setDownloadingEch(null);
    }
  };

  // Fermeture du viewer PDF : au retour, recentrer sur la parcelle sélectionnée.
  const closePdfViewer = () => {
    setPdfViewerHtml(null);
    if (selectedId !== null) {
      const region = computeRegion([features[selectedId]], 1.6);
      if (region) mapRef.current?.animateToRegion(region, 600);
    }
  };

  const handleIconPress = (id: string) => {
    if (id === 'account') { setAccountMenuVisible(true); return; }
    // Recentrer la carte sur la parcelle sélectionnée pour les actions liées à la parcelle
    // (Doses, Éditer, Fiche, Moduler, Rapport). Analyse (« pin ») garde sa logique propre.
    if (selectedId !== null && ['attributs', 'formulaire', 'tractor', 'screenshot'].includes(id)) {
      const region = computeRegion([features[selectedId]], 1.6);
      if (region) mapRef.current?.animateToRegion(region, 600);
    }
    // Activer une autre fonction sort du mode Analyse (points + bandeau) → MiniLegend réapparaît
    if (id !== 'pin') setShowPrelevements(false);
    if (id === 'pin') {
      const activating = !showPrelevements;
      setShowPrelevements(activating);
      // À l'activation du mode Analyse, recentrer la carte sur la parcelle sélectionnée
      if (activating && selectedId !== null) {
        const region = computeRegion([features[selectedId]], 1.6);
        if (region) mapRef.current?.animateToRegion(region, 600);
      }
    }
    if (id === 'attributs') {
      setEditZoneMode(v => {
        if (v) setSelectedZoneIdx(null); // reset sélection à la désactivation
        return !v;
      });
    }
    if (id === 'tractor') void handleTractorPress();
    if (id === 'screenshot') void handleScreenshot();
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
            setSelectionCultureContext('formulaire');
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

  // Libellé lisible du dépôt courant pour l'en-tête du menu Compte
  const currentRepoLabel = accountInfo
    ? (switchRepos.find(r => r.cle === accountInfo.repository)?.label ?? null)
    : null;

  // Nom affiché dans le menu Compte : « Prénom Nom » si dispo, sinon l'identifiant
  const accountDisplayName = accountInfo
    ? ([accountInfo.prenom, accountInfo.nom].filter(Boolean).join(' ').trim() || accountInfo.login)
    : '';

  // Couleur de marqueur par zone de prélèvement : chaque num_zone distinct reçoit
  // une couleur de la palette, partagée par tous les points de la zone.
  const prelevementZoneColors = useMemo(() => {
    const zones = Array.from(
      new Set(prelevements.map(p => p.num_zone).filter((z): z is number => z != null)),
    ).sort((a, b) => a - b);
    const map = new Map<number, string>();
    zones.forEach((z, i) => map.set(z, ZONE_MARKER_COLORS[i % ZONE_MARKER_COLORS.length]));
    return map;
  }, [prelevements]);

  // Une entrée par zone/échantillon pour le bandeau : couleur + n° échantillon (PDF)
  const prelevementZones = useMemo(() => {
    const echByZone = new Map<number, string | null>();
    for (const p of prelevements) {
      if (p.num_zone != null && !echByZone.has(p.num_zone)) {
        echByZone.set(p.num_zone, p.ech ?? null);
      }
    }
    return Array.from(echByZone.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([numZone, ech]) => ({
        numZone,
        ech,
        color: prelevementZoneColors.get(numZone) ?? PRELEV_DEFAULT_COLOR,
      }));
  }, [prelevements, prelevementZoneColors]);

  return (
    <View style={styles.container}>
      {/* ── 1. Carte plein écran ─────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={DEFAULT_REGION}
        mapType="none"
        onRegionChange={r => setMapLatDelta(r.latitudeDelta)}
        onRegionChangeComplete={() => { void updateLabelPositions(); }}
        onPress={e => { if (simMode) setSimLocation(e.nativeEvent.coordinate); }}>
        <UrlTile urlTemplate={IGN_ORTHO_URL} maximumZ={19} zIndex={-1} />
        {features.flatMap((feature, fi) => {
          const nom = feature.properties?.nom_parcel ?? 'Sans nom';
          const selected = fi === selectedId;
          const polygonProps = {
            fillColor: selected ? 'transparent' : 'rgba(255,255,255,0.06)',
            strokeColor: selected ? '#FFD700' : '#FFFFFF',
            strokeWidth: selected ? 3 : 2,
            // Toute parcelle non sélectionnée reste cliquable → on peut basculer
            // de l'une à l'autre d'un simple clic, même quand une parcelle est déjà sélectionnée.
            tappable: !selected,
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
          const isFlashing = zone.num_zone != null && zone.num_zone === flashZoneNum;
          const zFill   = isSelected ? 'rgba(255,0,0,0.4)' : isFlashing ? 'rgba(46,200,100,0.75)' : fillColor;
          const zStroke = isSelected ? '#FF0000' : isFlashing ? '#00C864' : strokeColor;
          const zWidth  = isSelected ? 2.5 : strokeWidth;
          const onPressZone = editZoneMode
            ? () => {
                setSelectedZoneIdx(prev => prev === zi ? null : zi);
                setSelectedZone(zone);

                if (selectedElement === 'S' || selectedElement === 'Z') {
                  if (selectedElement === 'Z') {
                    const numZone = zone.num_zone ?? Number(zone.id);
                    const fert = selectedElement;
                    setLoadingZones(true);
                    getZoneEngraisDetail(numZone, fert)
                      .then(detail => {
                        setZoneEngraisDetail(detail);
                        setZoneLibreFertilisant(fert);
                        setZoneLibreFormVisible(true);
                      })
                      .finally(() => setLoadingZones(false));
                  } else if (!semisCultureDefinie) {
                    setSelectionCultureContext('zone');
                    setSelectionCultureVisible(true);
                  } else {
                    const numZone = zone.num_zone ?? (zi + 1);
                    setLoadingZones(true);
                    getZoneEngraisDetail(numZone, 'S')
                      .then(detail => {
                        setZoneEngraisDetail(detail);
                        setZoneSemisFormVisible(true);
                      })
                      .finally(() => setLoadingZones(false));
                  }
                } else {
                  // Engrais (P/K/MG)
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
                      setZoneAllowDosage(dosage);
                      setZoneAllowRendement(rend);
                      setZoneFormVisible(true);
                    })
                    .finally(() => setLoadingZones(false));
                }
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

        {showPrelevements && prelevements.map((p, pi) => {
          const zoneColor = p.num_zone != null
            ? (prelevementZoneColors.get(p.num_zone) ?? PRELEV_DEFAULT_COLOR)
            : PRELEV_DEFAULT_COLOR;
          const label = (p.nom ?? '').replace(/^Z/i, ''); // « Z1-1 » → « 1-1 »
          return (
            <Marker
              key={`prel-${pi}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              anchor={{ x: 0.5, y: 0 }}
              tracksViewChanges={true}>
              <View style={styles.markerWrapper}>
                <View style={[styles.markerDot, { backgroundColor: zoneColor }]} />
                <View style={[styles.markerLabelBg, { backgroundColor: zoneColor }]}>
                  <Text style={styles.markerLabelText}>{label}</Text>
                </View>
              </View>
            </Marker>
          );
        })}

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

        {/* ── Marqueur de simulation GPS (éditeurs multi-projets) ──────── */}
        {simMode && simLocation && (
          <Marker
            coordinate={simLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            draggable
            tracksViewChanges
            onDragEnd={e => setSimLocation(e.nativeEvent.coordinate)}>
            <View style={styles.simDot}>
              <View style={styles.simDotInner} />
            </View>
          </Marker>
        )}

      </MapView>

      {/* ── Étiquettes doses — overlay React Native (hors MapView) ─────── */}
      {doseLabelsVisible && labelPositions.map(pos => (
        <View
          key={pos.key}
          style={[styles.doseLabelOverlay, { left: pos.x, top: pos.y }]}
          pointerEvents="none">
          <Text style={[styles.doseLabelText, pos.perso && styles.doseLabelPerso]}>
            {pos.doseStr}
          </Text>
        </View>
      ))}

      {/* ── Overlay fermeture dropdown au clic sur la carte ───────────── */}
      {dropdownOpen && (
        <Pressable
          style={styles.dropdownOverlay}
          onPress={() => setDropdownOpen(false)}
        />
      )}

      {/* ── Overlays UI (masqués pendant capture carte) ──────────────── */}
      <View style={[StyleSheet.absoluteFillObject, { opacity: capturingMap ? 0 : 1 }]} pointerEvents={capturingMap ? 'none' : 'box-none'}>

      {/* ── 2. Barre de recherche ─────────────────────────────────────── */}
      {!isGeolocating && !simMode && (
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
      )}

      {/* ── 3. Barre d'icônes droite ──────────────────────────────────── */}
      <Animated.View
        style={{ opacity: 1 }}
        pointerEvents="box-none">
        <RightIconBar
          topOffset={iconBarTop}
          onPressIcon={handleIconPress}
          hasZones={zones.length > 0}
          pinActive={showPrelevements}
          editActive={editZoneMode}
          conduiteActive={conduiteMode}
          onIconTouch={() => { iconTouchAtRef.current = Date.now(); }}
          visibleIds={[
            'account',
            ...(zones.length > 0 && ['P','K','MG','S'].includes(selectedElement ?? '') ? ['screenshot'] : []),
            ...(prelevements.length > 0 ? ['pin'] : []),
            ...(allDosesSet ? ['tractor'] : []),
            ...(zones.length > 0 ? ['attributs'] : []),
            ...(zones.length > 0 && selectedElement !== 'Z' ? ['formulaire'] : []),
          ]}
        />
      </Animated.View>

      {/* ── Indicateur de chargement ──────────────────────────────────── */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      )}

      {/* ── Bandeau analyses : légende couleurs par zone + téléchargement PDF ── */}
      {showPrelevements && prelevements.length > 0 && (
        <View style={styles.analyseBanner}>
          <Text style={styles.analyseBannerTitle}>Analyses de sol</Text>
          {prelevementZones.map(z => (
            <View key={z.numZone} style={styles.analyseLegendRow}>
              <View style={[styles.analyseSwatch, { backgroundColor: z.color }]} />
              <Text style={styles.analyseLegendText} numberOfLines={1}>
                Zone {z.numZone % 1000}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.analyseDownloadBtn,
                  pressed && { opacity: 0.6 },
                  !z.ech && { opacity: 0.3 },
                ]}
                onPress={() => z.ech && handleDownloadAnalyse(z.ech)}
                disabled={!z.ech || downloadingEch === z.ech}
                hitSlop={6}>
                {downloadingEch === z.ech ? (
                  <ActivityIndicator size="small" color="#2E7D32" />
                ) : (
                  <Ionicons name="attach" size={16} color="#2E7D32" />
                )}
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* ── Viewer PDF plein écran (iOS + Android) : rapport d'analyse via PDF.js ── */}
      <Modal
        visible={pdfViewerHtml !== null}
        animationType="slide"
        onRequestClose={closePdfViewer}>
        <View style={styles.pdfViewerContainer}>
          <View style={[styles.pdfViewerHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={closePdfViewer}
              hitSlop={12}
              style={({ pressed }) => [styles.pdfViewerBack, pressed && { opacity: 0.6 }]}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
              <Text style={styles.pdfViewerBackLabel}>Retour</Text>
            </Pressable>
            <Text style={styles.pdfViewerTitle}>Rapport d&apos;analyse</Text>
          </View>
          {pdfViewerHtml && (
            <WebView
              source={{ html: pdfViewerHtml, baseUrl: PDFJS_CDN }}
              originWhitelist={['*']}
              javaScriptEnabled
              style={styles.pdfViewerWeb}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.pdfViewerLoading}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── Message géolocalisation ──────────────────────────────────── */}
      <Animated.View
        style={[styles.geoMsg, { opacity: geoMsgOpacity }]}
        pointerEvents="none">
        <Ionicons name="navigate" size={13} color="#fff" />
        <Text style={styles.geoMsgText}>
          {conduiteMode ? 'Mode conduite GPS activé' : 'Géolocalisation activée'}
        </Text>
      </Animated.View>

      {/* ── Avertissement : aucune parcelle sélectionnée ─────────────── */}
      {warnVisible && (
        <Animated.View style={[styles.warnMsgWrap, { opacity: warnOpacity }]}>
          <Pressable style={styles.warnMsg} onPress={handleWarnPress}>
            <Ionicons name="warning" size={16} color="#fff" />
            <Text style={styles.warnMsgText}>
              Aucune parcelle sélectionnée — appuyez pour en choisir une
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Confirmation : enregistrement réussi ─────────────────────── */}
      {successMsg && (
        <Animated.View
          style={[styles.successMsgWrap, { opacity: successOpacity }]}
          pointerEvents="none">
          <View style={styles.successMsg}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.successMsgText}>{successMsg}</Text>
          </View>
        </Animated.View>
      )}

      {errorMsg && (
        <Animated.View
          style={[styles.successMsgWrap, { opacity: errorOpacity }]}
          pointerEvents="none">
          <View style={styles.errorMsg}>
            <Ionicons name="alert-circle" size={18} color="#fff" />
            <Text style={styles.successMsgText}>{errorMsg}</Text>
          </View>
        </Animated.View>
      )}


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

      {/* ── Mini légende zones (masquée en mode Analyse) ──────────────── */}
      {!showPrelevements && (
        <MiniLegend
          zones={zones}
          selectedElement={selectedElement}
          stats={parcelleStats}
          expanded={legendExpanded}
          onToggle={() => setLegendExpanded(v => !v)}
          cultureName={selectedElement === 'S' ? (semisCultureDefinie?.nom ?? null) : null}
          cultureId={selectedElement === 'S' ? (semisCultureDefinie?.id ?? null) : null}
        />
      )}

      {/* ── Bulle dose zone courante (même position que SearchBar) ─────── */}
      <ZoneDoseBubble info={zoneBubbleInfo} topOffset={searchTop} />

      {/* ── Bouton SIM + flèches (éditeurs multi-projets uniquement) ───── */}
      {canUseSim && (
        <Pressable
          style={[styles.simToggle, { bottom: insets.bottom + 82 }, simMode && styles.simToggleActive]}
          onPress={() => {
            if (simMode) { stopSimMove(); setSimMode(false); return; }
            let loc: LatLng | null = userLocation ?? null;
            if (zones.length > 0) {
              const first = zones[0];
              if (first.centroid) {
                loc = { latitude: first.centroid.lat, longitude: first.centroid.lng };
              } else if (first.geometry) {
                const coords = first.geometry.type === 'Polygon'
                  ? (first.geometry.coordinates as number[][][])[0]
                  : (first.geometry.coordinates as number[][][][])[0]?.[0];
                if (coords?.length) {
                  loc = {
                    latitude:  coords.reduce((s, c) => s + c[1], 0) / coords.length,
                    longitude: coords.reduce((s, c) => s + c[0], 0) / coords.length,
                  };
                }
              }
            }
            if (loc) {
              setSimLocation(loc);
              mapRef.current?.animateToRegion(
                { ...loc, latitudeDelta: 0.0008, longitudeDelta: 0.0008 },
                500,
              );
            }
            setSimMode(true);
          }}>
          <Text style={styles.simToggleText}>{simMode ? '⏹ SIM' : '▶ SIM'}</Text>
        </Pressable>
      )}

      {simMode && canUseSim && (
        <View style={[styles.simControls, { bottom: insets.bottom + 82 + 44 }]}>
          <Pressable style={styles.simArrow} onPressIn={() => startSimMove( 2,  0)} onPressOut={stopSimMove}>
            <Text style={styles.simArrowText}>▲</Text>
          </Pressable>
          <View style={styles.simRow}>
            <Pressable style={styles.simArrow} onPressIn={() => startSimMove( 0, -2)} onPressOut={stopSimMove}>
              <Text style={styles.simArrowText}>◀</Text>
            </Pressable>
            <View style={{ width: 36 }} />
            <Pressable style={styles.simArrow} onPressIn={() => startSimMove( 0,  2)} onPressOut={stopSimMove}>
              <Text style={styles.simArrowText}>▶</Text>
            </Pressable>
          </View>
          <Pressable style={styles.simArrow} onPressIn={() => startSimMove(-2,  0)} onPressOut={stopSimMove}>
            <Text style={styles.simArrowText}>▼</Text>
          </Pressable>
        </View>
      )}


      {/* ── Bouton sortie mode conduite ──────────────────────────────── */}
      {conduiteMode && (
        <Pressable
          style={[styles.conduiteExitBtn, { bottom: insets.bottom + 8 }]}
          onPress={stopConduite}>
          <MaterialCommunityIcons name="tractor" size={16} color="#fff" />
          <Text style={styles.conduiteExitText}>MODE CONDUITE  ·  Quitter</Text>
        </Pressable>
      )}

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
          isEditeur={isEditeur}
          typeSols={typeSols}
          onClose={() => { setZoneFormVisible(false); setSelectedZoneIdx(null); }}
          onRecopie={() => {
            setZoneFormVisible(false);
            Alert.alert('Recopie', 'Fonctionnalité à implémenter');
          }}
          onSave={async (data: ZoneEngraisData) => {
            const fert = selectedElement ?? 'P';
            const shouldPatch = data.perso_rendement || data.perso_dose || data.id_type_sol != null;
            if (shouldPatch) {
              try {
                const res = await patchZoneEngrais(data.num_zone, fert, {
                  perso_rendement: data.perso_rendement,
                  rendement: data.rendement > 0 ? data.rendement : null,
                  perso_dose: data.perso_dose,
                  dose: data.dose >= 0 ? data.dose : null,
                  ...(data.id_type_sol != null ? { id_type_sol: data.id_type_sol } : {}),
                });
                setZones(prev => prev.map(z => {
                  if (z.num_zone !== data.num_zone) return z;
                  return {
                    ...z,
                    style: z.style && res.couleur
                      ? { ...z.style, fillColor: res.couleur }
                      : z.style,
                    properties: z.properties
                      ? {
                          ...z.properties,
                          ...(res.id_type_sol != null ? { id_type_sol: res.id_type_sol } : {}),
                          ...(res.dose != null ? { dose: res.dose } : {}),
                        }
                      : z.properties,
                  };
                }));
                if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
                setFlashZoneNum(data.num_zone);
                flashTimerRef.current = setTimeout(() => setFlashZoneNum(null), 700);
                setLegendExpanded(true);
                showSuccess('Zone enregistrée');
              } catch (e) {
                // Message clair pour l'agriculteur ; on garde le formulaire ouvert pour réessayer.
                showError(friendlyError(e, "Impossible d'enregistrer la zone. Réessayez dans un instant."));
                return;
              }
            }
            setZoneFormVisible(false);
            setSelectedZoneIdx(null);
          }}
        />
      )}

      {/* ── Formulaire zone libre (Z) ────────────────────────────────── */}
      {selectedZone !== null && selectedId !== null && (
        <FormulaireZoneLibre
          visible={zoneLibreFormVisible}
          zone={{
            num_zone: selectedZone.num_zone ?? (zones.indexOf(selectedZone) + 1),
            properties: {
              ...(selectedZone.properties ?? {}),
              dose: zoneEngraisDetail?.dose ?? selectedZone.properties?.dose,
            },
            style: selectedZone.style ? { fillColor: selectedZone.style.fillColor } : undefined,
          }}
          parcelle={{
            id: parcelleDbId ?? Number(features[selectedId]?.properties?.id_parcel ?? selectedId),
            nom: features[selectedId]?.properties?.nom_parcel ?? 'Parcelle',
          }}
          fertilisant={zoneLibreFertilisant}
          isEditeur={isEditeur}
          typeSols={typeSols}
          onClose={() => { setZoneLibreFormVisible(false); setSelectedZoneIdx(null); }}
          onSave={() => {
            setZoneLibreFormVisible(false);
            setSelectedZoneIdx(null);
            const dbId = parcelleDbId ?? Number(
              features[selectedId]?.properties?.id_parcel ??
              features[selectedId]?.properties?.id ?? selectedId,
            );
            setLoadingZones(true);
            getParcelleDetails(dbId, zoneLibreFertilisant)
              .then(detail => {
                setZones(detail.zones);
                setParcelleStats(detail.stats);
                setLegendExpanded(true);
              })
              .catch(() => {})
              .finally(() => setLoadingZones(false));
            showSuccess('Zone enregistrée');
          }}
        />
      )}

      {/* ── Formulaire zone semis ────────────────────────────────────── */}
      {selectedZone !== null && semisCultureDefinie !== null && selectedId !== null && (
        <FormulaireZoneSemis
          visible={zoneSemisFormVisible}
          zone={{
            num_zone: selectedZone.num_zone ?? (zones.indexOf(selectedZone) + 1),
            properties: {
              ...( selectedZone.properties ?? {}),
              dose_base:  zoneEngraisDetail?.dose_base  ?? selectedZone.properties?.dose,
              tx_pierre:  zoneEngraisDetail?.tx_pierre  ?? selectedZone.properties?.tx_pierre,
              dose:       zoneEngraisDetail?.dose       ?? selectedZone.properties?.dose,
            },
          }}
          parcelle={{
            id: parcelleDbId ?? Number(features[selectedId]?.properties?.id_parcel ?? selectedId),
            nom: features[selectedId]?.properties?.nom_parcel ?? 'Parcelle',
          }}
          culture={semisCultureDefinie}
          allowDosageManuel={zoneEngraisDetail?.allow_dosage_manuel === 1}
          isEditeur={isEditeur}
          typeSols={typeSols}
          onClose={() => { setZoneSemisFormVisible(false); setSelectedZoneIdx(null); }}
          onSave={() => {
            setZoneSemisFormVisible(false);
            setSelectedZoneIdx(null);
            showSuccess('Zone semis enregistrée');
            // Recharger les zones semis
            const dbId = parcelleDbId ?? Number(
              features[selectedId]?.properties?.id_parcel ??
              features[selectedId]?.properties?.id ??
              selectedId,
            );
            setLoadingZones(true);
            getParcelleDetails(dbId, 'S')
              .then(data => {
                setZones(data.zones);
                setParcelleStats(data.stats);
                setPrelevements(data['prélevements'] ?? []);
                setLegendExpanded(true);
              })
              .finally(() => setLoadingZones(false));
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
          if (selectionCultureContext === 'zone') {
            setZoneSemisFormVisible(true);
          } else {
            setFormulaireSemisVisible(true);
          }
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
                })
                .catch(() => {});
              showSuccess('Formulaire enregistré');
            } catch (err: unknown) {
              showError(friendlyError(err, "Impossible d'enregistrer la fiche. Réessayez dans un instant."));
            }
          }}
        />
      )}

      {/* ── Écran de connexion ────────────────────────────────────────── */}
      {sessionChecked && !isAuthenticated && (
        <LoginModal onSuccess={() => { setIsAuthenticated(true); hydrateAccountContext(); }} />
      )}
      </View>{/* fin overlays UI */}

      {/* ── Modal sélection mode tracteur ─────────────────────────────── */}
      <TracteurModeModal
        visible={tracteurModalVisible}
        onClose={() => setTracteurModalVisible(false)}
        onSelect={handleModeSelect}
      />

      {/* ── Modal calibration machine ──────────────────────────────────── */}
      <CalibrationModal
        visible={calibrationModalVisible}
        mode={pendingConduiteMode}
        onClose={() => setCalibrationModalVisible(false)}
        onConfirm={handleCalibrationConfirm}
      />

      {/* ── Modal conversion Agribox ───────────────────────────────────── */}
      <AgriboxModal
        visible={agriboxModalVisible}
        fileUri={agriboxFileUri}
        fileName={agriboxFileName}
        onClose={() => setAgriboxModalVisible(false)}
      />

      {/* ── Modal changement de projet ─────────────────────────────────── */}
      {/* ── Menu Compte ───────────────────────────────────────────────── */}
      <Modal visible={accountMenuVisible} transparent animationType="fade" onRequestClose={() => setAccountMenuVisible(false)}>
        <Pressable style={styles.accountMenuBg} onPress={() => setAccountMenuVisible(false)}>
          <View
            style={[styles.accountMenuCard, { top: iconBarTop, right: 74 }]}
            onStartShouldSetResponder={() => true}>
            <Text style={styles.accountMenuHeader}>COMPTE</Text>
            {accountInfo && (
              <View style={styles.accountUserRow}>
                <View style={styles.accountAvatar}>
                  <Ionicons name="person" size={16} color="#2E7D32" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountUserName} numberOfLines={1}>{accountDisplayName}</Text>
                  {currentRepoLabel ? (
                    <Text style={styles.accountUserSub} numberOfLines={1}>{currentRepoLabel}</Text>
                  ) : null}
                </View>
              </View>
            )}
            {switchRepos.length > 1 && (
              <Pressable
                style={({ pressed }) => [styles.accountAction, pressed && { opacity: 0.6 }]}
                onPress={() => { setAccountMenuVisible(false); void handleSwitchProject(); }}>
                <Ionicons name="swap-horizontal-outline" size={18} color="#546E7A" />
                <Text style={styles.accountActionText}>Changer de projet</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.accountAction,
                switchRepos.length > 1 && styles.accountActionDivider,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => { setAccountMenuVisible(false); handleLogout(); }}>
              <Ionicons name="log-out-outline" size={18} color="#c0392b" />
              <Text style={[styles.accountActionText, { color: '#c0392b' }]}>Se déconnecter</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={switchProjectVisible} transparent animationType="fade" onRequestClose={() => setSwitchProjectVisible(false)}>
        <Pressable style={styles.switchModalBg} onPress={() => setSwitchProjectVisible(false)}>
          <View style={styles.switchModalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.switchModalTitle}>Changer de projet</Text>
            <View style={styles.legendDivider} />
            {switchRepos.length > 3 && (
              <View style={styles.switchSearchBox}>
                <Ionicons name="search-outline" size={14} color="#9E9E9E" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.switchSearchInput}
                  placeholder="Rechercher un projet…"
                  placeholderTextColor="#BDBDBD"
                  value={switchSearch}
                  onChangeText={setSwitchSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
              </View>
            )}
            <ScrollView
              style={styles.switchRepoList}
              bounces={false}
              showsVerticalScrollIndicator={switchRepos.length > 5}
              keyboardShouldPersistTaps="handled">
              {switchRepos
                .filter(r => switchSearch.trim() === '' ||
                  r.label.toLowerCase().includes(switchSearch.trim().toLowerCase()))
                .map(repo => (
                  <Pressable
                    key={repo.cle}
                    style={({ pressed }) => [styles.switchRepoItem, pressed && { opacity: 0.7 }]}
                    onPress={() => { void handleSelectProject(repo); }}>
                    <Text style={styles.switchRepoEmoji}>🚜</Text>
                    <Text style={styles.switchRepoName}>{repo.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#BDBDBD" />
                  </Pressable>
                ))}
            </ScrollView>
            <Pressable style={styles.switchCancelBtn} onPress={() => setSwitchProjectVisible(false)}>
              <Text style={styles.switchCancelText}>Annuler</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Indicateur chargement switch ───────────────────────────────── */}
      {switchLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      )}

      {/* ── Modal rapport ──────────────────────────────────────────────── */}
      <Modal visible={reportVisible} transparent animationType="fade" onRequestClose={() => setReportVisible(false)}>
        <View style={styles.reportModalBg}>
          <ScrollView
            style={styles.reportScroll}
            contentContainerStyle={{ alignItems: 'center' }}
            showsVerticalScrollIndicator={false}
            bounces={false}>
            <View style={styles.reportCardScale}>
          <ReportCard
            ref={reportRef}
            parcelleName={
              selectedId !== null
                ? (features[selectedId]?.properties?.nom_parcel ?? 'Parcelle')
                : 'Parcelle'
            }
            elementLabel={ELEMENT_LABELS[selectedElement ?? ''] ?? (selectedElement ?? '')}
            isSemis={selectedElement === 'S' || selectedElement === 'Z'}
            doseUnit={
              selectedElement === 'Z' ? '' :
              selectedElement === 'S'
                ? (semisCultureDefinie?.id === 3 ? 'gr/ha' : 'kg/q')
                : 'kg/ha'
            }
            cultureName={reportCultureName}
            teneurEngrais={reportTeneurEngrais}
            objRendement={reportObjRendement}
            entries={zones.length > 0 && selectedElement
              ? buildLegendEntries(zones, selectedElement).map(e => ({
                  fillColor: e.fillColor,
                  label: e.label,
                  teneur: e.teneur,
                  dose: e.dose,
                  surf_ha: e.surf_ha,
                }))
              : []}
            stats={parcelleStats ? {
              superficie: parcelleStats.superficie_parcelle > 0
                ? parcelleStats.superficie_parcelle
                : parcelleStats.surface_totale,
              dose_moyenne: parcelleStats.dose_moyenne,
              teneur_moyenne: parcelleStats.teneur_moyenne,
              nombre_zones: parcelleStats.nombre_zones,
            } : null}
            totalDose={(() => {
              if (!zones.length || !selectedElement) return null;
              const entries = buildLegendEntries(zones, selectedElement);
              if (entries.length === 0) return null;
              return entries.reduce((acc, e) =>
                e.dose !== null && e.surf_ha > 0 ? acc + e.dose * e.surf_ha : acc, 0);
            })()}
            date={new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
            year={new Date().getFullYear()}
            mapUri={mapCaptureUri}
          />
            </View>{/* reportCardScale */}
          </ScrollView>
          <View style={styles.reportModalBtns}>
            <Pressable style={styles.reportBtnShare} onPress={() => { void handleCaptureReport(); }}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.reportBtnShareText}>Partager / Enregistrer</Text>
            </Pressable>
            <Pressable style={styles.reportBtnClose} onPress={() => setReportVisible(false)}>
              <Text style={styles.reportBtnCloseText}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    zIndex: 100,
    ...SHADOW,
  },
  iconBtn: {
    width: 54,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingBottom: 2,
    gap: 2,
  },
  iconLabel: {
    fontSize: 9,
    color: '#546E7A',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  iconLabelActive: {
    color: '#2E7D32',
  },
  iconTooltip: {
    position: 'absolute',
    right: 62,
    backgroundColor: 'rgba(30,30,30,0.82)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 200,
    minWidth: 80,
  },
  iconTooltipText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
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
    paddingVertical: 12,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B5F6E',
    letterSpacing: 0.2,
  },
  panelDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 0,
  },
  panelScrollContent: {
    paddingTop: 4,
    paddingBottom: 8,
  },

  // ── Sections (plates) ───────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B5E20',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ECECEC',
    marginHorizontal: 18,
    marginVertical: 2,
  },

  // ── Pills ──────────────────────────────────────────────────────────────────
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  pill: {
    backgroundColor: '#F2F4F5',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCE3E5',
  },
  pillActive: {
    backgroundColor: '#2B5F6E',
    borderColor: '#2B5F6E',
  },
  pillText: {
    fontSize: 12,
    color: '#4A5A5F',
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

  // ── Simulation GPS ────────────────────────────────────────────────────────
  simDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,140,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  simDotInner: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#FF8C00', borderWidth: 2.5, borderColor: '#fff', elevation: 6,
  },
  simToggle: {
    position: 'absolute', right: 14,
    backgroundColor: 'rgba(30,30,30,0.82)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  simToggleActive: { backgroundColor: 'rgba(200,80,0,0.9)' },
  simToggleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  simControls: { position: 'absolute', right: 14, alignItems: 'center', gap: 4 },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  simArrow: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: 'rgba(30,30,30,0.80)',
    alignItems: 'center', justifyContent: 'center',
  },
  simArrowText: { color: '#fff', fontSize: 16 },

  switchModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // ── Menu Compte ────────────────────────────────────────────────────────────
  accountMenuBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  accountMenuCard: {
    position: 'absolute',
    width: 210,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 4,
    ...SHADOW,
  },
  accountMenuHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#90A0AB',
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 7,
  },
  accountUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingBottom: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  accountAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(46,125,50,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountUserName: { fontSize: 13, fontWeight: '700', color: '#263238' },
  accountUserSub: { fontSize: 11, color: '#90A0AB' },
  accountAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accountActionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEEEEE',
  },
  accountActionText: { fontSize: 13, fontWeight: '600', color: '#37474F' },

  // ── Bandeau analyses (légende couleurs par zone + PDF) ──────────────────────
  analyseBanner: {
    position: 'absolute',
    bottom: 56,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 170,
    maxWidth: 240,
    zIndex: 90,
    ...SHADOW,
  },
  analyseBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  analyseBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#37474F',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  analyseDownloadBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(46,125,50,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyseLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  analyseSwatch: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  analyseLegendText: {
    fontSize: 11,
    color: '#546E7A',
    fontWeight: '600',
    flex: 1,
  },

  // ── Viewer PDF plein écran (iOS) ──────────────────────────────────────────
  pdfViewerContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  pdfViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: '#1A1A1A',
  },
  pdfViewerBack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pdfViewerBackLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 2,
  },
  pdfViewerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 12,
  },
  pdfViewerWeb: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  pdfViewerLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
  },
  switchModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    width: '100%',
    maxWidth: 380,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  switchModalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2C4A1A',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  switchRepoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  switchSearchBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#D0E4BE', borderRadius: 8,
    backgroundColor: '#F7FBF2', paddingHorizontal: 10, height: 38,
    marginHorizontal: 16, marginBottom: 8,
  },
  switchSearchInput: { flex: 1, fontSize: 13, color: '#333' },
  switchRepoList:   { maxHeight: 320 },
  switchRepoEmoji:  { fontSize: 20 },
  switchRepoName:   { flex: 1, fontSize: 14, color: '#2C4A1A', fontWeight: '500' },
  switchCancelBtn:  { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  switchCancelText: { fontSize: 14, color: '#888', fontWeight: '600' },
  reportModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  reportScroll: {
    maxHeight: '78%',
    width: '100%',
  },
  reportCardScale: {
    transform: [{ scale: 0.82 }],
    transformOrigin: 'top center',
  },
  reportModalBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  reportBtnShare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2E6B1A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  reportBtnShareText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  reportBtnClose: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  reportBtnCloseText: { fontSize: 14, fontWeight: '600', color: '#fff' },
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
  warnMsgWrap: {
    position: 'absolute',
    alignSelf: 'center',
    top: 100,
    maxWidth: '88%',
    zIndex: 96,
  },
  warnMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F57C00',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    ...SHADOW,
  },
  warnMsgText: {
    flexShrink: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  successMsgWrap: {
    position: 'absolute',
    alignSelf: 'center',
    top: 100,
    maxWidth: '88%',
    zIndex: 96,
  },
  successMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2E7D32',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    ...SHADOW,
  },
  errorMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#C62828',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    ...SHADOW,
  },
  successMsgText: {
    flexShrink: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
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
    width: 28,
    height: 28,
    borderRadius: 14,
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
  legendEntry: {
    marginBottom: 7,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#333',
    flex: 1,
  },
  legendSubRow: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 19,
    marginTop: 2,
  },
  legendSubText: {
    fontSize: 10,
    color: '#777',
  },
  legendSwatchSpacer: {
    width: 13,
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
  doseLabelOverlay: {
    position: 'absolute',
    zIndex: 90,
    transform: [{ translateX: -35 }, { translateY: -12 }],
  },
  doseLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a1a',
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  doseLabelPerso: {
    backgroundColor: 'rgba(255,180,180,0.9)',
    color: '#8B0000',
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

  // ── Mode conduite ──────────────────────────────────────────────────────────
  conduiteExitBtn: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#B71C1C',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
    zIndex: 200,
    ...SHADOW,
  },
  conduiteExitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
