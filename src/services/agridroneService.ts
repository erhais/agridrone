import { apiService } from './api';

export interface HelloWorldResponse {
  message: string;
}

export async function helloWorld(): Promise<HelloWorldResponse> {
  return apiService.get<HelloWorldResponse>('/api/v1/hello');
}

export interface ParcelleProperties {
  nom_parcel?: string;
  demandeur?: string;
  id?: string | number;
  id_parcel?: string | number;
  link?: string;
  num_ilot?: string | number;
  num_parcel?: string | number;
  orig_parcel?: string;
  puid?: string | number;
  surf_tot?: number;
  [key: string]: unknown;
}

export interface ParcelleFeature {
  type: 'Feature';
  id?: string | number;
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: ParcelleProperties | null;
}

export interface ZoneStyle {
  fillColor: string;
  fillOpacity: number;
  color: string;
  weight: number;
  opacity: number;
  dashArray: string | null;
}

export interface ZoneProperties {
  id_class?: number | null;
  id_sol?: number | null;
  id_type_sol?: string | number | null;
  element?: string;
  label?: string;
  nom_sol?: string;
  type_sol?: string;
  dose?: number;
  teneur?: number | null;
  surf_ha?: number;
  style?: ZoneStyle;
  [key: string]: unknown;
}

export interface ZoneFeature {
  type: 'Feature';
  id?: string | number;
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: ZoneProperties | null;
}

export interface ZonesGeoJSON {
  type: 'FeatureCollection';
  features: ZoneFeature[];
}

export interface ParcellesGeoJSON {
  type: 'FeatureCollection';
  features: ParcelleFeature[];
}

export async function getParcelles(): Promise<ParcellesGeoJSON> {
  return apiService.get<ParcellesGeoJSON>('/api/v1/parcelles/qgis');
}

export async function getZones(idParcel: string | number, element: string): Promise<ZonesGeoJSON> {
  return apiService.get<ZonesGeoJSON>(
    `/api/v1/parcelles/qgis/zones?id_parcel=${encodeURIComponent(String(idParcel))}&element=${encodeURIComponent(element)}`,
  );
}

// ── Nouveau endpoint détails parcelle ────────────────────────────────────────

export interface ZoneDetailStyle {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  dashArray: string | null;
}

export interface ZoneDetailProperties {
  id_class?: number | null;
  tx_pierre?: number | null;
  id_sol?: number | null;
  id_type_sol?: string | number | null;
  element?: string;
  label?: string;
  teneur?: number | null;
  dose?: number | null;
  surface?: number;
  unite?: string;
  [key: string]: unknown;
}

export interface ZoneDetail {
  id: string;
  num_zone?: number;
  centroid?: { lat: number; lng: number };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: ZoneDetailProperties | null;
  style: ZoneDetailStyle | null;
}

export interface ParcelleInfo {
  id: number;
  nom: string;
  superficie_totale: number;
}

export interface ParcelleStats {
  nombre_zones: number;
  dose_moyenne: number | null;
  teneur_moyenne: number | null;
  surface_totale: number;
  superficie_parcelle: number;
}

export interface Prelevement {
  nom: string;
  lat: number;
  lng: number;
}

export interface ParcelleDetails {
  parcelle: ParcelleInfo;
  zones: ZoneDetail[];
  stats: ParcelleStats;
  'prélevements'?: Prelevement[];
}

export interface ReferentielItem {
  id: number;
  nom: string;
  unite?: string;
}

export async function getCultures(): Promise<ReferentielItem[]> {
  return apiService.get<ReferentielItem[]>('/api/v1/referentiel/cultures');
}

export async function getFrequences(): Promise<ReferentielItem[]> {
  return apiService.get<ReferentielItem[]>('/api/v1/referentiel/frequences');
}

export async function getPailleOptions(): Promise<ReferentielItem[]> {
  return apiService.get<ReferentielItem[]>('/api/v1/referentiel/paille');
}

export interface EngraisZoneDetail {
  num_parcel: number;
  fertilisant: string;
  id_sol: number | null;
  nom_sol: string | null;
  teneur: number | null;
  rendement: number | null;
  perso_rendement: number | null;  // 0 ou 1
  ph: number | null;
  dose: number | null;
  perso_dose: number | null;       // 0 ou 1
  allow_dosage_manuel?: number | null;
  tx_pierre?: number | null;
  dose_base?: number | null;   // dose avant correction pierre
}

export interface PierreReferentielItem {
  taux: number;   // seuil (0,5,10,15…)
  coef: number;   // coefficient (%)
}

let _pierreCache: PierreReferentielItem[] | null = null;

export async function getPierreReferentiel(): Promise<PierreReferentielItem[]> {
  if (_pierreCache) return _pierreCache;
  const data = await apiService.get<PierreReferentielItem[]>('/api/v1/referentiel/semis/pierre');
  _pierreCache = data;
  return data;
}

export function getPierreCoef(referentiel: PierreReferentielItem[], txPierre: number): number {
  // Trouver le plus grand taux <= txPierre
  let coef = 0;
  for (const item of referentiel) {
    if (item.taux <= txPierre) coef = item.coef;
    else break;
  }
  return coef;
}

export interface ZoneSemisPatch {
  tx_pierre: number;
  dose?: number | null;
  perso_dose: boolean;
}

export async function patchZoneSemis(
  numZone: number,
  data: ZoneSemisPatch,
): Promise<unknown> {
  return apiService.patch<unknown>(
    `/api/v1/formulaires/zones/${numZone}?fertilisant=S`,
    data,
  );
}

export interface EngraisZonePatch {
  rendement?: number | null;
  dose?: number | null;
}

export async function patchZoneEngrais(
  numZone: number,
  fertilisant: string,
  data: EngraisZonePatch,
): Promise<unknown> {
  return apiService.patch<unknown>(
    `/api/v1/formulaires/zones/${numZone}?fertilisant=${encodeURIComponent(fertilisant)}`,
    data,
  );
}

export async function getZoneEngraisDetail(
  numZone: number,
  fertilisant: string,
): Promise<EngraisZoneDetail | null> {
  try {
    return await apiService.get<EngraisZoneDetail>(
      `/api/v1/formulaires/zones/${numZone}?fertilisant=${encodeURIComponent(fertilisant)}`,
    );
  } catch {
    return null;
  }
}

export interface EngraisFormInput {
  id_parcel: number;
  element: string;
  annee_recolte: number;
  id_culture: number;
  id_engrais_frequence: number;
  paille: number;
  obj_rendement: number;
  teneur_engrais: number;
  double_culture?: boolean;
  rendement_specifique_zone?: boolean;
  dosage_manuel_zone?: boolean;
  qte_deja_apportee?: number;
  visible_plan_fumure?: boolean;
}

export interface EngraisFormOutput {
  id: number;
  [key: string]: unknown;
}

export interface EngraisFormGet {
  id: number;
  annee_recolte: number;
  id_culture: number;
  double_culture: boolean;
  id_engrais_frequence: number;
  obj_rendement: number;
  rendement_specifique_zone: boolean;
  teneur_engrais: number;
  dosage_manuel_zone: boolean;
  qte_deja_apportee: number;
  paille: number;
  visible_plan_fumure: boolean;
}

export interface SemisCondition {
  id: number;
  condition: string;
}

export interface SemisDefaults {
  id?: number;
  nom: string;
  id_culture: number;
  annee_recolte: number;
  id_semis_condition_sol: number;
  allow_dosage_manuel: boolean;
  commentaire: string | null;
  attributs: string[];
}

export async function getSemisConditions(): Promise<SemisCondition[]> {
  return apiService.get<SemisCondition[]>('/api/v1/formulaires/semis/conditions');
}

// Conditions de semis (Bonne/Passable/Mauvaise) — endpoint à ajouter côté BO
export async function getSemisConditionsSemis(): Promise<SemisCondition[]> {
  try {
    return await apiService.get<SemisCondition[]>('/api/v1/formulaires/semis/conditions_semis');
  } catch {
    // Fallback hardcodé jusqu'à disponibilité de l'endpoint
    return [
      { id: 1, condition: '1. Bonne' },
      { id: 2, condition: '2. Passable' },
      { id: 3, condition: '3. Mauvaise' },
    ];
  }
}

export async function getSemisDefaults(
  idParcel: number,
  idCulture: number,
): Promise<SemisDefaults | null> {
  try {
    return await apiService.get<SemisDefaults>(
      `/api/v1/formulaires/semis/defaults?id_parcel=${idParcel}&id_culture=${idCulture}`,
    );
  } catch {
    return null;
  }
}

export interface SemisFormInput {
  id_parcel: number;
  id_culture: number;
  annee_recolte: number;
  id_semis_condition_sol?: number;  // Betterave : condition du sol
  id_semis_condition?: number;      // Céréales : condition de semis
  allow_dosage_manuel?: boolean;
  commentaire?: string | null;
  // Champs spécifiques Blé (et autres cultures)
  date_semis?: string;        // YYYY-MM-DD
  pmg?: number;               // Poids de mille grains (g)
  taux_germination?: number;  // %
  second_herbicide?: boolean;
  preference?: number;
}

export interface SemisFormResponse {
  id: number;
  num_parcel: number;
  doses_recalculees: boolean;
  zones_analysees: number;
  zones_mises_a_jour: number;
  zones_dosage_manuel: number;
  [key: string]: unknown;
}

export async function postFormulairesSemis(data: SemisFormInput): Promise<SemisFormResponse> {
  return apiService.post<SemisFormResponse>('/api/v1/formulaires/semis', data);
}

export async function putFormulairesSemis(
  id: number,
  data: SemisFormInput,
): Promise<SemisFormResponse> {
  return apiService.put<SemisFormResponse>(`/api/v1/formulaires/semis/${id}`, data);
}

export interface SemisCultureResponse {
  id_culture: number;
}

export async function getSemisCulture(
  idParcel: number,
): Promise<SemisCultureResponse | null> {
  try {
    return await apiService.get<SemisCultureResponse>(
      `/api/v1/formulaires/semis/culture?id_parcel=${idParcel}`,
    );
  } catch {
    return null;
  }
}

export async function getFormulaireEngrais(
  idParcel: number,
  element: string,
): Promise<EngraisFormGet | null> {
  try {
    return await apiService.get<EngraisFormGet>(
      `/api/v1/formulaires/engrais?id_parcel=${idParcel}&element=${encodeURIComponent(element)}`,
    );
  } catch {
    return null;
  }
}

export async function postFormulaireEngrais(data: EngraisFormInput): Promise<EngraisFormOutput> {
  return apiService.post<EngraisFormOutput>('/api/v1/formulaires/engrais', data);
}

export async function getParcelleDetails(
  idParcel: string | number,
  element: string,
): Promise<ParcelleDetails> {
  return apiService.get<ParcelleDetails>(
    `/api/v1/parcelles/${encodeURIComponent(String(idParcel))}/details?element=${encodeURIComponent(element)}`,
  );
}
