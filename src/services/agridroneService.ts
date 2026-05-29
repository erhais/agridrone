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
  element?: string;
  label?: string;
  nom_sol?: string;
  type_sol?: string;
  dose?: number;
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
