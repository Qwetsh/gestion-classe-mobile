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
  useAuthStore,
  useClassStore,
  useStudentStore,
  useRoomStore,
  usePlanStore,
  useSessionStore,
  useOralEvaluationStore,
  useGroupSessionStore,
  useStampStore,
  ORAL_GRADE_LABELS,
  StudentWithMapping,
  type ActiveSessionState,
} from '../../../stores';
import { getGroupSessionByLinkedSessionId } from '../../../services/database';
import { SessionGroupView } from '../../../components/groups/SessionGroupView';
import { GroupGradingOverlay } from '../../../components/groups/GroupGradingOverlay';
import { GroupConfigSheet } from '../../../components/groups/GroupConfigSheet';
import type { SessionGroupWithDetails } from '../../../stores/groupSessionStore';
import { theme } from '../../../constants/theme';
import { getStudentAtPosition, EVENT_TYPES, SortieSubtype, Event, deleteEvent, getStudentEventsInSession } from '../../../services/database';
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

  // Oral evaluation state
  const [showOralModal, setShowOralModal] = useState(false);
  const [showOralStudentPicker, setShowOralStudentPicker] = useState(false);
  const [oralStudent, setOralStudent] = useState<StudentWithMapping | null>(null);
  const [selectedOralGrade, setSelectedOralGrade] = useState<number | null>(null);
  const [isSavingOral, setIsSavingOral] = useState(false);
  const [unevaluatedList, setUnevaluatedList] = useState<StudentWithMapping[]>([]);

  // Session notes state
  const [showSessionNotesModal, setShowSessionNotesModal] = useState(false);
  const [sessionNotesText, setSessionNotesText] = useState('');
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
  const [stampStudent, setStampStudent] = useState<StudentWithMapping | null>(null);
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const DOUBLE_TAP_DELAY = 300; // ms between taps for double-tap

  // Progress circle state
  const [showProgress, setShowProgress] = useState(false);
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const progressAnim = useRef(new Animated.Value(0)).current;
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Container position tracking for coordinate conversion
  const containerRef = useRef<View>(null);
  const containerOffsetRef = useRef({ x: 0, y: 0 });

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

  // Handle selection from radial menu
  const handleRadialSelection = useCallback(async (selection: RadialMenuSelection) => {
    if (!selectedStudent) return;

    const itemId = selection.parentId || selection.itemId;
    const subItemId = selection.parentId ? selection.itemId : null;

    switch (itemId) {
      case 'participation':
        if (selection.isBonus) {
          // Show bonus modal instead of adding 1pt
          setBonusPoints('3');
          setBonusReason('');
          setShowBonusModal(true);
          return; // Don't clear selectedStudent yet
        }
        await addEvent(selectedStudent.id, EVENT_TYPES.PARTICIPATION);
        break;
      case 'bavardage':
        await addEvent(selectedStudent.id, EVENT_TYPES.BAVARDAGE);
        break;
      case 'absence':
        await addEvent(selectedStudent.id, EVENT_TYPES.ABSENCE);
        break;
      case 'remarque':
        setShowRemarqueModal(true);
        return;
      case 'sortie':
        if (subItemId) {
          await addEvent(selectedStudent.id, EVENT_TYPES.SORTIE, subItemId as SortieSubtype);
        }
        break;
    }

    setSelectedStudent(null);
  }, [selectedStudent, addEvent]);

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
    setTouchPos({ x: containerPos.x, y: containerPos.y });
    setShowProgress(true);

    // Animate progress circle
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: LONG_PRESS_DURATION,
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
      openMenu(containerPos.x, containerPos.y);
    }, LONG_PRESS_DURATION);
  };

  const handleTouchMoveEvent = (pageX: number, pageY: number) => {
    // Convert to container-relative coordinates
    const containerPos = toContainerCoords(pageX, pageY);
    lastTouchRef.current = { x: containerPos.x, y: containerPos.y };

    // If moved too far before menu opened, cancel
    if (!menuOpenRef.current && showProgress) {
      const dx = containerPos.x - touchPos.x;
      const dy = containerPos.y - touchPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > TOUCH_MOVE_THRESHOLD) {
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

  const handleApplyMalus = useCallback(async (groupId: string) => {
    await useGroupSessionStore.getState().applyMalus(groupId, 1);
    refreshLinkedGroupSession();
  }, [refreshLinkedGroupSession]);

  const handleResetMalus = useCallback(async (groupId: string) => {
    await useGroupSessionStore.getState().resetMalus(groupId);
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

  // Random student selection (simple - no DB)
  const handleRandomStudent = useCallback(() => {
    const presentStudents = students.filter(s => !isStudentAbsent(s.id));
    if (presentStudents.length === 0) {
      Alert.alert('Aucun eleve', 'Tous les eleves sont absents.');
      return;
    }
    const randomIndex = Math.floor(Math.random() * presentStudents.length);
    const selected = presentStudents[randomIndex];
    Alert.alert('Eleve selectionne', selected.fullName || selected.pseudo);
  }, [students, isStudentAbsent]);

  // Oral evaluation flow
  const handleOralEvaluation = useCallback(() => {
    if (!activeSession) return;

    const presentStudents = students.filter(s => !isStudentAbsent(s.id));
    const unevaluatedStudents = getUnevaluatedStudents(activeSession.class_id, presentStudents);

    if (unevaluatedStudents.length === 0) {
      // All students evaluated - ask to reset
      Alert.alert(
        'Tous evalues',
        'Tous les eleves presents ont ete evalues ce trimestre.\n\nVoulez-vous reinitialiser les evaluations pour cette classe ?',
        [
          { text: 'Non', style: 'cancel' },
          {
            text: 'Oui, reinitialiser',
            style: 'destructive',
            onPress: async () => {
              await resetClassEvaluations(activeSession.class_id);
              Alert.alert('Reinitialise', 'Les evaluations ont ete remises a zero.');
            },
          },
        ]
      );
      return;
    }

    // Store unevaluated list for manual selection
    setUnevaluatedList(unevaluatedStudents);

    // Propose choice: random or manual selection
    Alert.alert(
      'Evaluation orale',
      `${unevaluatedStudents.length} eleve(s) non evalue(s)`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: '🎯 Choisir',
          onPress: () => {
            setShowOralStudentPicker(true);
          },
        },
        {
          text: '🎲 Hasard',
          onPress: () => {
            const randomIndex = Math.floor(Math.random() * unevaluatedStudents.length);
            const selected = unevaluatedStudents[randomIndex];
            setOralStudent(selected);
            setSelectedOralGrade(null);
            setShowOralModal(true);
          },
        },
      ]
    );
  }, [students, isStudentAbsent, activeSession, getUnevaluatedStudents, resetClassEvaluations]);

  // Handle manual student selection for oral
  const handleSelectStudentForOral = useCallback((student: StudentWithMapping) => {
    setShowOralStudentPicker(false);
    setOralStudent(student);
    setSelectedOralGrade(null);
    setShowOralModal(true);
  }, []);

  const handleSaveOralEvaluation = async () => {
    if (!oralStudent || selectedOralGrade === null || !user || !activeSession) return;

    setIsSavingOral(true);
    try {
      const result = await addEvaluation(
        user.id,
        oralStudent.id,
        activeSession.class_id,
        selectedOralGrade
      );

      if (result) {
        const evaluatedCount = getEvaluatedCount(activeSession.class_id) + 1;
        const totalPresent = students.filter(s => !isStudentAbsent(s.id)).length;

        Alert.alert(
          'Evaluation enregistree',
          `${oralStudent.fullName || oralStudent.pseudo}: ${selectedOralGrade}/5 - ${ORAL_GRADE_LABELS[selectedOralGrade]}\n\n${evaluatedCount}/${totalPresent} eleves evalues`
        );
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'enregistrer l\'evaluation');
    } finally {
      setIsSavingOral(false);
      setShowOralModal(false);
      setOralStudent(null);
      setSelectedOralGrade(null);
    }
  };

  // Session notes handlers
  const handleOpenSessionNotes = useCallback(() => {
    if (activeSession) {
      setSessionNotesText(activeSession.notes || '');
      setShowSessionNotesModal(true);
    }
  }, [activeSession]);

  const handleSaveSessionNotes = async () => {
    if (!activeSession) return;

    setIsSavingNotes(true);
    try {
      await updateNotes(sessionNotesText.trim() || null);
      setShowSessionNotesModal(false);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder la note');
    } finally {
      setIsSavingNotes(false);
    }
  };

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
              await deleteEvent(eventId);
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
      bavardage: 'Bavardage',
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
  const gridData = useMemo(() => {
    if (!currentRoom || !currentPlan) return null;

    const { grid_rows, grid_cols } = currentRoom;

    // Validation: prevent division by zero and invalid grids
    if (!grid_rows || !grid_cols || grid_rows <= 0 || grid_cols <= 0) {
      return { error: true };
    }

    const cellSize = Math.min(
      (SCREEN_WIDTH - theme.spacing.lg * 2 - theme.spacing.sm * 2) / grid_cols,
      60
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

    return { grid_rows, grid_cols, cellSize, disabledCells, positions: currentPlan.positions };
  }, [currentRoom, currentPlan]);

  const renderGrid = useCallback(() => {
    if (!gridData) return null;

    if ('error' in gridData) {
      return (
        <View style={styles.gridError}>
          <Text style={styles.gridErrorText}>Configuration de salle invalide</Text>
        </View>
      );
    }

    const { grid_rows, grid_cols, cellSize, disabledCells, positions } = gridData;
    const isDisabled = (row: number, col: number) => disabledCells.includes(`${row},${col}`);

    const rows = [];
    for (let r = 0; r < grid_rows; r++) {
      const cells = [];
      for (let c = 0; c < grid_cols; c++) {
        const cellDisabled = isDisabled(r, c);

        // If cell is disabled (aisle), render empty cell
        if (cellDisabled) {
          cells.push(
            <View
              key={`${r}-${c}`}
              style={[
                styles.gridCell,
                styles.gridCellDisabled,
                { width: cellSize, height: cellSize },
              ]}
            />
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
            style={[
              styles.gridCell,
              { width: cellSize, height: cellSize },
              student && styles.gridCellOccupied,
              student && isAbsent && styles.gridCellAbsent,
              student && isOut && styles.gridCellOut,
              selectedStudent?.id === student?.id && styles.gridCellSelected,
            ]}
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
            {student ? (
              <View style={styles.cellContent}>
                <Text style={[styles.cellName, isAbsent && styles.cellNameAbsent, isOut && styles.cellNameOut]} numberOfLines={1}>
                  {getDisplayName(student).split(' ')[0]}
                </Text>
                {isAbsent ? (
                  <View style={styles.absentBadge}>
                    <Text style={styles.absentBadgeText}>ABS</Text>
                  </View>
                ) : isOut && activeSortie ? (
                  <View style={styles.sortieBadge}>
                    <Text style={styles.sortieBadgeText}>🚪 {formatElapsedTime(activeSortie.timestamp)}</Text>
                  </View>
                ) : (
                  counts && (counts.participation > 0 || counts.bavardage > 0) && (
                    <View style={styles.countersRow}>
                      {counts.participation > 0 && (
                        <View style={[styles.counterBadge, styles.counterParticipation]}>
                          <Text style={styles.counterText}>{counts.participation}</Text>
                        </View>
                      )}
                      {counts.bavardage > 0 && (
                        <View style={[styles.counterBadge, styles.counterBavardage]}>
                          <Text style={styles.counterText}>{counts.bavardage}</Text>
                        </View>
                      )}
                    </View>
                  )
                )}
              </View>
            ) : null}
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
          <Text style={styles.teacherText}>Tableau</Text>
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: currentClass?.name || 'Seance',
          headerStyle: { backgroundColor: theme.colors.participation },
          headerTintColor: theme.colors.textInverse,
          headerLeft: () => (
            <Pressable style={styles.cancelButton} onPress={handleCancelSession}>
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable style={styles.endButton} onPress={handleEndSession}>
              <Text style={styles.endButtonText}>Terminer</Text>
            </Pressable>
          ),
        }}
      />

      <View
        ref={containerRef}
        style={styles.contentWrapper}
        onLayout={handleContainerLayout}
      >
        <View style={styles.infoBar}>
          <Text style={styles.infoText}>
            {viewMode === 'plan'
              ? `${currentRoom?.name} - Maintenir appuye sur un eleve`
              : `${currentRoom?.name} - Vue groupes`}
          </Text>
        </View>

        {/* View Mode Toggle */}
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

        {/* Toolbar (plan mode only) */}
        {viewMode === 'plan' && (
          <View style={styles.toolbar}>
            <Pressable
              style={styles.toolbarButton}
              onPress={handleRandomStudent}
            >
              <Text style={styles.toolbarButtonIcon}>🎲</Text>
              <Text style={styles.toolbarButtonText}>Aleatoire</Text>
            </Pressable>
            <View style={styles.toolbarDivider} />
            <Pressable
              style={styles.toolbarButton}
              onPress={handleOralEvaluation}
            >
              <Text style={styles.toolbarButtonIcon}>🎤</Text>
              <Text style={styles.toolbarButtonText}>Oral</Text>
              {activeSession && (
                <View style={styles.oralCountBadge}>
                  <Text style={styles.oralCountText}>
                    {getEvaluatedCount(activeSession.class_id)}/{students.filter(s => !isStudentAbsent(s.id)).length}
                  </Text>
                </View>
              )}
            </Pressable>
            <View style={styles.toolbarDivider} />
            <Pressable
              style={styles.toolbarButton}
              onPress={handleOpenSessionNotes}
            >
              <Text style={styles.toolbarButtonIcon}>📝</Text>
              <Text style={styles.toolbarButtonText}>Note</Text>
              {activeSession?.notes && (
                <View style={styles.noteIndicator} />
              )}
            </Pressable>
            <View style={styles.toolbarDivider} />
            <Pressable
              style={styles.toolbarButton}
              onPress={handleOpenDeleteModal}
            >
              <Text style={styles.toolbarButtonIcon}>🗑️</Text>
              <Text style={styles.toolbarButtonText}>Supprimer</Text>
            </Pressable>
          </View>
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
        />

        {selectedStudent && menuState !== 'closed' && (
          <View style={styles.selectedIndicator}>
            <Text style={styles.selectedText}>
              {getDisplayName(selectedStudent)}
            </Text>
          </View>
        )}
      </View>

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

      {/* Oral Evaluation Modal */}
      <Modal
        visible={showOralModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowOralModal(false);
          setOralStudent(null);
          setSelectedOralGrade(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowOralModal(false);
              setOralStudent(null);
              setSelectedOralGrade(null);
            }}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Evaluation orale</Text>
            {oralStudent && (
              <View style={styles.oralStudentName}>
                <Text style={styles.oralStudentNameText}>
                  {oralStudent.fullName || oralStudent.pseudo}
                </Text>
              </View>
            )}

            <Text style={styles.oralGradeLabel}>Note :</Text>
            <View style={styles.oralGradeButtons}>
              {[1, 2, 3, 4, 5].map((grade) => (
                <Pressable
                  key={grade}
                  style={[
                    styles.oralGradeButton,
                    selectedOralGrade === grade && styles.oralGradeButtonSelected,
                  ]}
                  onPress={() => setSelectedOralGrade(grade)}
                >
                  <Text
                    style={[
                      styles.oralGradeButtonNumber,
                      selectedOralGrade === grade && styles.oralGradeButtonNumberSelected,
                    ]}
                  >
                    {grade}
                  </Text>
                  <Text
                    style={[
                      styles.oralGradeButtonLabel,
                      selectedOralGrade === grade && styles.oralGradeButtonLabelSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {ORAL_GRADE_LABELS[grade]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowOralModal(false);
                  setOralStudent(null);
                  setSelectedOralGrade(null);
                }}
                disabled={isSavingOral}
              >
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.oralSaveButton,
                  (!selectedOralGrade || isSavingOral) && styles.buttonDisabled,
                ]}
                onPress={handleSaveOralEvaluation}
                disabled={!selectedOralGrade || isSavingOral}
              >
                {isSavingOral ? (
                  <ActivityIndicator color={theme.colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Enregistrer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Oral Student Picker Modal */}
      <Modal
        visible={showOralStudentPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOralStudentPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowOralStudentPicker(false)}
          />
          <View style={[styles.modalContent, styles.oralPickerContent]}>
            <Text style={styles.modalTitle}>Choisir un eleve</Text>
            <Text style={styles.oralPickerHint}>
              {unevaluatedList.length} eleve(s) non evalue(s) ce trimestre
            </Text>
            <ScrollView style={styles.oralPickerList} showsVerticalScrollIndicator={false}>
              {unevaluatedList
                .sort((a, b) => (a.fullName || a.pseudo).localeCompare(b.fullName || b.pseudo))
                .map((student) => (
                  <Pressable
                    key={student.id}
                    style={styles.oralPickerItem}
                    onPress={() => handleSelectStudentForOral(student)}
                  >
                    <Text style={styles.oralPickerItemText}>
                      {student.fullName || student.pseudo}
                    </Text>
                  </Pressable>
                ))}
            </ScrollView>
            <Pressable
              style={styles.modalCancelButton}
              onPress={() => setShowOralStudentPicker(false)}
            >
              <Text style={styles.modalCancelButtonText}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Session Notes Modal */}
      <Modal
        visible={showSessionNotesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSessionNotesModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowSessionNotesModal(false)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Note de seance</Text>
            <Text style={styles.sessionNotesHint}>
              Notez vos observations sur cette seance (notions incomprises, remarques generales...)
            </Text>

            <TextInput
              style={styles.sessionNotesInput}
              placeholder="Vos notes sur cette seance..."
              placeholderTextColor={theme.colors.textTertiary}
              value={sessionNotesText}
              onChangeText={setSessionNotesText}
              multiline
              numberOfLines={5}
              maxLength={1000}
              textAlignVertical="top"
            />
            <Text style={styles.sessionNotesCharCount}>
              {sessionNotesText.length}/1000
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setShowSessionNotesModal(false)}
                disabled={isSavingNotes}
              >
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmButton,
                  isSavingNotes && styles.buttonDisabled,
                ]}
                onPress={handleSaveSessionNotes}
                disabled={isSavingNotes}
              >
                {isSavingNotes ? (
                  <ActivityIndicator color={theme.colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Enregistrer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
        criteria={linkedGroupSession?.criteria ?? []}
        maxPossibleScore={linkedGroupSession?.maxPossibleScore ?? 0}
        students={students}
        onGradeChange={handleGradeChange}
        onApplyMalus={handleApplyMalus}
        onResetMalus={handleResetMalus}
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
                  onPress={async () => {
                    if (!user?.id || !stampStudent) return;
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
  endButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  endButtonText: {
    color: theme.colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  cancelButtonText: {
    color: theme.colors.textInverse,
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.9,
  },
  contentWrapper: {
    flex: 1,
  },
  infoBar: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  // Toolbar styles
  toolbar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  toolbarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  toolbarButtonIcon: {
    fontSize: 18,
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  toolbarDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  oralCountBadge: {
    backgroundColor: theme.colors.participation + '30',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    marginLeft: theme.spacing.xs,
  },
  oralCountText: {
    fontSize: 11,
    color: theme.colors.participation,
    fontWeight: '600',
  },
  noteIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
    top: 4,
    right: 4,
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
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridWrapper: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  teacherArea: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.md,
    alignItems: 'center',
  },
  teacherText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  gridContainer: {
    alignItems: 'center',
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridCell: {
    margin: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  gridCellOccupied: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.participation + '50',
  },
  gridCellDisabled: {
    backgroundColor: theme.colors.border,
    borderColor: 'transparent',
    opacity: 0.4,
  },
  gridCellAbsent: {
    backgroundColor: '#FEE2E2', // Light red background
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  gridCellOut: {
    backgroundColor: '#FEF3C7', // Light amber/yellow background
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  gridCellSelected: {
    borderColor: theme.colors.participation,
    borderWidth: 2,
    backgroundColor: theme.colors.participation + '20',
  },
  cellContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  cellName: {
    fontSize: 9,
    fontWeight: '500',
    color: theme.colors.text,
    textAlign: 'center',
  },
  cellNameAbsent: {
    color: '#DC2626', // Red text
    fontWeight: '600',
  },
  cellNameOut: {
    color: '#D97706', // Amber text
    fontWeight: '600',
  },
  absentBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
  },
  absentBadgeText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '700',
  },
  sortieBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginTop: 2,
  },
  sortieBadgeText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '700',
  },
  countersRow: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  counterBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterParticipation: {
    backgroundColor: theme.colors.participation,
  },
  counterBavardage: {
    backgroundColor: theme.colors.bavardage,
  },
  counterText: {
    color: theme.colors.textInverse,
    fontSize: 8,
    fontWeight: '700',
  },
  selectedIndicator: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: theme.colors.participation,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  selectedText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
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

  // View mode toggle
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    padding: 4,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.xs,
    borderRadius: theme.radius.lg,
  },
  viewModeTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.radius.md,
  },
  viewModeTabActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  viewModeTabText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.textSecondary,
  },
  viewModeTabTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
});
