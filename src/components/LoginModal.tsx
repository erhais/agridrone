import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

interface Props {
  onSuccess: () => void;
}

const VALID_CREDENTIALS = [{ login: 'test', password: 'test' }];

// Image locale : main + pousses dans la terre (app.usedrone.fr)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BG_IMG: number = require('../../assets/images/agrimodule-bg.png') as number;
// Logo complet — on ne montrera que le symbole gauche (drone + feuille)
const LOGO_URL = 'https://www.usedrone.fr/wp-content/uploads/2021/04/logo_usedrone.png';

export default function LoginModal({ onSuccess }: Props) {
  const [login,    setLogin]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () =>
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();

  const handleLogin = () => {
    if (!login.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs.');
      shake();
      return;
    }
    setLoading(true);
    setError('');
    setTimeout(() => {
      const valid = VALID_CREDENTIALS.some(
        c => c.login === login.trim() && c.password === password,
      );
      setLoading(false);
      if (valid) {
        onSuccess();
      } else {
        setError('Identifiant ou mot de passe incorrect.');
        shake();
      }
    }, 600);
  };

  return (
    <ImageBackground
      source={BG_IMG}
      style={styles.bg}
      resizeMode="cover">

      {/* Overlay sombre pour lisibilité */}
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centered}>

        {/* Symbole logo (drone + feuille) + nom app */}
        <View style={styles.brandRow}>
          {/* Symbole dans un rond blanc */}
          <View style={styles.symbolCircle}>
            <View style={styles.symbolClip}>
              <Image
                source={{ uri: LOGO_URL }}
                style={styles.symbolImg}
                resizeMode="stretch"
              />
            </View>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.appName}>AgriDrone</Text>
            <Text style={styles.appTagline}>Cartographie & zonage de parcelles</Text>
          </View>
        </View>

        {/* Carte formulaire */}
        <Animated.View
          style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>

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
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPwd ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color="#9E9E9E"
                />
              </Pressable>
            </View>

            {!!error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={13} color="#D32F2F" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.loginBtn,
                (loading || pressed) && { opacity: 0.85 },
              ]}
              onPress={handleLogin}
              disabled={loading}>
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.loginBtnText}>Se connecter</Text>
              }
            </Pressable>
          </View>

        </Animated.View>

        <Text style={styles.footer}>© UseDrone · Expertises en cartographie agricole</Text>

      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

// Ratio logo : ~730×130px — le symbole (drone+feuille) occupe ~180px soit 25% de la largeur
const SYMBOL_H = 28;
const LOGO_FULL_W = (SYMBOL_H / 130) * 730; // largeur totale à l'échelle
const SYMBOL_CLIP_W = Math.round(LOGO_FULL_W * 0.26); // 26% = symbole seul

const styles = StyleSheet.create({
  bg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,18,5,0.45)',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 24,
  },

  // ── Branding ────────────────────────────────────────────────────────────────
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  symbolCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  symbolClip: {
    width: SYMBOL_CLIP_W,
    height: SYMBOL_H,
    overflow: 'hidden',
  },
  symbolImg: {
    width: LOGO_FULL_W,
    height: SYMBOL_H,
  },
  brandText: {
    gap: 2,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  appTagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
  },

  // ── Carte formulaire ────────────────────────────────────────────────────────
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 14,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C4A1A',
    marginBottom: 16,
  },
  form: {
    gap: 12,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0E4BE',
    borderRadius: 9,
    backgroundColor: '#F7FBF2',
    paddingHorizontal: 12,
    height: 46,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  eyeBtn: {
    padding: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    flex: 1,
  },
  loginBtn: {
    backgroundColor: '#3A6B10',
    height: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  footer: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
