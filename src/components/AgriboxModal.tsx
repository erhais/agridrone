import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import {
  ConversionConsole,
  getConversionConsoles,
  getConversionStatus,
  lancerConversion,
} from '../services/agridroneService';
import { config } from '../config/env';
import { loadToken } from '../services/authService';

type Phase = 'loading' | 'selecting' | 'converting' | 'done' | 'error';

interface Props {
  visible: boolean;
  fileUri: string;
  fileName: string;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 3000;
const STORE_CONSOLE_ID  = 'agribox_console_id';
const STORE_FORMAT      = 'agribox_format';

const GRILLE_OPTIONS = ['10', '8', '6', '4', '2'];

const PRODUIT_OPTIONS = [
  { value: '6',  label: 'Kg/ha' },
  { value: '83', label: 'L/ha' },
  { value: '92', label: 'cm' },
  { value: '93', label: 'Nbre/ha' },
];

export default function AgriboxModal({ visible, fileUri, fileName, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [consoles, setConsoles] = useState<ConversionConsole[]>([]);
  const [selectedConsole, setSelectedConsole] = useState<ConversionConsole | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [selectedGrid, setSelectedGrid] = useState('10');
  const [selectedProduit, setSelectedProduit] = useState('6');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
  const [convertingFormat, setConvertingFormat] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const cardHeightsRef = useRef<Record<number, number>>({});

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (!visible) {
      stopPolling();
      return;
    }
    setPhase('loading');
    setConsoles([]);
    setSelectedConsole(null);
    setSelectedFormat('');
    setSelectedGrid('10');
    setSelectedProduit('6');
    setStatusMessage('');
    setErrorMessage('');
    setJobId(null);
    setDownloadFilename(null);

    getConversionConsoles()
      .then(async list => {
        setConsoles(list);
        const [savedId, savedFormat] = await Promise.all([
          SecureStore.getItemAsync(STORE_CONSOLE_ID),
          SecureStore.getItemAsync(STORE_FORMAT),
        ]);
        const preferred = savedId ? list.find(c => String(c.id) === savedId) : null;
        const target = preferred ?? list[0] ?? null;
        setSelectedConsole(target);
        if (savedFormat) setSelectedFormat(savedFormat);
        setPhase('selecting');
        if (target && preferred) {
          const idx = list.indexOf(target);
          setTimeout(() => {
            const offset = Object.values(cardHeightsRef.current)
              .slice(0, idx)
              .reduce((sum, h) => sum + h, 0);
            scrollRef.current?.scrollTo({ y: offset, animated: true });
          }, 150);
        }
      })
      .catch(err => {
        setErrorMessage((err as Error).message ?? 'Impossible de charger les consoles');
        setPhase('error');
      });
  }, [visible]);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const parseFormats = (fmt: string) =>
    fmt.split('.').map(f => f.trim()).filter(Boolean);

  const consoleFormats = selectedConsole ? parseFormats(selectedConsole.format) : [];
  const activeFormat = selectedFormat || consoleFormats[0] || '';
  const isIsoxml = activeFormat.toLowerCase() === 'isoxml';

  const handleConvertir = async () => {
    if (!selectedConsole) return;
    setPhase('converting');
    setConvertingFormat(activeFormat.toUpperCase());
    setStatusMessage('Envoi du fichier…');
    void SecureStore.setItemAsync(STORE_CONSOLE_ID, String(selectedConsole.id)).catch(() => {});
    void SecureStore.setItemAsync(STORE_FORMAT, activeFormat).catch(() => {});
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        setErrorMessage(`Fichier introuvable : ${fileUri}`);
        setPhase('error');
        return;
      }
      const { job_id } = await lancerConversion(
        fileUri,
        fileName,
        selectedConsole.id,
        selectedConsole.model,
        activeFormat,
        isIsoxml ? selectedGrid : undefined,
        isIsoxml ? selectedProduit : undefined,
      );
      setJobId(job_id);

      pollRef.current = setInterval(async () => {
        try {
          const status = await getConversionStatus(job_id);
          setStatusMessage(status.message);
          if (status.error) {
            stopPolling();
            setErrorMessage(status.message);
            setPhase('error');
          } else if (status.done && status.download_ready) {
            stopPolling();
            if (status.filename) setDownloadFilename(status.filename);
            setPhase('done');
          } else if (status.done) {
            setStatusMessage('Préparation du fichier…');
          }
        } catch (err) {
          stopPolling();
          setErrorMessage((err as Error).message ?? 'Erreur de conversion');
          setPhase('error');
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setErrorMessage((err as Error).message ?? 'Erreur lors du lancement');
      setPhase('error');
    }
  };

  const handleTelecharger = async () => {
    if (!jobId) return;
    try {
      setStatusMessage('Téléchargement…');
      const token = await loadToken();
      const outName = downloadFilename ?? fileName.replace(/\.zip$/i, '') + '_console.zip';
      const outPath = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '') + outName;
      const url = `${config.baseURL}/api/v1/conversion/download/${encodeURIComponent(jobId)}`;
      const result = await FileSystem.downloadAsync(url, outPath, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (result.status !== 200) {
        setErrorMessage(`Erreur téléchargement : HTTP ${result.status}`);
        setPhase('error');
        return;
      }
      await Sharing.shareAsync(result.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
    } catch (err) {
      setErrorMessage((err as Error).message ?? 'Erreur de téléchargement');
      setPhase('error');
    }
  };

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <MaterialCommunityIcons name="monitor-dashboard" size={22} color="#1565C0" />
            <Text style={styles.title}>Envoi vers console</Text>
          </View>

          {phase === 'loading' && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#1565C0" />
              <Text style={styles.hint}>Chargement des consoles…</Text>
            </View>
          )}

          {phase === 'selecting' && (
            <>
              <Text style={styles.sectionLabel}>Terminal</Text>
              <ScrollView ref={scrollRef} style={styles.consoleList} showsVerticalScrollIndicator={false}>
                {consoles.map((c, idx) => {
                  const isSelected = selectedConsole?.id === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={[styles.consoleCard, isSelected && styles.consoleCardSelected]}
                      onLayout={(e: LayoutChangeEvent) => {
                        cardHeightsRef.current[idx] = e.nativeEvent.layout.height;
                      }}
                      onPress={() => { setSelectedConsole(c); setSelectedFormat(''); }}>
                      <MaterialCommunityIcons
                        name="controller-classic"
                        size={20}
                        color={isSelected ? '#1565C0' : '#9E9E9E'}
                      />
                      <View style={styles.consoleInfo}>
                        <Text style={[styles.consoleModel, isSelected && { color: '#1565C0' }]}>
                          {c.model}
                        </Text>
                        <Text style={styles.consoleFormat}>
                          {parseFormats(c.format).map(f => f.toUpperCase()).join(' · ')}
                        </Text>
                      </View>
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {consoleFormats.length > 1 && (
                <View style={styles.paramsSection}>
                  <Text style={styles.sectionLabel}>Format de sortie</Text>
                  <View style={styles.chipRow}>
                    {consoleFormats.map(f => (
                      <Pressable
                        key={f}
                        style={[styles.chip, activeFormat === f && styles.chipSelected]}
                        onPress={() => setSelectedFormat(f)}>
                        <Text style={[styles.chipText, activeFormat === f && styles.chipTextSelected]}>
                          {f.toUpperCase()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {isIsoxml && (
                <View style={styles.paramsSection}>
                  <Text style={styles.sectionLabel}>Taille de grille (m)</Text>
                  <View style={styles.chipRow}>
                    {GRILLE_OPTIONS.map(g => (
                      <Pressable
                        key={g}
                        style={[styles.chip, selectedGrid === g && styles.chipSelected]}
                        onPress={() => setSelectedGrid(g)}>
                        <Text style={[styles.chipText, selectedGrid === g && styles.chipTextSelected]}>
                          {g}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Unité produit</Text>
                  <View style={styles.chipRow}>
                    {PRODUIT_OPTIONS.map(p => (
                      <Pressable
                        key={p.value}
                        style={[styles.chip, selectedProduit === p.value && styles.chipSelected]}
                        onPress={() => setSelectedProduit(p.value)}>
                        <Text style={[styles.chipText, selectedProduit === p.value && styles.chipTextSelected]}>
                          {p.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.buttons}>
                <Pressable style={styles.btnCancel} onPress={handleClose}>
                  <Text style={styles.btnCancelText}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[styles.btnAction, !selectedConsole && styles.btnDisabled]}
                  onPress={() => { void handleConvertir(); }}
                  disabled={!selectedConsole}>
                  <MaterialCommunityIcons name="upload" size={18} color="#fff" />
                  <Text style={styles.btnActionText}>Convertir</Text>
                </Pressable>
              </View>
            </>
          )}

          {phase === 'converting' && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#1565C0" />
              <Text style={styles.statusMsg}>
                {statusMessage === 'Envoi du fichier…' || statusMessage === 'Préparation du fichier…'
                  ? statusMessage
                  : `Conversion ${convertingFormat} en cours…`}
              </Text>
              <Text style={styles.hint}>Veuillez patienter</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={styles.centerBox}>
              <MaterialCommunityIcons name="check-circle" size={56} color="#2E7D32" />
              <Text style={styles.doneText}>Conversion terminée</Text>
              <Pressable style={styles.btnDownload} onPress={() => { void handleTelecharger(); }}>
                <MaterialCommunityIcons name="download" size={20} color="#fff" />
                <Text style={styles.btnActionText}>Télécharger</Text>
              </Pressable>
              <Pressable style={styles.btnCancelSmall} onPress={handleClose}>
                <Text style={styles.btnCancelText}>Fermer</Text>
              </Pressable>
            </View>
          )}

          {phase === 'error' && (
            <View style={styles.centerBox}>
              <MaterialCommunityIcons name="alert-circle" size={48} color="#C62828" />
              <Text style={styles.errorText}>{errorMessage || 'Une erreur est survenue'}</Text>
              <Pressable style={styles.btnCancelSmall} onPress={handleClose}>
                <Text style={styles.btnCancelText}>Fermer</Text>
              </Pressable>
            </View>
          )}
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
    paddingBottom: 32,
    maxHeight: '85%',
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
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  consoleList: {
    maxHeight: 180,
  },
  paramsSection: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  consoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    backgroundColor: '#FAFAFA',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  consoleCardSelected: {
    borderColor: '#1565C0',
    backgroundColor: '#EEF4FF',
  },
  consoleInfo: {
    flex: 1,
  },
  consoleModel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  consoleFormat: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D0D0D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#1565C0',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1565C0',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: '#1565C0',
    backgroundColor: '#EEF4FF',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
  },
  chipTextSelected: {
    color: '#1565C0',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 14,
  },
  statusMsg: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  doneText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2E7D32',
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C62828',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
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
  btnCancelSmall: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
  },
  btnAction: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#1565C0',
  },
  btnDisabled: {
    backgroundColor: '#BDBDBD',
  },
  btnDownload: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: '#2E7D32',
  },
  btnActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
