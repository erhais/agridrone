import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  fetchRepositories,
  fetchToken,
  saveSession,
  clearSession as clearAuthSession,
  type AuthRepository,
} from '../services/authService';
import ForgotPasswordModal from './ForgotPasswordModal';

export { clearAuthSession as clearSession };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BG_IMG: number = require('../../assets/images/agrimodule-bg.png') as number;
const LOGO_URL = 'https://www.usedrone.fr/wp-content/uploads/2021/04/logo_usedrone.png';

interface Props {
  onSuccess: () => void;
}

type Step = 'credentials' | 'repository' | 'no_repo';

export default function LoginModal({ onSuccess }: Props) {
  const [step,         setStep]         = useState<Step>('credentials');
  const [login,        setLogin]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [rememberMe,   setRememberMe]   = useState(true);
  const [repositories, setRepositories] = useState<AuthRepository[]>([]);
  const [repoSearch,   setRepoSearch]   = useState('');
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [noRepoCountdown, setNoRepoCountdown] = useState<number | null>(null);
  const [forgotVisible, setForgotVisible]     = useState(false);
  const noRepoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Nettoyage timer déconnexion
  useEffect(() => () => {
    if (noRepoTimerRef.current) clearInterval(noRepoTimerRef.current);
  }, []);

  const shake = () =>
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();

  // ── Étape 1 : vérification identifiants + liste dépôts ───────────────────
  const handleLogin = async () => {
    if (!login.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs.');
      shake();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const repos = await fetchRepositories(login.trim(), password);
      if (repos.length === 0) {
        setStep('no_repo');
        setNoRepoCountdown(5);
        noRepoTimerRef.current = setInterval(() => {
          setNoRepoCountdown(prev => {
            if (prev === null || prev <= 1) {
              if (noRepoTimerRef.current) clearInterval(noRepoTimerRef.current);
              setStep('credentials');
              setLogin('');
              setPassword('');
              return null;
            }
            return prev - 1;
          });
        }, 1000);
        return;
      }
      setRepositories(repos);
      if (repos.length === 1) {
        await handleSelectRepository(repos[0]);
      } else {
        setStep('repository');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Identifiant ou mot de passe incorrect.');
      shake();
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 2 : choix du dépôt + obtention du token ────────────────────────
  const handleSelectRepository = async (repo: AuthRepository) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchToken(login.trim(), password, repo.cle);
      await saveSession(data.access_token, data.expires_in, login.trim(), password, repo.cle, rememberMe);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la connexion.');
      shake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={BG_IMG} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centered}>

        {/* Symbole logo + nom */}
        <View style={styles.brandRow}>
          <View style={styles.symbolCircle}>
            <View style={styles.symbolClip}>
              <Image source={{ uri: LOGO_URL }} style={styles.symbolImg} resizeMode="stretch" />
            </View>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.appName}>AgriDrone</Text>
            <Text style={styles.appTagline}>Cartographie & zonage de parcelles</Text>
          </View>
        </View>

        {/* Carte formulaire */}
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>

          {step === 'credentials' ? (
            <>
              <Text style={styles.cardTitle}>Connexion</Text>
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Ionicons name="person-outline" size={16} color="#5A8A2A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Identifiant"
                    placeholderTextColor="#BDBDBD"
                    value={login}
                    onChangeText={v => { setLogin(v); setError(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Ionicons name="lock-closed-outline" size={16} color="#5A8A2A" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Mot de passe"
                    placeholderTextColor="#BDBDBD"
                    value={password}
                    onChangeText={v => { setPassword(v); setError(''); }}
                    secureTextEntry={!showPwd}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={() => { void handleLogin(); }}
                  />
                  <Pressable onPress={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
                    <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={16} color="#9E9E9E" />
                  </Pressable>
                </View>
                {/* Se souvenir de moi */}
                <Pressable style={styles.rememberRow} onPress={() => setRememberMe(v => !v)}>
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <Text style={styles.rememberText}>Se souvenir de moi (30 jours)</Text>
                </Pressable>

                <Pressable style={styles.forgotLink} onPress={() => setForgotVisible(true)}>
                  <Text style={styles.forgotLinkText}>Mot de passe oublié ?</Text>
                </Pressable>

                {!!error && (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle-outline" size={13} color="#D32F2F" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
                <Pressable
                  style={({ pressed }) => [styles.loginBtn, (loading || pressed) && { opacity: 0.85 }]}
                  onPress={() => { void handleLogin(); }}
                  disabled={loading}>
                  {loading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.loginBtnText}>Continuer</Text>
                  }
                </Pressable>
              </View>
            </>
          ) : step === 'no_repo' ? (
            <View style={styles.noRepoContainer}>
              <Ionicons name="warning-outline" size={40} color="#E65100" style={{ marginBottom: 16 }} />
              <Text style={styles.noRepoTitle}>Aucun projet Agridrone</Text>
              <Text style={styles.noRepoText}>
                Aucun projet Agridrone n'est rattaché à votre compte.
              </Text>
              <Text style={styles.noRepoCountdown}>
                Déconnexion dans {noRepoCountdown}s…
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.cardTitle}>Choisir un projet</Text>
              <Text style={styles.repoSubtitle}>Sélectionnez votre exploitation</Text>
              {!!error && (
                <View style={[styles.errorRow, { marginBottom: 8 }]}>
                  <Ionicons name="alert-circle-outline" size={13} color="#D32F2F" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              {repositories.length > 3 && (
                <View style={styles.repoSearchBox}>
                  <Ionicons name="search-outline" size={14} color="#9E9E9E" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.repoSearchInput}
                    placeholder="Rechercher un projet…"
                    placeholderTextColor="#BDBDBD"
                    value={repoSearch}
                    onChangeText={setRepoSearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                  />
                </View>
              )}
              <ScrollView
                style={[styles.repoList, repositories.length > 3 && styles.repoListTall]}
                bounces={false}
                showsVerticalScrollIndicator={repositories.length > 5}>
                {repositories
                  .filter(r => repoSearch.trim() === '' ||
                    r.label.toLowerCase().includes(repoSearch.trim().toLowerCase()))
                  .map(repo => (
                    <Pressable
                      key={repo.cle}
                      style={({ pressed }) => [styles.repoItem, pressed && styles.repoItemPressed]}
                      onPress={() => { void handleSelectRepository(repo); }}
                      disabled={loading}>
                      <Text style={styles.repoEmoji}>🚜</Text>
                      <Text style={styles.repoName}>{repo.label}</Text>
                      {loading
                        ? <ActivityIndicator size="small" color="#3A6B10" />
                        : <Ionicons name="chevron-forward" size={16} color="#BDBDBD" />
                      }
                    </Pressable>
                  ))}
              </ScrollView>
              <Pressable
                style={styles.backBtn}
                onPress={() => { setStep('credentials'); setError(''); setRepoSearch(''); }}
                disabled={loading}>
                <Text style={styles.backBtnText}>← Retour</Text>
              </Pressable>
            </>
          )}

        </Animated.View>

        <Text style={styles.footer}>© UseDrone · Expertises en cartographie agricole</Text>

      </KeyboardAvoidingView>

      <ForgotPasswordModal visible={forgotVisible} onClose={() => setForgotVisible(false)} />
    </ImageBackground>
  );
}

const SYMBOL_H      = 28;
const LOGO_FULL_W   = (SYMBOL_H / 130) * 730;
const SYMBOL_CLIP_W = Math.round(LOGO_FULL_W * 0.26);

const styles = StyleSheet.create({
  bg:      { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,18,5,0.45)' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 24 },

  brandRow:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  symbolCircle: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 6,
  },
  symbolClip:   { width: SYMBOL_CLIP_W, height: SYMBOL_H, overflow: 'hidden' },
  symbolImg:    { width: LOGO_FULL_W, height: SYMBOL_H },
  brandText:    { gap: 2 },
  appName:      { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  appTagline:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.3 },

  card: {
    width: '100%', maxWidth: 380,
    backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 14,
  },
  cardTitle:    { fontSize: 17, fontWeight: '700', color: '#2C4A1A', marginBottom: 16 },
  form:         { gap: 12 },
  inputGroup:   {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#D0E4BE', borderRadius: 9,
    backgroundColor: '#F7FBF2', paddingHorizontal: 12, height: 46,
  },
  inputIcon:    { marginRight: 8 },
  input:        { flex: 1, fontSize: 14, color: '#333' },
  eyeBtn:       { padding: 4 },
  errorRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  errorText:    { fontSize: 12, color: '#D32F2F', flex: 1 },
  rememberRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox:        {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#9E9E9E',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: { backgroundColor: '#3A6B10', borderColor: '#3A6B10' },
  rememberText:    { fontSize: 12, color: '#555' },
  loginBtn:     {
    backgroundColor: '#3A6B10', height: 46, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  loginBtnText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  noRepoContainer: { alignItems: 'center', paddingVertical: 16 },
  noRepoTitle:     { fontSize: 15, fontWeight: '700', color: '#E65100', marginBottom: 10, textAlign: 'center' },
  noRepoText:      { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  noRepoCountdown: { fontSize: 13, color: '#888', fontStyle: 'italic' },

  repoSubtitle:     { fontSize: 12, color: '#666', marginBottom: 10 },
  repoSearchBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#D0E4BE', borderRadius: 8,
    backgroundColor: '#F7FBF2', paddingHorizontal: 10, height: 38,
    marginBottom: 10,
  },
  repoSearchInput: { flex: 1, fontSize: 13, color: '#333' },
  repoList:        { maxHeight: 220 },
  repoListTall:    { maxHeight: 320 },
  repoItem:         {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8F0DE',
  },
  repoItemPressed:  { backgroundColor: '#F0F7E8' },
  repoEmoji:        { fontSize: 22, width: 28, textAlign: 'center' },
  repoName:         { flex: 1, fontSize: 14, color: '#2C4A1A', fontWeight: '500' },
  backBtn:          { marginTop: 14, alignItems: 'center' },
  backBtnText:      { fontSize: 13, color: '#7A9A5C', fontWeight: '600' },

  footer: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  forgotLink:     { alignSelf: 'flex-end' },
  forgotLinkText: { fontSize: 12, color: '#5A8A2A', fontWeight: '600' },
});
