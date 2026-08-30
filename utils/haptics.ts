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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Signatures haptiques differenciees par action (reglage "Vibrations differenciees") :
 * Implication 1 impact, Malus 2 impacts, Sortie 1 long, Absence 2 longs.
 * Si `distinct` est false, retombe sur le feedback de succes standard.
 */
export const triggerActionSignature = async (
  actionId: string,
  distinct: boolean = true
) => {
  if (!IS_NATIVE) return;
  if (!distinct) {
    await triggerSuccessFeedback();
    return;
  }
  switch (actionId) {
    case 'participation':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'bavardage':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await sleep(120);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'sortie':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'absence':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await sleep(180);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    default:
      await triggerSuccessFeedback();
  }
};
