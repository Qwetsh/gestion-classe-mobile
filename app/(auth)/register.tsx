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
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Link } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '../../stores';
import { theme } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_HEIGHT = 240;
const CURVE_HEIGHT = 40;

function CurvedSeparator() {
  return (
    <View style={styles.curveContainer}>
      <Svg width={SCREEN_WIDTH} height={CURVE_HEIGHT} viewBox={`0 0 ${SCREEN_WIDTH} ${CURVE_HEIGHT}`}>
        <Path
          d={`M0,0 L0,0 Q${SCREEN_WIDTH / 2},${CURVE_HEIGHT * 2} ${SCREEN_WIDTH},0 L${SCREEN_WIDTH},${CURVE_HEIGHT} L0,${CURVE_HEIGHT} Z`}
          fill={theme.colors.background}
        />
      </Svg>
    </View>
  );
}

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      {/* Gradient Header Background */}
      <LinearGradient
        colors={['#4F46E5', '#7C3AED', '#9333EA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      />
      <CurvedSeparator />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header on gradient */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>GC</Text>
              </View>
            </View>
            <Text style={styles.title}>Créer un compte</Text>
            <Text style={styles.subtitle}>
              Rejoignez Gestion Classe pour commencer
            </Text>
          </View>

          {/* Form on white background */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputContainer}>
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
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mot de passe</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, displayError && styles.inputError]}
                  placeholder="Minimum 8 caractères"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setValidationError(null);
                    clearError();
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                  editable={!isLoading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <View style={styles.inputContainer}>
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
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                  editable={!isLoading}
                />
              </View>
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
              <LinearGradient
                colors={['#4F46E5', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>S'inscrire</Text>
                )}
              </LinearGradient>
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
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
  },
  curveContainer: {
    position: 'absolute',
    top: HEADER_HEIGHT - CURVE_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingBottom: theme.spacing.lg,
  },
  logoContainer: {
    marginBottom: theme.spacing.md,
  },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoText: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: theme.spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginTop: theme.spacing.md,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  inputContainer: {
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  input: {
    borderWidth: 0,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
  },
  inputError: {
    borderWidth: 2,
    borderColor: theme.colors.error,
  },
  errorContainer: {
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    marginTop: theme.spacing.sm,
    ...theme.shadows.primary,
  },
  buttonGradient: {
    paddingVertical: theme.spacing.md + 2,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: theme.colors.textInverse,
    fontSize: 17,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  footerLink: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
