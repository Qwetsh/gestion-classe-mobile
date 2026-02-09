import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

export const triggerLightFeedback = async () => {
  if (!IS_NATIVE) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

export const triggerMediumFeedback = async () => {
  if (!IS_NATIVE) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

export const triggerHeavyFeedback = async () => {
  if (!IS_NATIVE) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

export const triggerSelectionFeedback = async () => {
  if (!IS_NATIVE) return;
  await Haptics.selectionAsync();
};

export const triggerSuccessFeedback = async () => {
  if (!IS_NATIVE) return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

export const triggerErrorFeedback = async () => {
  if (!IS_NATIVE) return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
};
