import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router, Link } from 'expo-router';
import { BookOpen, Eye, EyeOff } from 'lucide-react-native';
import { useAuthStore } from '../../stores';
import { theme } from '../../constants/theme';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { signUp, isLoading, error, clearError } = useAuthStore();

  const validateForm = (): boolean => {
    setValidationError(null);
    clearError();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setValidationError('L\'email est requis');
      return false;
    }
    if (!emailRegex.test(email)) {
      setValidationError('Format email invalide');
      return false;
    }

    if (!password) {
      setValidationError('Le mot de passe est requis');
      return false;
    }
    if (password.length < 8) {
      setValidationError('Le mot de passe doit contenir au moins 8 caractères');
      return false;
    }

    if (password !== confirmPassword) {
      setValidationError('Les mots de passe ne correspondent pas');
      return false;
    }

    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    const success = await signUp(email.trim().toLowerCase(), password);

    if (success) {
      router.replace('/(main)');
    }
  };

  const displayError = validationError || error;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo + titre */}
          <View style={styles.header}>
            <View style={styles.logoSquare}>
              <BookOpen size={30} color={theme.colors.textInverse} strokeWidth={2} />
            </View>
            <Text style={styles.title}>Créer un compte</Text>
            <Text style={styles.subtitle}>
              Rejoignez Gestion Classe pour commencer
            </Text>
          </View>

          {/* Formulaire */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, displayError && styles.inputError]}
                placeholder="votre@email.fr"
                placeholderTextColor={theme.colors.textTertiary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setValidationError(null);
                  clearError();
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput, displayError && styles.inputError]}
                  placeholder="Minimum 8 caractères"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setValidationError(null);
                    clearError();
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                  editable={!isLoading}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={theme.colors.textTertiary} strokeWidth={1.8} />
                  ) : (
                    <Eye size={20} color={theme.colors.textTertiary} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <TextInput
                style={[styles.input, displayError && styles.inputError]}
                placeholder="Retapez votre mot de passe"
                placeholderTextColor={theme.colors.textTertiary}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setValidationError(null);
                  clearError();
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password-new"
                editable={!isLoading}
              />
            </View>

            {displayError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{displayError}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                isLoading && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>S'inscrire</Text>
              )}
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Déjà un compte ? </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable disabled={isLoading}>
                  <Text style={styles.footerLink}>Se connecter</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logoSquare: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputGroup: {
    marginBottom: theme.spacing.md + 4,
  },
  label: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.text,
  },
  passwordRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    height: '100%',
    justifyContent: 'center',
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorContainer: {
    backgroundColor: theme.colors.errorSoft,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  buttonPressed: {
    backgroundColor: theme.colors.primaryStrong,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.body,
    fontSize: 15,
  },
  footerLink: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
  },
});
