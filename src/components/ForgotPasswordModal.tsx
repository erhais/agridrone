import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { config } from '../config/env';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'form' | 'success';

export default function ForgotPasswordModal({ visible, onClose }: Props) {
  const [login, setLogin]     = useState('');
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [step, setStep]       = useState<Step>('form');

  function handleClose() {
    setLogin(''); setEmail(''); setError(''); setStep('form');
    onClose();
  }

  async function handleSubmit() {
    if (!login.trim() || !email.trim()) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${config.baseURL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), email: email.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail ?? `Erreur ${res.status}`);
      }
      setStep('success');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>Mot de passe oublié</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#9E9E9E" />
            </TouchableOpacity>
          </View>

          {step === 'success' ? (
            <View style={s.successBlock}>
              <Ionicons name="checkmark-circle-outline" size={52} color="#3A6B10" />
              <Text style={s.successText}>
                Si un compte correspond à ces informations, un email de réinitialisation vient d’être envoyé.
              </Text>
              <TouchableOpacity style={s.btn} onPress={handleClose}>
                <Text style={s.btnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.hint}>
                Saisissez votre identifiant et l’adresse email associée à votre compte.
              </Text>

              <View style={s.inputGroup}>
                <Ionicons name="person-outline" size={16} color="#5A8A2A" style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Identifiant"
                  placeholderTextColor="#BDBDBD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={login}
                  onChangeText={v => { setLogin(v); setError(''); }}
                />
              </View>

              <View style={s.inputGroup}>
                <Ionicons name="mail-outline" size={16} color="#5A8A2A" style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Email"
                  placeholderTextColor="#BDBDBD"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={v => { setEmail(v); setError(''); }}
                />
              </View>

              {!!error && (
                <View style={s.errorRow}>
                  <Ionicons name="alert-circle-outline" size={13} color="#D32F2F" />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.btn, loading && { opacity: 0.75 }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.btnText}>Envoyer</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
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
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#2C4A1A' },
  hint:  { fontSize: 13, color: '#666', lineHeight: 19 },
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
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 14, color: '#333' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  errorText: { fontSize: 12, color: '#D32F2F', flex: 1 },
  btn: {
    backgroundColor: '#3A6B10',
    height: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  successBlock: { alignItems: 'center', gap: 16, paddingVertical: 12 },
  successText: { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 20 },
});
