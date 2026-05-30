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

export interface EngraisFormInput {
  id_parcel: number;
  element: string;
  annee_recolte: number;
  id_culture: number;
  id_frequence: number;
  id_paille: number;
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
