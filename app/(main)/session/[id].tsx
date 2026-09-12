import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  MessageSquare,
  Mic,
  Pencil,
  Settings,
  Shuffle,
  Trash2,
  Monitor,
} from 'lucide-react-native';
import {
  useAuthStore,
  useClassStore,
  useStudentStore,
  useRoomStore,
  usePlanStore,
  useSessionStore,
  useOralEvaluationStore,
  useGroupSessionStore,
  useStampStore,
  useSettingsStore,
  StudentWithMapping,
  type ActiveSessionState,
} from '../../../stores';
import {
  MENU_ITEMS,
  FLICK_PAUSE_DURATION,
  FLICK_DISTANCE_THRESHOLD,
} from '../../../constants/menuItems';
import {
  RandomPickerSheet,
  OralEvaluationSheet,
  SessionNoteSheet,
  SessionSettingsSheet,
  StudentPickerSheet,
  UndoBanner,
  ScreenControlSheet,
} from '../../../components/session';
import { triggerActionSignature, triggerErrorFeedback } from '../../../utils/haptics';
import { getGroupSessionByLinkedSessionId } from '../../../services/database';
import { SessionGroupView } from '../../../components/groups/SessionGroupView';
import { GroupGradingOverlay } from '../../../components/groups/GroupGradingOverlay';
import { GroupConfigSheet } from '../../../components/groups/GroupConfigSheet';
import type { SessionGroupWithDetails } from '../../../stores/groupSessionStore';
import { theme } from '../../../constants/theme';
import { getStudentAtPosition, EVENT_TYPES, EventType, SortieSubtype, Event, getStudentEventsInSession } from '../../../services/database';
import { deleteEventNow } from '../../../services/sync/liveSync';
import { connectClassroomChannel, disconnectClassroomChannel, sendClassroomCommand } from '../../../services/sync/classroomChannel';
import {
  pickFromCamera,
  pickFromGallery,
  uploadEventPhoto,
  type PhotoQuality,
} from '../../../services/photos';

// Conditional imports for native-only components
// These are only used on native platforms (iOS/Android)
import { RadialMenu } from '../../../components/radial';
import { useRadialMenu, RadialMenuSelection } from '../../../hooks/useRadialMenu';

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Session screen constants
const LONG_PRESS_DURATION = 400; // ms - Time required for long press to trigger radial menu
const TOUCH_MOVE_THRESHOLD = 20; // px - Max distance finger can move before long press is cancelled
const ABSENT_STUDENT_TAP_DELAY = 200; // ms - Delay before showing cancel absence dialog

// Web-only component
function WebNotSupportedScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Seance',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
        }}
      />
      <View style={styles.webNotSupported}>
        <Text style={styles.webNotSupportedEmoji}>📱</Text>
        <Text style={styles.webNotSupportedTitle}>
          Fonctionnalite mobile uniquement
        </Text>
        <Text style={styles.webNotSupportedText}>
          La conduite de seance avec le menu radial necessite l'application mobile.
        </Text>
        <Pressable
          style={styles.webBackButton}
          onPress={() => router.replace('/(main)/')}
        >
          <Text style={styles.webBackButtonText}>Retour a l'accueil</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Progress circle component
function ProgressCircle({
  visible,
  x,
  y,
  progress
}: {
  visible: boolean;
  x: number;
  y: number;
  progress: Animated.Value;
}) {
  if (!visible) return null;

  const size = 70;
  const strokeWidth = 4;

  return (
    <Animated.View
      style={[
        styles.progressCircle,
        {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          opacity: progress.interpolate({
            inputRange: [0, 0.1, 1],
            outputRange: [0, 1, 1],
          }),
          transform: [{
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.5, 1],
            }),
          }],
        },
      ]}
    >
      <View style={[styles.progressCircleInner, { borderWidth: strokeWidth }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              transform: [{
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              }],
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

// Native-only component
function NativeSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { loadClassById, currentClass } = useClassStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();
  const { loadRoomById, currentRoom } = useRoomStore();
  const { loadPlan, currentPlan } = usePlanStore();
  const {
    activeSession,
    eventCountsByStudent,
    activeSorties,
    endCurrentSession,
    cancelCurrentSession,
    addEvent,
    removeAbsence,
    markReturn,
    isStudentOut,
    getActiveSortie,
    updateNotes,
    loadActiveSession,
    loadSessionEvents,
  } = useSessionStore();

  const {
    evaluations,
    loadTrimesterSettings,
    loadForClass,
    addEvaluation,
    getUnevaluatedStudents,
    getEvaluatedCount,
    resetClassEvaluations,
  } = useOralEvaluationStore();

  // Stamp store
  const { categories: stampCategories, loadCategories: loadStampCategories, doAwardStamp } = useStampStore();

  // View mode toggle (plan de classe vs groupes)
  const [viewMode, setViewMode] = useState<'plan' | 'groups'>('plan');
  const [linkedGroupSession, setLinkedGroupSession] = useState<ActiveSessionState | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [hasLoadedGroups, setHasLoadedGroups] = useState(false);
  const [gradingGroup, setGradingGroup] = useState<SessionGroupWithDetails | null>(null);
  const [showGroupConfig, setShowGroupConfig] = useState(false);

  // Reset group state when navigating to a different session
  useEffect(() => {
    setViewMode('plan');
    setLinkedGroupSession(null);
    setIsLoadingGroups(false);
    setHasLoadedGroups(false);
    setGradingGroup(null);
    setShowGroupConfig(false);
  }, [id]);

  const [isInitializing, setIsInitializing] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithMapping | null>(null);
  const [showRemarqueModal, setShowRemarqueModal] = useState(false);
  const [remarqueText, setRemarqueText] = useState('');
  const [remarquePhotoUri, setRemarquePhotoUri] = useState<string | null>(null);

  // Bonus participation modal
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusPoints, setBonusPoints] = useState('3');
  const [bonusReason, setBonusReason] = useState('');
  const [timerTick, setTimerTick] = useState(0); // For updating sortie timers
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoQuality, setPhotoQuality] = useState<PhotoQuality>('minimal');

  // Oral evaluation state (sheet 9b)
  const [showOralSheet, setShowOralSheet] = useState(false);
  const [showOralStudentPicker, setShowOralStudentPicker] = useState(false);
  const [oralPickedStudent, setOralPickedStudent] = useState<StudentWithMapping | null>(null);
  const [isSavingOral, setIsSavingOral] = useState(false);

  // Tirage au sort (sheet 9a)
  const [showRandomSheet, setShowRandomSheet] = useState(false);

  // Reglages de seance (sheet 7b)
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  // Sheet « Écran » : télécommande de l'écran projeté (mode « en classe »)
  const [showScreenSheet, setShowScreenSheet] = useState(false);
  const { flickMode, distinctHaptics, compactGrid, loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecteur d'eleve pour la remarque (toolbar)
  const [showRemarquePicker, setShowRemarquePicker] = useState(false);

  // Banniere de confirmation / echec (undo du dernier evenement rapide)
  const [undoBanner, setUndoBanner] = useState<{
    visible: boolean;
    message: string;
    eventId: string | null;
    variant: 'success' | 'error';
  }>({ visible: false, message: '', eventId: null, variant: 'success' });

  // Chrono de seance (minutes ecoulees, rafraichi toutes les 30 s)
  const [sessionTick, setSessionTick] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setSessionTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Session notes state (sheet 9c)
  const [showSessionNotesSheet, setShowSessionNotesSheet] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Delete event state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStudentPickerModal, setShowStudentPickerModal] = useState(false);
  const [studentsWithEvents, setStudentsWithEvents] = useState<StudentWithMapping[]>([]);
  const [deleteStudent, setDeleteStudent] = useState<StudentWithMapping | null>(null);
  const [studentEvents, setStudentEvents] = useState<Event[]>([]);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  // Stamp modal state
  const [showStampModal, setShowStampModal] = useState(false);
  // Deux appuis rapides sur une categorie ne doivent pas donner deux tampons
  const [isAwardingStamp, setIsAwardingStamp] = useState(false);
  const [stampStudent, setStampStudent] = useState<StudentWithMapping | null>(null);
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const DOUBLE_TAP_DELAY = 300; // ms between taps for double-tap

  // Progress circle state
  const [showProgress, setShowProgress] = useState(false);
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const progressAnim = useRef(new Animated.Value(0)).current;
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Mode expert (flick) : point de depart du geste + geste deja consomme
  const flickStartRef = useRef({ x: 0, y: 0 });
  const flickHandledRef = useRef(false);

  // Container position tracking for coordinate conversion
  const containerRef = useRef<View>(null);
  const containerOffsetRef = useRef({ x: 0, y: 0 });
  // Taille de la zone de contenu : sert de limites au menu radial (clamp + flip)
  const containerBoundsRef = useRef({ width: 0, height: 0 });

  // Cleanup on unmount - prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Stop any running animations to prevent memory leaks
      progressAnim.stopAnimation();
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  // Timer update for active sorties - update every 10 seconds
  useEffect(() => {
    const hasActiveSorties = Object.keys(activeSorties).length > 0;
    if (!hasActiveSorties) return;

    const interval = setInterval(() => {
      setTimerTick((t) => t + 1);
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [activeSorties]);

  // Format elapsed time for sortie timer
  const formatElapsedTime = useCallback((timestamp: string): string => {
    const start = new Date(timestamp).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - start) / 1000); // seconds

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    if (minutes < 1) {
      return '<1m';
    } else if (minutes < 60) {
      return `${minutes}m`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h${remainingMinutes.toString().padStart(2, '0')}`;
    }
  }, [timerTick]); // Include timerTick to trigger re-renders

  const students: StudentWithMapping[] = activeSession?.class_id
    ? studentsByClass[activeSession.class_id] || []
    : [];

  // Check if a student is absent
  const isStudentAbsent = useCallback((studentId: string): boolean => {
    const counts = eventCountsByStudent[studentId];
    return counts ? counts.absence > 0 : false;
  }, [eventCountsByStudent]);

  // Handle cancelling an absence
  const handleCancelAbsence = useCallback((student: StudentWithMapping) => {
    Alert.alert(
      'Annuler l\'absence',
      `${student.fullName || student.pseudo} est marque(e) absent(e).\n\nVoulez-vous annuler cette absence ?`,
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'default',
          onPress: async () => {
            const success = await removeAbsence(student.id);
            if (!success) {
              Alert.alert('Erreur', 'Impossible d\'annuler l\'absence');
            }
          },
        },
      ]
    );
  }, [removeAbsence]);

  // Handle marking return for a student who is out
  const handleMarkReturn = useCallback((student: StudentWithMapping) => {
    const sortie = getActiveSortie(student.id);
    if (!sortie) return;

    const elapsed = formatElapsedTime(sortie.timestamp);
    const subtypeLabels: Record<string, string> = {
      infirmerie: 'infirmerie',
      toilettes: 'toilettes',
      convocation: 'convocation',
      exclusion: 'exclusion',
    };
    const subtypeLabel = sortie.subtype ? subtypeLabels[sortie.subtype] || sortie.subtype : 'sorti(e)';

    Alert.alert(
      'Retour de l\'eleve',
      `${student.fullName || student.pseudo} est ${subtypeLabel} depuis ${elapsed}.\n\nMarquer son retour ?`,
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, retour',
          style: 'default',
          onPress: async () => {
            const success = await markReturn(student.id);
            if (!success) {
              Alert.alert('Erreur', 'Impossible de marquer le retour');
            }
          },
        },
      ]
    );
  }, [getActiveSortie, formatElapsedTime, markReturn]);

  const ACTION_LABELS: Record<string, string> = {
    participation: '+1 Implication',
    bavardage: '+1 Malus',
    absence: 'Absence',
    sortie: 'Sortie',
  };

  // Banniere verte de confirmation avec undo (toute action rapide : menu ou flick)
  const showUndoBanner = useCallback((student: StudentWithMapping, actionId: string, eventId: string | null, subLabel?: string) => {
    const label = subLabel ? `${ACTION_LABELS[actionId]} · ${subLabel}` : ACTION_LABELS[actionId] || actionId;
    setUndoBanner({
      visible: true,
      message: `${student.fullName || student.pseudo} · ${label}`,
      eventId,
      variant: 'success',
    });
  }, []);

  // Banniere rouge : l'evenement n'a PAS ete enregistre (echec DB, etc.)
  const showErrorBanner = useCallback((student: StudentWithMapping) => {
    triggerErrorFeedback();
    setUndoBanner({
      visible: true,
      message: `${student.fullName || student.pseudo} · non enregistré — réessayez`,
      eventId: null,
      variant: 'error',
    });
  }, []);

  const handleUndoLastEvent = useCallback(async () => {
    const eventId = undoBanner.eventId;
    setUndoBanner({ visible: false, message: '', eventId: null, variant: 'success' });
    if (!eventId) return;
    try {
      await deleteEventNow(eventId);
      await loadSessionEvents();
    } catch (error) {
      if (__DEV__) console.error('[Session] Undo failed:', error);
    }
  }, [undoBanner.eventId, loadSessionEvents]);

  const dismissUndoBanner = useCallback(() => {
    setUndoBanner((prev) => ({ ...prev, visible: false }));
  }, []);

  // Handle selection from radial menu
  const handleRadialSelection = useCallback(async (selection: RadialMenuSelection) => {
    if (!selectedStudent) return;

    const itemId = selection.parentId || selection.itemId;
    const subItemId = selection.parentId ? selection.itemId : null;

    switch (itemId) {
      case 'participation': {
        if (selection.isBonus) {
          // Show bonus modal instead of adding 1pt
          setBonusPoints('3');
          setBonusReason('');
          setShowBonusModal(true);
          return; // Don't clear selectedStudent yet
        }
        const event = await addEvent(selectedStudent.id, EVENT_TYPES.PARTICIPATION);
        if (event) {
          triggerActionSignature('participation', distinctHaptics);
          showUndoBanner(selectedStudent, 'participation', event.id);
        } else {
          showErrorBanner(selectedStudent);
        }
        break;
      }
      case 'bavardage': {
        const event = await addEvent(selectedStudent.id, EVENT_TYPES.BAVARDAGE);
        if (event) {
          triggerActionSignature('bavardage', distinctHaptics);
          showUndoBanner(selectedStudent, 'bavardage', event.id);
        } else {
          showErrorBanner(selectedStudent);
        }
        break;
      }
      case 'absence': {
        const event = await addEvent(selectedStudent.id, EVENT_TYPES.ABSENCE);
        if (event) {
          triggerActionSignature('absence', distinctHaptics);
          showUndoBanner(selectedStudent, 'absence', event.id);
        } else {
          showErrorBanner(selectedStudent);
        }
        break;
      }
      case 'sortie': {
        if (subItemId) {
          const event = await addEvent(selectedStudent.id, EVENT_TYPES.SORTIE, subItemId as SortieSubtype);
          if (event) {
            triggerActionSignature('sortie', distinctHaptics);
            showUndoBanner(selectedStudent, 'sortie', event.id, selection.label.split(' > ')[1]);
          } else {
            showErrorBanner(selectedStudent);
          }
        }
        break;
      }
    }

    setSelectedStudent(null);
  }, [selectedStudent, addEvent, distinctHaptics, showUndoBanner, showErrorBanner]);

  const {
    menuState,
    menuPosition,
    hoveredItem,
    activeSubmenu,
    edgeProximity,
    menuScale,
    menuOpacity,
    submenuScale,
    submenuOpacity,
    bonusFillProgress,
    openMenu,
    closeMenu,
    handleTouchMove,
    handleSelection,
  } = useRadialMenu(handleRadialSelection);

  const menuOpenRef = useRef(false);
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const currentStudentRef = useRef<StudentWithMapping | null>(null);

  useEffect(() => {
    menuOpenRef.current = menuState !== 'closed';
  }, [menuState]);

  // Measure container position on layout
  const handleContainerLayout = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.measure((x, y, width, height, pageX, pageY) => {
        containerOffsetRef.current = { x: pageX, y: pageY };
        containerBoundsRef.current = { width, height };
      });
    }
  }, []);

  // Convert screen coordinates to container-relative coordinates
  const toContainerCoords = useCallback((pageX: number, pageY: number) => {
    return {
      x: pageX - containerOffsetRef.current.x,
      y: pageY - containerOffsetRef.current.y,
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Only update state if component is still mounted
    if (isMountedRef.current) {
      setShowProgress(false);
      progressAnim.setValue(0);
    }
  };

  // Handle touch start on a student cell
  const handleTouchStart = (student: StudentWithMapping, pageX: number, pageY: number) => {
    if (viewMode !== 'plan') return;
    clearLongPressTimer();

    // Check if student is absent - show cancel dialog instead of radial menu
    if (isStudentAbsent(student.id)) {
      // Short delay to distinguish from scroll
      longPressTimerRef.current = setTimeout(() => {
        handleCancelAbsence(student);
      }, ABSENT_STUDENT_TAP_DELAY);
      return;
    }

    // Check if student is out (sortie) - show return dialog instead of radial menu
    if (isStudentOut(student.id)) {
      // Short delay to distinguish from scroll
      longPressTimerRef.current = setTimeout(() => {
        handleMarkReturn(student);
      }, ABSENT_STUDENT_TAP_DELAY);
      return;
    }

    // Double-tap detection for stamp attribution
    const now = Date.now();
    const lastTap = lastTapTimeRef.current[student.id] || 0;
    if (now - lastTap < DOUBLE_TAP_DELAY) {
      // Double-tap detected! Open stamp selector
      lastTapTimeRef.current[student.id] = 0; // Reset
      setStampStudent(student);
      setShowStampModal(true);
      return;
    }
    lastTapTimeRef.current[student.id] = now;

    // Convert to container-relative coordinates for visual positioning
    const containerPos = toContainerCoords(pageX, pageY);

    currentStudentRef.current = student;
    lastTouchRef.current = { x: containerPos.x, y: containerPos.y };
    flickStartRef.current = { x: containerPos.x, y: containerPos.y };
    flickHandledRef.current = false;
    setTouchPos({ x: containerPos.x, y: containerPos.y });
    setShowProgress(true);

    // Mode flick : une pause de 250 ms ouvre le menu normal ; un geste rapide
    // avant la pause valide directement l'action de la direction.
    const openDelay = flickMode ? FLICK_PAUSE_DURATION : LONG_PRESS_DURATION;

    // Animate progress circle
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: openDelay,
      useNativeDriver: true,
    }).start();

    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      // Check if still mounted before updating state
      if (!isMountedRef.current) return;
      // Clear double-tap timer since we're doing a long press
      lastTapTimeRef.current[student.id] = 0;
      setShowProgress(false);
      setSelectedStudent(student);
      menuOpenRef.current = true;
      openMenu(containerPos.x, containerPos.y, containerBoundsRef.current);
    }, openDelay);
  };

  // Valide directement l'action d'une direction (mode expert flick)
  const handleFlickAction = useCallback(async (student: StudentWithMapping, itemId: string) => {
    if (itemId === 'sortie') {
      // La sortie exige une sous-action : on ouvre le menu au point de depart,
      // le doigt (deja vers le bas) survole le quadrant Sortie et le sous-menu s'ouvre.
      setSelectedStudent(student);
      menuOpenRef.current = true;
      openMenu(flickStartRef.current.x, flickStartRef.current.y, containerBoundsRef.current);
      return;
    }

    const typeMap: Record<string, EventType> = {
      participation: EVENT_TYPES.PARTICIPATION,
      bavardage: EVENT_TYPES.BAVARDAGE,
      absence: EVENT_TYPES.ABSENCE,
    };
    const type = typeMap[itemId];
    if (!type) return;

    const event = await addEvent(student.id, type);
    if (event) {
      triggerActionSignature(itemId, distinctHaptics);
      showUndoBanner(student, itemId, event.id);
    } else {
      showErrorBanner(student);
    }
  }, [addEvent, distinctHaptics, showUndoBanner, showErrorBanner, openMenu]);

  const handleTouchMoveEvent = (pageX: number, pageY: number) => {
    // Convert to container-relative coordinates
    const containerPos = toContainerCoords(pageX, pageY);
    lastTouchRef.current = { x: containerPos.x, y: containerPos.y };

    // If moved too far before menu opened
    if (!menuOpenRef.current && showProgress) {
      const dx = containerPos.x - flickStartRef.current.x;
      const dy = containerPos.y - flickStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (flickMode && !flickHandledRef.current) {
        // Flick : deplacement > seuil avant la pause => action de la direction
        if (distance > FLICK_DISTANCE_THRESHOLD) {
          flickHandledRef.current = true;
          const student = currentStudentRef.current;
          clearLongPressTimer();
          if (student) {
            // Meme decoupage angulaire que le menu (quadrants a 90°, haut = -135°→-45°)
            let angle = Math.atan2(dx, -dy);
            if (angle < 0) angle += 2 * Math.PI;
            const anglePerItem = (2 * Math.PI) / MENU_ITEMS.length;
            const itemIndex = Math.floor(((angle + anglePerItem / 2) % (2 * Math.PI)) / anglePerItem);
            const item = MENU_ITEMS[itemIndex];
            if (item) {
              handleFlickAction(student, item.id);
            }
          }
          return;
        }
      } else if (!flickMode && distance > TOUCH_MOVE_THRESHOLD) {
        clearLongPressTimer();
        return;
      }
    }

    if (menuOpenRef.current) {
      handleTouchMove(containerPos.x, containerPos.y);
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();

    if (menuOpenRef.current) {
      handleSelection(lastTouchRef.current.x, lastTouchRef.current.y);
    }
  };

  // Load session data on mount
  // INTENTIONAL: activeSession is excluded from deps because:
  // 1. We only want to load once when user.id is available
  // 2. Including activeSession would cause infinite loops since loadActiveSession updates it
  // 3. loadActiveSession is stable (zustand selector)
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      setIsInitializing(true);
      if (!activeSession) {
        await loadActiveSession(user.id);
      }
      // Pre-load stamp categories
      loadStampCategories(user.id);
      setIsInitializing(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadSessionData = async () => {
      if (!activeSession) return;
      try {
        await Promise.all([
          loadClassById(activeSession.class_id),
          loadRoomById(activeSession.room_id),
          loadStudentsForClass(activeSession.class_id),
          loadPlan(activeSession.class_id, activeSession.room_id),
        ]);
        // Load oral evaluations for the class
        if (user?.id) {
          await loadTrimesterSettings(user.id);
          await loadForClass(activeSession.class_id);
        }
      } catch (error) {
        console.error('[Session] Failed to load session data:', error);
        Alert.alert(
          'Erreur de chargement',
          'Impossible de charger les donnees de la seance. Verifiez votre connexion.',
          [{ text: 'OK', onPress: () => router.replace('/(main)/') }]
        );
      }
    };
    loadSessionData();
  }, [activeSession?.id]);

  const getDisplayName = (student: StudentWithMapping): string => {
    return student.fullName || student.pseudo;
  };

  // Canal de commandes vers l'écran projeté, rattaché à la séance en cours
  useEffect(() => {
    if (!activeSession?.id) return;
    connectClassroomChannel(activeSession.id);
    return () => disconnectClassroomChannel();
  }, [activeSession?.id]);

  // Libellé court affiché sur le plan : le prénom seul, sauf homonymes dans la classe
  // -> on ajoute l'initiale du nom (puis 2, 3 lettres si l'initiale ne suffit pas).
  const cellLabelById = useMemo(() => {
    const firstNameOf = (st: StudentWithMapping) =>
      (st.firstName || getDisplayName(st).split(' ')[0] || '').trim();
    const lastNameOf = (st: StudentWithMapping) => {
      if (st.lastName) return st.lastName.trim();
      const parts = getDisplayName(st).trim().split(' ');
      return parts.length > 1 ? parts.slice(1).join(' ') : '';
    };
    const labels: Record<string, string> = {};
    const byFirstName = new Map<string, StudentWithMapping[]>();
    for (const st of students) {
      const key = firstNameOf(st).toLocaleLowerCase('fr');
      byFirstName.set(key, [...(byFirstName.get(key) || []), st]);
    }
    for (const group of byFirstName.values()) {
      if (group.length === 1) {
        labels[group[0].id] = firstNameOf(group[0]);
        continue;
      }
      let len = 1;
      // Allonge l'abréviation du nom jusqu'à ce que tous les homonymes soient distincts (max 3)
      while (len < 3) {
        const abbrevs = group.map((st) => lastNameOf(st).slice(0, len).toLocaleLowerCase('fr'));
        if (new Set(abbrevs).size === group.length) break;
        len++;
      }
      for (const st of group) {
        const abbrev = lastNameOf(st).slice(0, len);
        const abbrevFmt = abbrev.charAt(0).toLocaleUpperCase('fr') + abbrev.slice(1).toLocaleLowerCase('fr');
        labels[st.id] = abbrev ? `${firstNameOf(st)} ${abbrevFmt}.` : firstNameOf(st);
      }
    }
    return labels;
  }, [students]);

  const handleEndSession = () => {
    Alert.alert(
      'Terminer la seance',
      'Voulez-vous vraiment terminer cette seance ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Terminer',
          style: 'destructive',
          onPress: async () => {
            // Complete linked group session first (so grades get synced)
            if (linkedGroupSession) {
              try {
                await useGroupSessionStore.getState().completeSession();
              } catch (err) {
                console.error('[Session] Failed to complete linked group session:', err);
              }
            }
            await endCurrentSession();
            router.replace('/(main)/');
          },
        },
      ]
    );
  };

  const handleSwitchToGroups = useCallback(async () => {
    setViewMode('groups');
    if (!hasLoadedGroups && activeSession?.id) {
      setIsLoadingGroups(true);
      try {
        const gs = await getGroupSessionByLinkedSessionId(activeSession.id);
        if (gs) {
          await useGroupSessionStore.getState().loadSession(gs.id);
          const loaded = useGroupSessionStore.getState().activeSession;
          // Only use if it actually matches this session
          if (loaded && loaded.session.id === gs.id) {
            setLinkedGroupSession({
              ...loaded,
              groups: loaded.groups.map(g => ({ ...g, grades: [...g.grades] })),
            });
          }
        } else {
          // No linked group session — ensure clean state
          setLinkedGroupSession(null);
        }
      } catch (err) {
        console.error('[Session] Failed to load linked groups:', err);
        setLinkedGroupSession(null);
      } finally {
        setIsLoadingGroups(false);
        setHasLoadedGroups(true);
      }
    }
  }, [activeSession?.id, hasLoadedGroups]);

  // Refresh linked group session data from store (after grading changes)
  // Deep copy groups to ensure React detects changes in grades/malus
  const refreshLinkedGroupSession = useCallback(() => {
    const current = useGroupSessionStore.getState().activeSession;
    if (current) {
      setLinkedGroupSession({
        ...current,
        groups: current.groups.map(g => ({ ...g, grades: [...g.grades] })),
      });
    }
  }, []);

  const handleGroupPress = useCallback((group: SessionGroupWithDetails) => {
    setGradingGroup(group);
  }, []);

  const handleGradeChange = useCallback(async (groupId: string, criteriaId: string, points: number) => {
    await useGroupSessionStore.getState().setGrade(groupId, criteriaId, points);
    refreshLinkedGroupSession();
  }, [refreshLinkedGroupSession]);

  const handleMalusChange = useCallback(async (groupId: string, delta: number) => {
    await useGroupSessionStore.getState().applyMalus(groupId, delta);
    refreshLinkedGroupSession();
  }, [refreshLinkedGroupSession]);

  const handleCloseGrading = useCallback(() => {
    setGradingGroup(null);
  }, []);

  const handleOpenGroupConfig = useCallback(() => {
    setShowGroupConfig(true);
  }, []);

  const handleGroupConfigComplete = useCallback(() => {
    setShowGroupConfig(false);
    // Reload linked group session data with deep copy
    const current = useGroupSessionStore.getState().activeSession;
    if (current) {
      setLinkedGroupSession({
        ...current,
        groups: current.groups.map(g => ({ ...g, grades: [...g.grades] })),
      });
      setHasLoadedGroups(true);
    }
  }, []);

  const handleCancelSession = () => {
    Alert.alert(
      'Annuler la seance',
      'Voulez-vous annuler cette seance ? Elle sera supprimee et aucun evenement ne sera enregistre.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              // cancelCurrentSession → deleteSession also deletes linked group_sessions
              await cancelCurrentSession();
              // Clear group session store if it was loaded
              if (linkedGroupSession) {
                useGroupSessionStore.setState({ activeSession: null });
              }
              router.replace('/(main)/');
            } catch (error) {
              console.error('[Session] Cancel failed:', error);
              Alert.alert(
                'Erreur',
                'Impossible de supprimer la seance. Veuillez reessayer.',
                [{ text: 'OK' }]
              );
            }
          },
        },
      ]
    );
  };

  const MAX_REMARQUE_LENGTH = 500;

  const handleSubmitRemarque = async () => {
    if (!selectedStudent || !user) return;

    // Validate remarque text length
    const trimmedText = remarqueText.trim();
    if (trimmedText.length > MAX_REMARQUE_LENGTH) {
      Alert.alert(
        'Texte trop long',
        `La remarque ne peut pas depasser ${MAX_REMARQUE_LENGTH} caracteres (actuellement ${trimmedText.length}).`
      );
      return;
    }

    setIsUploadingPhoto(true);
    let photoPath: string | null = null;

    // Upload photo if one was selected
    if (remarquePhotoUri) {
      // Generate a temporary ID for the photo path
      const tempId = Date.now().toString();
      const result = await uploadEventPhoto(user.id, tempId, remarquePhotoUri, photoQuality);
      if (result.success && result.path) {
        photoPath = result.path;
      }
    }

    await addEvent(selectedStudent.id, EVENT_TYPES.REMARQUE, null, trimmedText || null, photoPath);

    setRemarqueText('');
    setRemarquePhotoUri(null);
    setIsUploadingPhoto(false);
    setShowRemarqueModal(false);
    setSelectedStudent(null);
  };

  const handlePickRemarquePhoto = async (source: 'camera' | 'gallery') => {
    let uri: string | null = null;
    if (source === 'camera') {
      uri = await pickFromCamera();
    } else {
      uri = await pickFromGallery();
    }
    if (uri) {
      setRemarquePhotoUri(uri);
    }
  };

  const handleRemoveRemarquePhoto = () => {
    setRemarquePhotoUri(null);
  };

  // Eleves presents / non evalues (partages entre toolbar et sheets)
  const presentStudents = students.filter(s => !isStudentAbsent(s.id));
  const unevaluatedStudents = activeSession
    ? getUnevaluatedStudents(activeSession.class_id, presentStudents)
    : [];

  // Tirage au sort (sheet 9a)
  const handleRandomStudent = useCallback(() => {
    if (presentStudents.length === 0) {
      Alert.alert('Aucun élève', 'Tous les élèves sont absents.');
      return;
    }
    setShowRandomSheet(true);
  }, [presentStudents.length]);

  // Evaluation orale (sheet 9b)
  const handleOralEvaluation = useCallback(() => {
    if (!activeSession) return;

    if (unevaluatedStudents.length === 0) {
      // All students evaluated - ask to reset
      Alert.alert(
        'Tous évalués',
        'Tous les élèves présents ont été évalués ce trimestre.\n\nVoulez-vous réinitialiser les évaluations pour cette classe ?',
        [
          { text: 'Non', style: 'cancel' },
          {
            text: 'Oui, réinitialiser',
            style: 'destructive',
            onPress: async () => {
              await resetClassEvaluations(activeSession.class_id);
            },
          },
        ]
      );
      return;
    }

    setOralPickedStudent(null);
    setShowOralSheet(true);
  }, [activeSession, unevaluatedStudents.length, resetClassEvaluations]);

  // Handle manual student selection for oral
  const handleSelectStudentForOral = useCallback((student: StudentWithMapping) => {
    setShowOralStudentPicker(false);
    setOralPickedStudent(student);
    setShowOralSheet(true);
  }, []);

  const handleSaveOralEvaluation = async (student: StudentWithMapping, grade: number) => {
    if (!user || !activeSession) return;

    setIsSavingOral(true);
    try {
      const result = await addEvaluation(user.id, student.id, activeSession.class_id, grade);
      if (!result) {
        Alert.alert('Erreur', 'Impossible d\'enregistrer l\'évaluation');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'enregistrer l\'évaluation');
    } finally {
      setIsSavingOral(false);
      setShowOralSheet(false);
      setOralPickedStudent(null);
    }
  };

  // Session notes handlers (sheet 9c)
  const handleOpenSessionNotes = useCallback(() => {
    if (activeSession) {
      setShowSessionNotesSheet(true);
    }
  }, [activeSession]);

  const handleSaveSessionNotes = async (text: string) => {
    if (!activeSession) return;

    setIsSavingNotes(true);
    try {
      await updateNotes(text.trim() || null);
      setShowSessionNotesSheet(false);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder la note');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Remarque depuis la toolbar : selecteur d'eleve puis modale remarque existante
  const handleOpenRemarque = useCallback(() => {
    if (presentStudents.length === 0) {
      Alert.alert('Aucun élève', 'Tous les élèves sont absents.');
      return;
    }
    setShowRemarquePicker(true);
  }, [presentStudents.length]);

  const handleSelectStudentForRemarque = useCallback((student: StudentWithMapping) => {
    setShowRemarquePicker(false);
    setSelectedStudent(student);
    setShowRemarqueModal(true);
  }, []);

  // Delete event flow - show student picker
  const handleOpenDeleteModal = useCallback(() => {
    // Get students who have at least one event in this session
    const filteredStudents = students.filter(s => {
      const counts = eventCountsByStudent[s.id];
      if (!counts) return false;
      return (counts.participation + counts.bavardage + counts.absence + counts.remarque + counts.sortie) > 0;
    });

    if (filteredStudents.length === 0) {
      Alert.alert('Aucun evenement', 'Aucun evenement enregistre dans cette seance.');
      return;
    }

    // Show modal with student list
    setStudentsWithEvents(filteredStudents);
    setShowStudentPickerModal(true);
  }, [students, eventCountsByStudent]);

  const handleSelectStudentForDelete = useCallback(async (student: StudentWithMapping) => {
    if (!activeSession) return;

    setShowStudentPickerModal(false);
    setDeleteStudent(student);
    // Load events for this student in current session (sessionId, studentId)
    const evts = await getStudentEventsInSession(activeSession.id, student.id);
    setStudentEvents(evts);
    setShowDeleteModal(true);
  }, [activeSession]);

  const handleDeleteEvent = useCallback(async (eventId: string, eventType: string) => {
    Alert.alert(
      'Confirmer suppression',
      `Supprimer cet evenement (${getEventLabel(eventType)}) ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingEvent(true);
            try {
              await deleteEventNow(eventId);
              // Refresh events list (sessionId, studentId)
              if (deleteStudent && activeSession) {
                const evts = await getStudentEventsInSession(activeSession.id, deleteStudent.id);
                setStudentEvents(evts);
                // Reload session events to update counts
                await loadSessionEvents();
              }
              // Close modal if no more events
              if (studentEvents.length <= 1) {
                setShowDeleteModal(false);
                setDeleteStudent(null);
                setStudentEvents([]);
              }
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de supprimer l\'evenement');
            } finally {
              setIsDeletingEvent(false);
            }
          },
        },
      ]
    );
  }, [deleteStudent, activeSession, studentEvents.length, loadSessionEvents]);

  const getEventLabel = (type: string): string => {
    const labels: Record<string, string> = {
      participation: 'Implication',
      bavardage: 'Malus',
      absence: 'Absence',
      remarque: 'Remarque',
      sortie: 'Sortie',
    };
    return labels[type] || type;
  };

  const getEventEmoji = (type: string): string => {
    const emojis: Record<string, string> = {
      participation: '✋',
      bavardage: '💬',
      absence: '❌',
      remarque: '📝',
      sortie: '🚪',
    };
    return emojis[type] || '•';
  };

  // Memoized grid data to avoid recalculating on every render
  // Grille compacte (8b) : gap 3px purement visuel, zones tactiles bord a bord.
  const gridData = useMemo(() => {
    if (!currentRoom || !currentPlan) return null;

    const { grid_rows, grid_cols } = currentRoom;

    // Validation: prevent division by zero and invalid grids
    if (!grid_rows || !grid_cols || grid_rows <= 0 || grid_cols <= 0) {
      return { error: true };
    }

    const gap = compactGrid ? 3 : 8;
    const maxCell = compactGrid ? 60 : 64;
    const cellSize = Math.min(
      (SCREEN_WIDTH - 32 - gap * (grid_cols - 1)) / grid_cols,
      maxCell
    );

    // Parse disabled cells
    let disabledCells: string[] = [];
    try {
      disabledCells = currentRoom.disabled_cells
        ? JSON.parse(currentRoom.disabled_cells)
        : [];
    } catch {
      disabledCells = [];
    }

    return { grid_rows, grid_cols, cellSize, gap, disabledCells, positions: currentPlan.positions };
  }, [currentRoom, currentPlan, compactGrid]);

  const renderGrid = useCallback(() => {
    if (!gridData) return null;

    if ('error' in gridData) {
      return (
        <View style={styles.gridError}>
          <Text style={styles.gridErrorText}>Configuration de salle invalide</Text>
        </View>
      );
    }

    const { grid_rows, grid_cols, cellSize, gap, disabledCells, positions } = gridData;
    const isDisabled = (row: number, col: number) => disabledCells.includes(`${row},${col}`);
    // Zone tactile bord a bord : la cellule externe inclut le gap,
    // la carte interne (visuelle) est en retrait de gap/2.
    const outerSize = cellSize + gap;

    const rows = [];
    for (let r = 0; r < grid_rows; r++) {
      const cells = [];
      for (let c = 0; c < grid_cols; c++) {
        const cellDisabled = isDisabled(r, c);

        // If cell is disabled (aisle), render empty cell
        if (cellDisabled) {
          cells.push(
            <View key={`${r}-${c}`} style={{ width: outerSize, height: outerSize, padding: gap / 2 }}>
              <View style={styles.gridCellDisabled} />
            </View>
          );
          continue;
        }

        const studentId = getStudentAtPosition(positions, r, c);
        const student = studentId ? students.find((s) => s.id === studentId) : null;
        const counts = student ? eventCountsByStudent[student.id] : null;

        const isAbsent = student ? isStudentAbsent(student.id) : false;
        const isOut = student ? isStudentOut(student.id) : false;
        const activeSortie = student && isOut ? getActiveSortie(student.id) : null;

        cells.push(
          <View
            key={`${r}-${c}`}
            style={{ width: outerSize, height: outerSize, padding: gap / 2 }}
            onTouchStart={(e) => {
              if (student) {
                const { pageX, pageY } = e.nativeEvent;
                handleTouchStart(student, pageX, pageY);
              }
            }}
            onTouchMove={(e) => {
              const { pageX, pageY } = e.nativeEvent;
              handleTouchMoveEvent(pageX, pageY);
            }}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={() => {
              clearLongPressTimer();
              if (menuOpenRef.current) {
                closeMenu();
              }
            }}
          >
            <View
              style={[
                styles.gridCell,
                student && isAbsent && styles.gridCellAbsent,
                student && isOut && styles.gridCellOut,
                selectedStudent?.id === student?.id && styles.gridCellSelected,
              ]}
            >
              {student ? (
                <View style={styles.cellContent}>
                  <Text style={[styles.cellName, isAbsent && styles.cellNameAbsent, isOut && styles.cellNameOut]} numberOfLines={1}>
                    {cellLabelById[student.id] ?? getDisplayName(student).split(' ')[0]}
                  </Text>
                  {isAbsent ? (
                    <View style={styles.absentBadge}>
                      <Text style={styles.absentBadgeText}>ABS</Text>
                    </View>
                  ) : isOut && activeSortie ? (
                    <View style={styles.sortieBadge}>
                      <Text style={styles.sortieBadgeText}>{formatElapsedTime(activeSortie.timestamp)}</Text>
                    </View>
                  ) : (
                    counts && (counts.participation > 0 || counts.bavardage > 0) && (
                      <View style={styles.countersRow}>
                        {counts.participation > 0 && (
                          <View style={[styles.counterBadge, styles.counterParticipation]}>
                            <Text style={[styles.counterText, styles.counterTextParticipation]}>
                              +{counts.participation}
                            </Text>
                          </View>
                        )}
                        {counts.bavardage > 0 && (
                          <View style={[styles.counterBadge, styles.counterBavardage]}>
                            <Text style={[styles.counterText, styles.counterTextBavardage]}>
                              {counts.bavardage}
                            </Text>
                          </View>
                        )}
                      </View>
                    )
                  )}
                </View>
              ) : null}
            </View>
          </View>
        );
      }
      rows.push(
        <View key={r} style={styles.gridRow}>
          {cells}
        </View>
      );
    }

    return (
      <View style={styles.gridWrapper}>
        <View style={styles.gridContainer}>{rows}</View>
        <View style={styles.teacherArea}>
          <Text style={styles.teacherText}>TABLEAU</Text>
        </View>
      </View>
    );
  }, [gridData, students, eventCountsByStudent, selectedStudent, isStudentAbsent, isStudentOut, getActiveSortie, formatElapsedTime, handleTouchStart, handleTouchMoveEvent, handleTouchEnd, clearLongPressTimer, closeMenu, getDisplayName]);

  if (isInitializing || !activeSession) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.participation} />
        <Text style={styles.loadingText}>Chargement de la seance...</Text>
      </SafeAreaView>
    );
  }

  const elapsedSessionMin = Math.max(
    0,
    Math.floor((sessionTick - new Date(activeSession.started_at).getTime()) / 60000)
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header blanc plat (6a) */}
      <View style={styles.header}>
        <Pressable style={styles.cancelButton} onPress={handleCancelSession} hitSlop={6}>
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentClass?.name || 'Séance'}{currentRoom ? ` · ${currentRoom.name}` : ''}
          </Text>
          <View style={styles.chronoRow}>
            <View style={styles.chronoDot} />
            <Text style={styles.chronoText}>{elapsedSessionMin} min</Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
          onPress={handleEndSession}
        >
          <Text style={styles.endButtonText}>Terminer</Text>
        </Pressable>
      </View>

      <View
        ref={containerRef}
        style={styles.contentWrapper}
        onLayout={handleContainerLayout}
      >
        {/* Toggle segmente Plan / Groupes + engrenage reglages */}
        <View style={styles.toggleRow}>
          <View style={styles.viewModeToggle}>
            <Pressable
              style={[styles.viewModeTab, viewMode === 'plan' && styles.viewModeTabActive]}
              onPress={() => setViewMode('plan')}
            >
              <Text style={[styles.viewModeTabText, viewMode === 'plan' && styles.viewModeTabTextActive]}>
                Plan de classe
              </Text>
            </Pressable>
            <Pressable
              style={[styles.viewModeTab, viewMode === 'groups' && styles.viewModeTabActive]}
              onPress={handleSwitchToGroups}
            >
              <Text style={[styles.viewModeTabText, viewMode === 'groups' && styles.viewModeTabTextActive]}>
                Groupes
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
            onPress={() => setShowScreenSheet(true)}
            hitSlop={4}
          >
            <Monitor size={18} color={theme.colors.textSecondary} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
            onPress={() => setShowSettingsSheet(true)}
            hitSlop={4}
          >
            <Settings size={18} color={theme.colors.textSecondary} strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* Toolbar 5 boutons (plan mode only) */}
        {viewMode === 'plan' && (
          <>
            <View style={styles.toolbar}>
              <Pressable
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
                onPress={handleRandomStudent}
              >
                <Shuffle size={17} color={theme.colors.text} strokeWidth={1.8} />
                <Text style={styles.toolbarButtonText}>Aléatoire</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
                onPress={handleOralEvaluation}
              >
                <Mic size={17} color={theme.colors.text} strokeWidth={1.8} />
                <Text style={styles.toolbarButtonText}>Oral</Text>
                {activeSession && (
                  <View style={styles.oralCountBadge}>
                    <Text style={styles.oralCountText}>
                      {getEvaluatedCount(activeSession.class_id)}/{presentStudents.length}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
                onPress={handleOpenSessionNotes}
              >
                <Pencil size={17} color={theme.colors.text} strokeWidth={1.8} />
                <Text style={styles.toolbarButtonText}>Note</Text>
                {activeSession?.notes && (
                  <View style={styles.noteIndicator} />
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
                onPress={handleOpenRemarque}
              >
                <MessageSquare size={17} color={theme.colors.text} strokeWidth={1.8} />
                <Text style={styles.toolbarButtonText}>Remarque</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
                onPress={handleOpenDeleteModal}
              >
                <Trash2 size={17} color={theme.colors.text} strokeWidth={1.8} />
                <Text style={styles.toolbarButtonText}>Supprimer</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>Maintenir appuyé sur un élève</Text>
          </>
        )}

        <View style={styles.gridArea}>
          {viewMode === 'plan' ? renderGrid() : (
            <SessionGroupView
              groups={linkedGroupSession?.groups ?? []}
              criteria={linkedGroupSession?.criteria ?? []}
              maxPossibleScore={linkedGroupSession?.maxPossibleScore ?? 0}
              students={students}
              isLoading={isLoadingGroups}
              isEmpty={hasLoadedGroups && !linkedGroupSession}
              tpName={linkedGroupSession?.session.name ?? null}
              onGroupPress={linkedGroupSession ? handleGroupPress : undefined}
              onConfigureGroups={handleOpenGroupConfig}
            />
          )}
        </View>

        {/* Progress Circle */}
        <ProgressCircle
          visible={showProgress}
          x={touchPos.x}
          y={touchPos.y}
          progress={progressAnim}
        />

        {/* Radial Menu */}
        <RadialMenu
          visible={menuState !== 'closed'}
          menuState={menuState}
          position={menuPosition}
          hoveredItem={hoveredItem}
          activeSubmenu={activeSubmenu}
          edgeProximity={edgeProximity}
          menuScale={menuScale}
          menuOpacity={menuOpacity}
          submenuScale={submenuScale}
          submenuOpacity={submenuOpacity}
          bonusFillProgress={bonusFillProgress}
          studentName={selectedStudent ? getDisplayName(selectedStudent) : null}
          bounds={containerBoundsRef.current.width > 0 ? containerBoundsRef.current : undefined}
        />
      </View>

      {/* Banniere de confirmation / echec (undo) */}
      <UndoBanner
        visible={undoBanner.visible}
        message={undoBanner.message}
        variant={undoBanner.variant}
        canUndo={!!undoBanner.eventId}
        onUndo={handleUndoLastEvent}
        onDismiss={dismissUndoBanner}
      />

      {/* Remarque Modal */}
      <Modal
        visible={showRemarqueModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowRemarqueModal(false);
          setRemarquePhotoUri(null);
          setSelectedStudent(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowRemarqueModal(false);
              setRemarquePhotoUri(null);
              setSelectedStudent(null);
            }}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Remarque - {selectedStudent ? getDisplayName(selectedStudent) : ''}
            </Text>
            <TextInput
              style={styles.remarqueInput}
              placeholder="Note (optionnel)"
              placeholderTextColor={theme.colors.textTertiary}
              value={remarqueText}
              onChangeText={setRemarqueText}
              multiline
              numberOfLines={3}
              autoFocus
            />

            {/* Photo section */}
            <View style={styles.photoSection}>
              <Text style={styles.photoSectionLabel}>Photo (optionnel)</Text>
              {remarquePhotoUri ? (
                <View style={styles.photoPreviewContainer}>
                  <Image source={{ uri: remarquePhotoUri }} style={styles.photoPreview} />
                  <Pressable style={styles.removePhotoButton} onPress={handleRemoveRemarquePhoto}>
                    <Text style={styles.removePhotoText}>X</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.photoButtons}>
                  <Pressable
                    style={styles.photoButton}
                    onPress={() => handlePickRemarquePhoto('camera')}
                  >
                    <Text style={styles.photoButtonIcon}>📷</Text>
                    <Text style={styles.photoButtonText}>Camera</Text>
                  </Pressable>
                  <Pressable
                    style={styles.photoButton}
                    onPress={() => handlePickRemarquePhoto('gallery')}
                  >
                    <Text style={styles.photoButtonIcon}>🖼️</Text>
                    <Text style={styles.photoButtonText}>Galerie</Text>
                  </Pressable>
                </View>
              )}
              {/* Quality selector */}
              <View style={styles.qualitySelector}>
                <Text style={styles.qualitySelectorLabel}>Qualite :</Text>
                <Pressable
                  style={[
                    styles.qualityOption,
                    photoQuality === 'minimal' && styles.qualityOptionActive,
                  ]}
                  onPress={() => setPhotoQuality('minimal')}
                >
                  <Text
                    style={[
                      styles.qualityOptionText,
                      photoQuality === 'minimal' && styles.qualityOptionTextActive,
                    ]}
                  >
                    Minimale
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.qualityOption,
                    photoQuality === 'normal' && styles.qualityOptionActive,
                  ]}
                  onPress={() => setPhotoQuality('normal')}
                >
                  <Text
                    style={[
                      styles.qualityOptionText,
                      photoQuality === 'normal' && styles.qualityOptionTextActive,
                    ]}
                  >
                    Normale
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowRemarqueModal(false);
                  setRemarquePhotoUri(null);
                  setSelectedStudent(null);
                }}
                disabled={isUploadingPhoto}
              >
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, isUploadingPhoto && styles.buttonDisabled]}
                onPress={handleSubmitRemarque}
                disabled={isUploadingPhoto}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator color={theme.colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Enregistrer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bonus Participation Modal */}
      <Modal
        visible={showBonusModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowBonusModal(false);
          setSelectedStudent(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowBonusModal(false);
              setSelectedStudent(null);
            }}
          />
          <View style={styles.modalContent}>
            <View style={styles.bonusHeader}>
              <Text style={styles.bonusEmoji}>🌟</Text>
              <Text style={styles.modalTitle}>
                Bonus - {selectedStudent ? getDisplayName(selectedStudent) : ''}
              </Text>
            </View>

            <Text style={styles.bonusLabel}>Nombre de points</Text>
            <View style={styles.bonusPointsRow}>
              {[2, 3, 5, 10].map((n) => (
                <Pressable
                  key={n}
                  style={[
                    styles.bonusPointChip,
                    bonusPoints === String(n) && styles.bonusPointChipActive,
                  ]}
                  onPress={() => setBonusPoints(String(n))}
                >
                  <Text
                    style={[
                      styles.bonusPointChipText,
                      bonusPoints === String(n) && styles.bonusPointChipTextActive,
                    ]}
                  >
                    +{n}
                  </Text>
                </Pressable>
              ))}
              <TextInput
                style={styles.bonusPointInput}
                value={bonusPoints}
                onChangeText={(text) => setBonusPoints(text.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                maxLength={2}
              />
            </View>

            <Text style={styles.bonusLabel}>Raison</Text>
            <TextInput
              style={styles.remarqueInput}
              placeholder="Ex: Expose remarquable, aide aux camarades..."
              placeholderTextColor={theme.colors.textTertiary}
              value={bonusReason}
              onChangeText={setBonusReason}
              multiline
              numberOfLines={2}
              autoFocus
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowBonusModal(false);
                  setSelectedStudent(null);
                }}
              >
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, { backgroundColor: '#34D399' }]}
                onPress={async () => {
                  if (!selectedStudent) return;
                  const pts = Math.max(1, parseInt(bonusPoints) || 1);
                  const reason = bonusReason.trim() ? `Bonus: ${bonusReason.trim()}` : 'Bonus';
                  // Create N participation events with the reason
                  for (let i = 0; i < pts; i++) {
                    await addEvent(selectedStudent.id, EVENT_TYPES.PARTICIPATION, undefined, reason);
                  }
                  setShowBonusModal(false);
                  setSelectedStudent(null);
                }}
              >
                <Text style={styles.confirmButtonText}>
                  Valider +{bonusPoints || '0'} pts
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tirage au sort (sheet 9a) */}
      <RandomPickerSheet
        visible={showRandomSheet}
        students={presentStudents}
        onClose={() => {
          setShowRandomSheet(false);
          void sendClassroomCommand({ kind: 'pick', studentId: null });
        }}
        onShowOnScreen={(student) => {
          void sendClassroomCommand({ kind: 'pick', studentId: student.id, label: student.pseudo });
        }}
      />

      {/* Télécommande de l'écran projeté */}
      <ScreenControlSheet
        visible={showScreenSheet}
        onClose={() => setShowScreenSheet(false)}
      />

      {/* Evaluation orale (sheet 9b) */}
      <OralEvaluationSheet
        visible={showOralSheet}
        unevaluated={unevaluatedStudents}
        evaluatedCount={activeSession ? getEvaluatedCount(activeSession.class_id) : 0}
        totalPresent={presentStudents.length}
        trimester={useOralEvaluationStore.getState().currentTrimester}
        isSaving={isSavingOral}
        onSave={handleSaveOralEvaluation}
        pickedStudent={oralPickedStudent}
        onChooseStudent={() => {
          setShowOralSheet(false);
          setShowOralStudentPicker(true);
        }}
        onClose={() => {
          setShowOralSheet(false);
          setOralPickedStudent(null);
        }}
      />

      {/* Choisir un eleve pour l'oral */}
      <StudentPickerSheet
        visible={showOralStudentPicker}
        title="Choisir un élève"
        subtitle={`${unevaluatedStudents.length} élève${unevaluatedStudents.length > 1 ? 's' : ''} non évalué${unevaluatedStudents.length > 1 ? 's' : ''} ce trimestre`}
        students={unevaluatedStudents}
        onSelect={handleSelectStudentForOral}
        onClose={() => setShowOralStudentPicker(false)}
      />

      {/* Note de seance (sheet 9c) */}
      <SessionNoteSheet
        visible={showSessionNotesSheet}
        initialText={activeSession?.notes || ''}
        isSaving={isSavingNotes}
        onSave={handleSaveSessionNotes}
        onClose={() => setShowSessionNotesSheet(false)}
      />

      {/* Selecteur d'eleve pour la remarque (toolbar) */}
      <StudentPickerSheet
        visible={showRemarquePicker}
        title="Remarque"
        subtitle="Sélectionner un élève"
        students={presentStudents}
        onSelect={handleSelectStudentForRemarque}
        onClose={() => setShowRemarquePicker(false)}
      />

      {/* Reglages de seance (sheet 7b) */}
      <SessionSettingsSheet
        visible={showSettingsSheet}
        onClose={() => setShowSettingsSheet(false)}
      />

      {/* Student Picker Modal (for delete) */}
      <Modal
        visible={showStudentPickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowStudentPickerModal(false);
          setStudentsWithEvents([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowStudentPickerModal(false);
              setStudentsWithEvents([]);
            }}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Supprimer un evenement</Text>
            <Text style={styles.studentPickerSubtitle}>Selectionner un eleve :</Text>

            <ScrollView style={styles.studentPickerList} showsVerticalScrollIndicator>
              {studentsWithEvents.map((student) => {
                const counts = eventCountsByStudent[student.id];
                const totalEvents = counts
                  ? (counts.participation + counts.bavardage + counts.absence + counts.remarque + counts.sortie)
                  : 0;
                return (
                  <Pressable
                    key={student.id}
                    style={styles.studentPickerItem}
                    onPress={() => handleSelectStudentForDelete(student)}
                  >
                    <Text style={styles.studentPickerName}>
                      {student.fullName || student.pseudo}
                    </Text>
                    <View style={styles.studentPickerBadge}>
                      <Text style={styles.studentPickerBadgeText}>
                        {totalEvents} evt{totalEvents > 1 ? 's' : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowStudentPickerModal(false);
                  setStudentsWithEvents([]);
                }}
              >
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Event Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setDeleteStudent(null);
          setStudentEvents([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowDeleteModal(false);
              setDeleteStudent(null);
              setStudentEvents([]);
            }}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Supprimer un evenement</Text>
            {deleteStudent && (
              <View style={styles.deleteStudentName}>
                <Text style={styles.deleteStudentNameText}>
                  {deleteStudent.fullName || deleteStudent.pseudo}
                </Text>
              </View>
            )}

            {studentEvents.length === 0 ? (
              <Text style={styles.noEventsText}>Aucun evenement</Text>
            ) : (
              <View style={styles.eventsList}>
                {studentEvents.map((event) => (
                  <View key={event.id} style={styles.eventItem}>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventEmoji}>{getEventEmoji(event.type)}</Text>
                      <View style={styles.eventDetails}>
                        <Text style={styles.eventType}>{getEventLabel(event.type)}</Text>
                        {event.subtype && (
                          <Text style={styles.eventSubtype}>({event.subtype})</Text>
                        )}
                        {event.note && (
                          <Text style={styles.eventRemarque} numberOfLines={1}>
                            {event.note}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Pressable
                      style={[styles.eventDeleteButton, isDeletingEvent && styles.buttonDisabled]}
                      onPress={() => handleDeleteEvent(event.id, event.type)}
                      disabled={isDeletingEvent}
                    >
                      <Text style={styles.eventDeleteButtonText}>🗑️</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteStudent(null);
                  setStudentEvents([]);
                }}
              >
                <Text style={styles.modalCancelButtonText}>Fermer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Group Configuration Sheet */}
      {activeSession && user && (
        <GroupConfigSheet
          visible={showGroupConfig}
          userId={user.id}
          classId={activeSession.class_id}
          sessionId={activeSession.id}
          students={students}
          onComplete={handleGroupConfigComplete}
          onClose={() => setShowGroupConfig(false)}
        />
      )}

      {/* Group Grading Overlay */}
      <GroupGradingOverlay
        visible={gradingGroup !== null}
        group={gradingGroup ? (linkedGroupSession?.groups.find(g => g.id === gradingGroup.id) ?? gradingGroup) : null}
        groups={linkedGroupSession?.groups ?? []}
        criteria={linkedGroupSession?.criteria ?? []}
        maxPossibleScore={linkedGroupSession?.maxPossibleScore ?? 0}
        students={students}
        onGradeChange={handleGradeChange}
        onMalusChange={handleMalusChange}
        onSelectGroup={(g) => setGradingGroup(g)}
        onClose={handleCloseGrading}
      />

      {/* Stamp Category Selector Modal (double-tap) */}
      <Modal
        visible={showStampModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowStampModal(false);
          setStampStudent(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowStampModal(false);
              setStampStudent(null);
            }}
          />
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>
              Tampon — {stampStudent?.fullName || stampStudent?.pseudo}
            </Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {stampCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    marginBottom: 6,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  disabled={isAwardingStamp}
                  onPress={async () => {
                    if (!user?.id || !stampStudent || isAwardingStamp) return;
                    setIsAwardingStamp(true);
                    try {
                      const result = await doAwardStamp(user.id, stampStudent.id, cat.id);
                      setShowStampModal(false);
                      setStampStudent(null);
                      if (result.cardComplete) {
                        Alert.alert(
                          'Carte complete !',
                          `${stampStudent.fullName || stampStudent.pseudo} a rempli sa carte n°${result.cardNumber}. L'eleve peut choisir son bonus.`
                        );
                      } else {
                        Alert.alert('Tampon attribue', `${cat.icon} ${result.stampCount}/10`);
                      }
                    } catch (err) {
                      Alert.alert('Erreur', err instanceof Error ? err.message : 'Erreur');
                    } finally {
                      setIsAwardingStamp(false);
                    }
                  }}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 10,
                    backgroundColor: cat.color + '20',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 12,
                  }}>
                    <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
                  </View>
                  <Text style={{
                    flex: 1, fontSize: 14, fontWeight: '500',
                    color: theme.colors.text,
                  }} numberOfLines={1}>
                    {cat.label}
                  </Text>
                  <View style={{
                    width: 12, height: 12, borderRadius: 6,
                    backgroundColor: cat.color,
                  }} />
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowStampModal(false);
                  setStampStudent(null);
                }}
              >
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function ActiveSessionScreen() {
  if (!IS_NATIVE) {
    return <WebNotSupportedScreen />;
  }
  return <NativeSessionScreen />;
}

const styles = StyleSheet.create({
  webNotSupported: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  webNotSupportedEmoji: {
    fontSize: 64,
    marginBottom: theme.spacing.lg,
  },
  webNotSupportedTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  webNotSupportedText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  webBackButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.participation,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
  },
  webBackButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
  },
  // Header blanc plat (6a)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16,
    color: theme.colors.text,
  },
  chronoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  chronoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.action,
  },
  chronoText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.action,
  },
  endButton: {
    backgroundColor: theme.colors.action,
    borderRadius: 9,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
  },
  endButtonPressed: {
    opacity: 0.9,
  },
  endButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.textInverse,
    fontSize: 13,
  },
  cancelButton: {
    paddingVertical: theme.spacing.xs,
    minWidth: 60,
  },
  cancelButtonText: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.error,
    fontSize: 14,
  },
  contentWrapper: {
    flex: 1,
  },
  // Toggle + reglages
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  // Toolbar 5 boutons (cartes)
  toolbar: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  toolbarButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingVertical: theme.spacing.sm,
    gap: 3,
  },
  toolbarButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  toolbarButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 10.5,
    color: theme.colors.text,
  },
  hint: {
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  oralCountBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: theme.radius.full,
  },
  oralCountText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 9,
    color: theme.colors.primary,
  },
  noteIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
    top: 5,
    right: 5,
  },
  sessionNotesHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  sessionNotesInput: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 120,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sessionNotesCharCount: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  oralPickerContent: {
    maxHeight: '70%',
  },
  oralPickerHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  oralPickerList: {
    maxHeight: 300,
    marginBottom: theme.spacing.md,
  },
  oralPickerItem: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  oralPickerItemText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  gridArea: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridWrapper: {
    alignItems: 'center',
  },
  teacherArea: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.segmentTrack,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.md,
    alignItems: 'center',
  },
  teacherText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gridContainer: {
    alignItems: 'center',
  },
  gridRow: {
    flexDirection: 'row',
  },
  // Carte visuelle interne d'une cellule (le gap est porte par le wrapper tactile)
  gridCell: {
    flex: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  gridCellDisabled: {
    flex: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceDisabled,
  },
  gridCellAbsent: {
    backgroundColor: theme.colors.absentBg,
    borderColor: theme.colors.absentBorder,
  },
  gridCellOut: {
    backgroundColor: theme.colors.sortieBg,
    borderColor: theme.colors.sortieBorder,
  },
  gridCellSelected: {
    borderColor: theme.colors.participation,
    borderWidth: 2,
    backgroundColor: theme.colors.participationSoft,
  },
  cellContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  cellName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11,
    color: theme.colors.text,
    textAlign: 'center',
  },
  cellNameAbsent: {
    color: theme.colors.absentText,
  },
  cellNameOut: {
    color: theme.colors.sortieText,
  },
  absentBadge: {
    backgroundColor: theme.colors.absentBadge,
    borderRadius: theme.radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  absentBadgeText: {
    fontFamily: theme.fonts.bodyBold,
    color: '#FFFFFF',
    fontSize: 7.5,
  },
  sortieBadge: {
    backgroundColor: theme.colors.sortieBorder,
    borderRadius: theme.radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  sortieBadgeText: {
    fontFamily: theme.fonts.bodyBold,
    color: theme.colors.sortieText,
    fontSize: 7.5,
  },
  countersRow: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  counterBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: 4,
    minWidth: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterParticipation: {
    backgroundColor: theme.colors.actionSoft,
  },
  counterBavardage: {
    backgroundColor: theme.colors.bavardageSoft,
  },
  counterText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 9,
  },
  counterTextParticipation: {
    color: theme.colors.action,
  },
  counterTextBavardage: {
    color: theme.colors.bavardageText,
  },
  // Progress circle
  progressCircle: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  progressCircleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
    borderColor: theme.colors.participation,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressFill: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.participation,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  bonusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  bonusEmoji: {
    fontSize: 28,
  },
  bonusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  bonusPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  bonusPointChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  bonusPointChipActive: {
    backgroundColor: '#34D399',
  },
  bonusPointChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  bonusPointChipTextActive: {
    color: '#FFFFFF',
  },
  bonusPointInput: {
    width: 48,
    height: 36,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  remarqueInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  modalCancelButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  modalCancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: theme.colors.remarque,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
  },
  confirmButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Photo section styles
  photoSection: {
    marginBottom: theme.spacing.md,
  },
  photoSectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  photoButtonIcon: {
    fontSize: 18,
  },
  photoButtonText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  photoPreviewContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  qualitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  qualitySelectorLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  qualityOption: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  qualityOptionActive: {
    borderColor: theme.colors.participation,
    backgroundColor: theme.colors.participation,
  },
  qualityOptionText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  qualityOptionTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '600',
  },
  // Oral evaluation modal styles
  oralStudentName: {
    backgroundColor: theme.colors.participation + '20',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  oralStudentNameText: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.participation,
  },
  oralGradeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  oralGradeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  oralGradeButton: {
    flex: 1,
    minWidth: 55,
    backgroundColor: theme.colors.background,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    alignItems: 'center',
  },
  oralGradeButtonSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#8B5CF6',
  },
  oralGradeButtonNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  oralGradeButtonNumberSelected: {
    color: theme.colors.textInverse,
  },
  oralGradeButtonLabel: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  oralGradeButtonLabelSelected: {
    color: theme.colors.textInverse,
  },
  oralSaveButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
  },
  // Student picker modal styles
  studentPickerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  studentPickerList: {
    maxHeight: 300,
    marginBottom: theme.spacing.md,
  },
  studentPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  studentPickerName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    flex: 1,
  },
  studentPickerBadge: {
    backgroundColor: theme.colors.error + '20',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  studentPickerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.error,
  },
  // Delete event modal styles
  deleteStudentName: {
    backgroundColor: theme.colors.error + '20',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  deleteStudentNameText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.error,
  },
  noEventsText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: 14,
    paddingVertical: theme.spacing.lg,
  },
  eventsList: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  eventInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  eventEmoji: {
    fontSize: 20,
  },
  eventDetails: {
    flex: 1,
  },
  eventType: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  eventSubtype: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  eventRemarque: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    fontStyle: 'italic',
  },
  eventDeleteButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error + '20',
  },
  eventDeleteButtonText: {
    fontSize: 16,
  },
  // Grid error styles
  gridError: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
  },
  gridErrorText: {
    fontSize: 14,
    color: theme.colors.error,
    textAlign: 'center',
  },

  // View mode toggle (track #EDEEF2 radius 10, actif = carte blanche)
  viewModeToggle: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.segmentTrack,
    padding: 3,
    borderRadius: 10,
  },
  viewModeTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  viewModeTabActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  viewModeTabText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13.5,
    color: theme.colors.textSecondary,
  },
  viewModeTabTextActive: {
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.text,
  },
});
