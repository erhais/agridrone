import * as SecureStore from 'expo-secure-store';

export interface CalibrationPoint {
  dose: number;
  valeur: number;
}

export interface MachineProfile {
  id: string;
  nom: string;
  mode: 'vitesse' | 'dosage';
  unite: string;
  points: CalibrationPoint[];
  updatedAt: number;
}

const STORE_KEY = 'machine_profiles_v1';

async function read(): Promise<MachineProfile[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    return raw ? (JSON.parse(raw) as MachineProfile[]) : [];
  } catch {
    return [];
  }
}

async function write(profiles: MachineProfile[]): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(profiles));
}

export async function getProfiles(mode?: 'vitesse' | 'dosage'): Promise<MachineProfile[]> {
  const all = await read();
  return mode ? all.filter(p => p.mode === mode) : all;
}

export async function saveProfile(profile: MachineProfile): Promise<void> {
  const all = await read();
  const idx = all.findIndex(p => p.id === profile.id);
  if (idx >= 0) all[idx] = profile; else all.push(profile);
  await write(all);
}

export async function deleteProfile(id: string): Promise<void> {
  const all = await read();
  await write(all.filter(p => p.id !== id));
}
