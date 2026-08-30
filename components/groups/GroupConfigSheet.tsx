import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  ChevronsUpDown,
  FileText,
  GripHorizontal,
  Minus,
  Plus,
  Shuffle,
} from 'lucide-react-native';
import { theme } from '../../constants/theme';
import {
  useGroupSessionStore,
  useSessionStore,
  usePlanStore,
  useRoomStore,
  type StudentWithMapping,
} from '../../stores';
import {
  saveLastGroupConfig,
  getLastGroupConfig,
  type LastGroupConfig,
} from '../../stores/groupSessionStore';
import type { TpTemplateWithCriteria } from '../../services/database';
import {
  createTpTemplate,
  createTpTemplateCriteriaBatch,
  getStudentAtPosition,
} from '../../services/database';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DISMISS_THRESHOLD = 120;

type ConfigStep = 'groups' | 'criteria';
type ComposeMode = 'random' | 'manual';

interface TempGroup {
  id: string;
  name: string;
  memberIds: string[];
}

interface TempCriteria {
  id: string;
  label: string;
  maxPoints: number;
}

interface GroupConfigSheetProps {
  visible: boolean;
  userId: string;
  classId: string;
  sessionId: string; // linked regular session ID
  students: StudentWithMapping[];
  onComplete: () => void;
  onClose: () => void;
}

const generateId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Couleurs de groupes en rotation (11b)
const GROUP_COLORS: { bg: string; fg: string }[] = [
  { bg: '#EEF0FF', fg: '#4F46E5' },
  { bg: '#ECFDF5', fg: '#059669' },
  { bg: '#FEF3C7', fg: '#F59E0B' },
  { bg: '#F5F3FF', fg: '#8B5CF6' },
  { bg: '#FDF2F8', fg: '#EC4899' },
  { bg: '#ECFEFF', fg: '#06B6D4' },
];

function getDisplayName(student: StudentWithMapping): string {
  const name = student.fullName || student.pseudo;
  return name.split(' ')[0];
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Stepper -/+ commun (38x38, - blanc borde, + plein indigo) */
function Stepper({
  value,
  display,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  value?: number;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <Pressable
        style={({ pressed }) => [
          styles.stepperMinus,
          minusDisabled && styles.stepperDisabled,
          pressed && styles.pressed,
        ]}
        onPress={onMinus}
        disabled={minusDisabled}
        hitSlop={6}
      >
        <Minus size={16} color={minusDisabled ? theme.colors.textTertiary : theme.colors.text} strokeWidth={2} />
      </Pressable>
      <Text style={styles.stepperValue}>{display}</Text>
      <Pressable
        style={({ pressed }) => [
          styles.stepperPlus,
          plusDisabled && styles.stepperDisabled,
          pressed && styles.pressed,
        ]}
        onPress={onPlus}
        disabled={plusDisabled}
        hitSlop={6}
      >
        <Plus size={16} color="#FFFFFF" strokeWidth={2} />
      </Pressable>
    </View>
  );
}

export function GroupConfigSheet({
  visible,
  userId,
  classId,
  sessionId,
  students,
  onComplete,
  onClose,
}: GroupConfigSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
    })
  ).current;

  // Reset translateY when modal opens
  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
    }
  }, [visible]);

  const {
    createSession,
    addGroup,
    addCriteria,
    setGroupMembers,
    startSession,
    loadTpTemplates,
  } = useGroupSessionStore();
  const { eventCountsByStudent } = useSessionStore();
  const { currentRoom } = useRoomStore();
  const { currentPlan } = usePlanStore();

  const [step, setStep] = useState<ConfigStep>('groups');
  const [mode, setMode] = useState<ComposeMode>('random');
  const [tempGroups, setTempGroups] = useState<TempGroup[]>([]);
  const [tempCriteria, setTempCriteria] = useState<TempCriteria[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [perGroup, setPerGroup] = useState(4);
  const [isCreating, setIsCreating] = useState(false);

  // "Reprendre" : derniere config connue de la classe
  const [lastConfig, setLastConfig] = useState<LastGroupConfig | null>(null);

  // Templates (etape 2, selecteur replie 12a)
  const [tpTemplates, setTpTemplates] = useState<TpTemplateWithCriteria[]>([]);
  const [templateExpanded, setTemplateExpanded] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [sessionName, setSessionName] = useState('Séance de groupe');

  // Eleves presents / absents
  const absentIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      if ((eventCountsByStudent[s.id]?.absence ?? 0) > 0) set.add(s.id);
    }
    return set;
  }, [students, eventCountsByStudent]);

  const presentStudents = useMemo(
    () => students.filter((s) => !absentIds.has(s.id)),
    [students, absentIds]
  );

  const assignedIds = useMemo(
    () => new Set(tempGroups.flatMap((g) => g.memberIds)),
    [tempGroups]
  );
  const unassignedCount = presentStudents.filter((s) => !assignedIds.has(s.id)).length;

  // Init
  useEffect(() => {
    if (visible) {
      setStep('groups');
      setMode('random');
      setTempGroups([]);
      setTempCriteria([]);
      setSelectedGroupIndex(0);
      setTemplateExpanded(false);
      setSaveAsTemplate(false);
      setSessionName('Séance de groupe');

      loadTpTemplates(userId)
        .then(setTpTemplates)
        .catch(() => setTpTemplates([]));

      getLastGroupConfig(classId)
        .then((config) => {
          setLastConfig(config);
          setSelectedTemplateId(config?.templateId ?? null);
          if (config?.templateId) {
            // Pre-remplir les criteres avec le dernier modele de la classe
            const criteria = config.criteria.map((c) => ({
              id: generateId(),
              label: c.label,
              maxPoints: c.maxPoints,
            }));
            setTempCriteria(criteria);
          }
        })
        .catch(() => setLastConfig(null));
    }
  }, [visible, userId, classId, loadTpTemplates]);

  const selectedGroup = tempGroups[selectedGroupIndex] || null;

  const canProceedToCriteria = tempGroups.length > 0 && tempGroups.every((g) => g.memberIds.length > 0);
  const canStart = tempCriteria.length > 0;
  const totalMaxPoints = tempCriteria.reduce((sum, c) => sum + c.maxPoints, 0);

  // ---- "Reprendre" (10c) ----

  const handleResume = () => {
    if (!lastConfig) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const validIds = new Set(students.map((s) => s.id));
    setTempGroups(
      lastConfig.groups.map((g) => ({
        id: generateId(),
        name: g.name,
        memberIds: g.memberIds.filter((id) => validIds.has(id) && !absentIds.has(id)),
      }))
    );
    setTempCriteria(
      lastConfig.criteria.map((c) => ({ id: generateId(), label: c.label, maxPoints: c.maxPoints }))
    );
    setSelectedTemplateId(lastConfig.templateId);
    setSelectedGroupIndex(0);
    setMode('manual');
  };

  // ---- Composition aleatoire ----

  const generateRandomGroups = (haptic = true) => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shuffled = shuffleArray(presentStudents.map((s) => s.id));
    const numGroups = Math.max(1, Math.ceil(shuffled.length / perGroup));
    const newGroups: TempGroup[] = [];
    for (let i = 0; i < numGroups; i++) {
      newGroups.push({
        id: generateId(),
        name: `G${i + 1}`,
        memberIds: shuffled.slice(i * perGroup, Math.min((i + 1) * perGroup, shuffled.length)),
      });
    }
    setTempGroups(newGroups);
    setSelectedGroupIndex(0);
  };

  // Generer automatiquement a l'arrivee en mode aleatoire si rien n'existe
  useEffect(() => {
    if (visible && mode === 'random' && tempGroups.length === 0 && presentStudents.length > 0) {
      generateRandomGroups(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, perGroup]);

  // ---- Composition manuelle (11b : tap sur le plan) ----

  const handleAddManualGroup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newGroup: TempGroup = {
      id: generateId(),
      name: `G${tempGroups.length + 1}`,
      memberIds: [],
    };
    setTempGroups((prev) => [...prev, newGroup]);
    setSelectedGroupIndex(tempGroups.length);
  };

  const handleRemoveGroup = (index: number) => {
    const newGroups = tempGroups.filter((_, i) => i !== index).map((g, i) => ({ ...g, name: `G${i + 1}` }));
    setTempGroups(newGroups);
    if (selectedGroupIndex >= newGroups.length) {
      setSelectedGroupIndex(Math.max(0, newGroups.length - 1));
    }
  };

  const groupIndexOfStudent = (studentId: string): number =>
    tempGroups.findIndex((g) => g.memberIds.includes(studentId));

  const handleTapStudent = (studentId: string) => {
    if (absentIds.has(studentId)) return;
    const inGroupIndex = groupIndexOfStudent(studentId);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (inGroupIndex >= 0) {
      // Re-tap : retire l'eleve de son groupe
      setTempGroups((prev) =>
        prev.map((g, i) =>
          i === inGroupIndex ? { ...g, memberIds: g.memberIds.filter((id) => id !== studentId) } : g
        )
      );
      return;
    }

    if (!selectedGroup) {
      handleAddManualGroup();
      // handleAddManualGroup est asynchrone (setState) : on ajoute directement au nouveau groupe
      setTempGroups((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last) last.memberIds = [...last.memberIds, studentId];
        return next;
      });
      return;
    }

    setTempGroups((prev) =>
      prev.map((g) =>
        g.id === selectedGroup.id ? { ...g, memberIds: [...g.memberIds, studentId] } : g
      )
    );
  };

  // "Completer au hasard" : repartit les non-assignes dans les groupes les moins remplis
  const handleFillRandom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const remaining = shuffleArray(
      presentStudents.filter((s) => !assignedIds.has(s.id)).map((s) => s.id)
    );
    if (remaining.length === 0) return;

    setTempGroups((prev) => {
      let groups = prev.map((g) => ({ ...g, memberIds: [...g.memberIds] }));
      if (groups.length === 0) {
        const numGroups = Math.max(1, Math.ceil(remaining.length / perGroup));
        groups = Array.from({ length: numGroups }, (_, i) => ({
          id: generateId(),
          name: `G${i + 1}`,
          memberIds: [] as string[],
        }));
      }
      for (const id of remaining) {
        groups.sort((a, b) => a.memberIds.length - b.memberIds.length);
        groups[0].memberIds.push(id);
      }
      // Restaure l'ordre G1..Gn
      groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      return groups;
    });
  };

  // ---- Criteres (12a) ----

  const handleSelectTemplate = (template: TpTemplateWithCriteria | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTemplateExpanded(false);
    if (!template) {
      // Partir de zero
      setSelectedTemplateId(null);
      setTempCriteria([]);
      setSessionName('Séance de groupe');
      return;
    }
    setSelectedTemplateId(template.id);
    setSessionName(template.name);
    setTempCriteria(
      template.criteria.map((c) => ({ id: generateId(), label: c.label, maxPoints: c.maxPoints }))
    );
  };

  const handleAddCriteria = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempCriteria((prev) => [
      ...prev,
      { id: generateId(), label: `Critère ${prev.length + 1}`, maxPoints: 5 },
    ]);
  };

  const handleCriteriaPoints = (id: string, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempCriteria((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, maxPoints: Math.max(1, Math.min(20, c.maxPoints + delta)) } : c
      )
    );
  };

  const handleCriteriaLabel = (id: string, label: string) => {
    setTempCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
  };

  const handleRemoveCriteria = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTempCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  // ---- Save & start ----

  const handleStart = async () => {
    setIsCreating(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 1. Create group session linked to regular session
      const gsSession = await createSession(userId, classId, sessionName.trim(), sessionId);
      if (!gsSession) throw new Error('Failed to create group session');

      // 2. Add criteria
      for (const crit of tempCriteria) {
        await addCriteria(crit.label, crit.maxPoints);
      }

      // 3. Add groups with members
      for (const group of tempGroups) {
        const sessionGroup = await addGroup(group.name);
        if (sessionGroup) {
          await setGroupMembers(sessionGroup.id, group.memberIds);
        }
      }

      // 4. Start session (draft → active)
      await startSession();

      // 5. Enregistrer comme modele si demande
      let templateId = selectedTemplateId;
      if (saveAsTemplate && tempCriteria.length > 0) {
        try {
          const template = await createTpTemplate(userId, sessionName.trim());
          await createTpTemplateCriteriaBatch(
            template.id,
            tempCriteria.map((c) => ({ label: c.label, maxPoints: c.maxPoints }))
          );
          templateId = template.id;
        } catch (err) {
          console.error('[GroupConfigSheet] Template save failed:', err);
        }
      }

      // 6. Memoriser la derniere config de la classe (pour "Reprendre")
      await saveLastGroupConfig(classId, {
        groups: tempGroups.map((g) => ({ name: g.name, memberIds: g.memberIds })),
        criteria: tempCriteria.map((c) => ({ label: c.label, maxPoints: c.maxPoints })),
        templateId,
      });

      onComplete();
    } catch (error) {
      console.error('[GroupConfigSheet] Error:', error);
      Alert.alert('Erreur', 'Impossible de créer les groupes');
    } finally {
      setIsCreating(false);
    }
  };

  // ---- Rendu du plan de classe (11b) ----

  const renderMiniPlan = () => {
    if (!currentRoom || !currentPlan) {
      return renderChipsFallback();
    }

    const { grid_rows, grid_cols } = currentRoom;
    if (!grid_rows || !grid_cols) return renderChipsFallback();

    let disabledCells: string[] = [];
    try {
      disabledCells = currentRoom.disabled_cells ? JSON.parse(currentRoom.disabled_cells) : [];
    } catch {
      disabledCells = [];
    }

    const gap = 3;
    const cellSize = Math.min((SCREEN_WIDTH - 48 - gap * (grid_cols - 1)) / grid_cols, 46);

    const placedIds = new Set(Object.values(currentPlan.positions));
    const offPlanStudents = presentStudents.filter((s) => !placedIds.has(s.id));

    const rows = [];
    for (let r = 0; r < grid_rows; r++) {
      const cells = [];
      for (let c = 0; c < grid_cols; c++) {
        if (disabledCells.includes(`${r},${c}`)) {
          cells.push(
            <View
              key={`${r}-${c}`}
              style={[styles.planCellAisle, { width: cellSize, height: cellSize }]}
            />
          );
          continue;
        }

        const studentId = getStudentAtPosition(currentPlan.positions, r, c);
        const student = studentId ? students.find((s) => s.id === studentId) : null;

        if (!student) {
          cells.push(
            <View
              key={`${r}-${c}`}
              style={[styles.planCellEmpty, { width: cellSize, height: cellSize }]}
            />
          );
          continue;
        }

        const isAbsent = absentIds.has(student.id);
        const gIndex = groupIndexOfStudent(student.id);
        const color = gIndex >= 0 ? GROUP_COLORS[gIndex % GROUP_COLORS.length] : null;

        cells.push(
          <Pressable
            key={`${r}-${c}`}
            style={[
              styles.planCell,
              { width: cellSize, height: cellSize },
              isAbsent && styles.planCellAbsent,
              color && { backgroundColor: color.bg, borderColor: color.fg },
            ]}
            onPress={() => handleTapStudent(student.id)}
            disabled={isAbsent}
          >
            <Text
              style={[
                styles.planCellName,
                isAbsent && styles.planCellNameAbsent,
                color && { color: color.fg },
              ]}
              numberOfLines={1}
            >
              {getDisplayName(student)}
            </Text>
            {gIndex >= 0 && (
              <Text style={[styles.planCellTag, { color: color!.fg }]}>
                {tempGroups[gIndex].name}
              </Text>
            )}
          </Pressable>
        );
      }
      rows.push(
        <View key={r} style={[styles.planRow, { gap }]}>
          {cells}
        </View>
      );
    }

    return (
      <View>
        <View style={[styles.planGrid, { gap }]}>{rows}</View>
        {offPlanStudents.length > 0 && (
          <View style={styles.offPlanSection}>
            <Text style={styles.offPlanLabel}>Hors plan :</Text>
            <View style={styles.chipsRow}>
              {offPlanStudents.map((s) => {
                const gIndex = groupIndexOfStudent(s.id);
                const color = gIndex >= 0 ? GROUP_COLORS[gIndex % GROUP_COLORS.length] : null;
                return (
                  <Pressable
                    key={s.id}
                    style={[
                      styles.studentChip,
                      color && { backgroundColor: color.bg, borderColor: color.fg },
                    ]}
                    onPress={() => handleTapStudent(s.id)}
                  >
                    <Text style={[styles.studentChipText, color && { color: color.fg }]}>
                      {getDisplayName(s)}
                      {gIndex >= 0 ? ` · ${tempGroups[gIndex].name}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  };

  // Fallback sans plan : liste de chips tappables
  const renderChipsFallback = () => (
    <View style={styles.chipsRow}>
      {presentStudents.map((s) => {
        const gIndex = groupIndexOfStudent(s.id);
        const color = gIndex >= 0 ? GROUP_COLORS[gIndex % GROUP_COLORS.length] : null;
        return (
          <Pressable
            key={s.id}
            style={[
              styles.studentChip,
              color && { backgroundColor: color.bg, borderColor: color.fg },
            ]}
            onPress={() => handleTapStudent(s.id)}
          >
            <Text style={[styles.studentChipText, color && { color: color.fg }]}>
              {getDisplayName(s)}
              {gIndex >= 0 ? ` · ${tempGroups[gIndex].name}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // ---- Render ----

  const selectedTemplate = tpTemplates.find((t) => t.id === selectedTemplateId) || null;
  const numRandomGroups = Math.max(1, Math.ceil(presentStudents.length / perGroup));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrapper}
        >
          <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY }] }]}>
            <View {...panResponder.panHandlers} style={styles.handleZone}>
              <View style={styles.handle} />
            </View>

            {/* Header : titre + stepper d'etapes + Reprendre */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>
                  {step === 'groups' ? 'Composer les groupes' : 'Critères'}
                </Text>
                <View style={styles.stepIndicator}>
                  <View style={[styles.stepDot, step === 'groups' ? styles.stepDotActive : styles.stepDotDone]}>
                    {step === 'criteria' ? (
                      <Check size={11} color="#FFFFFF" strokeWidth={3} />
                    ) : (
                      <Text style={styles.stepDotText}>1</Text>
                    )}
                  </View>
                  <View style={styles.stepLine} />
                  <View style={[styles.stepDot, step === 'criteria' && styles.stepDotActive]}>
                    <Text style={[styles.stepDotText, step === 'groups' && styles.stepDotTextInactive]}>2</Text>
                  </View>
                </View>
              </View>
              {step === 'groups' && lastConfig && (
                <Pressable onPress={handleResume} hitSlop={8}>
                  <Text style={styles.resumeLink}>Reprendre</Text>
                </Pressable>
              )}
            </View>

            {/* Etape 1 : composer les groupes */}
            {step === 'groups' && (
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                {/* Segmente Aleatoire / Manuel */}
                <View style={styles.modeToggle}>
                  <Pressable
                    style={[styles.modeTab, mode === 'random' && styles.modeTabActive]}
                    onPress={() => setMode('random')}
                  >
                    <Text style={[styles.modeTabText, mode === 'random' && styles.modeTabTextActive]}>
                      Aléatoire
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeTab, mode === 'manual' && styles.modeTabActive]}
                    onPress={() => setMode('manual')}
                  >
                    <Text style={[styles.modeTabText, mode === 'manual' && styles.modeTabTextActive]}>
                      Manuel
                    </Text>
                  </Pressable>
                </View>

                {mode === 'random' ? (
                  <>
                    {/* Stepper eleves par groupe */}
                    <View style={styles.paramRow}>
                      <Text style={styles.paramLabel}>Élèves par groupe</Text>
                      <Stepper
                        display={String(perGroup)}
                        onMinus={() => setPerGroup((v) => Math.max(2, v - 1))}
                        onPlus={() => setPerGroup((v) => Math.min(10, v + 1))}
                        minusDisabled={perGroup <= 2}
                        plusDisabled={perGroup >= 10}
                      />
                    </View>

                    {/* Apercu */}
                    <View style={styles.previewBox}>
                      <Text style={styles.previewText}>
                        {presentStudents.length} présent{presentStudents.length > 1 ? 's' : ''} →{' '}
                        {numRandomGroups} groupe{numRandomGroups > 1 ? 's' : ''} de {perGroup} · les
                        absents sont exclus
                      </Text>
                    </View>

                    {/* Groupes generes en pills */}
                    <View style={styles.generatedGroups}>
                      {tempGroups.map((g, idx) => {
                        const color = GROUP_COLORS[idx % GROUP_COLORS.length];
                        return (
                          <View
                            key={g.id}
                            style={[styles.generatedPill, { backgroundColor: color.bg }]}
                          >
                            <Text style={[styles.generatedPillText, { color: color.fg }]}>
                              {g.name} ·{' '}
                              {g.memberIds
                                .map((id) => {
                                  const s = students.find((st) => st.id === id);
                                  return s ? getDisplayName(s) : '';
                                })
                                .filter(Boolean)
                                .join(', ')}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    <Pressable
                      style={({ pressed }) => [styles.shuffleButton, pressed && styles.pressed]}
                      onPress={() => generateRandomGroups()}
                    >
                      <Shuffle size={16} color={theme.colors.text} strokeWidth={1.8} />
                      <Text style={styles.shuffleButtonText}>Mélanger</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    {/* Pills de groupes (11b) */}
                    <View style={styles.manualHeader}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupPillsScroll}>
                        <View style={styles.groupPillsRow}>
                          {tempGroups.map((g, idx) => {
                            const color = GROUP_COLORS[idx % GROUP_COLORS.length];
                            const isActive = idx === selectedGroupIndex;
                            const isDone = g.memberIds.length >= perGroup;
                            return (
                              <Pressable
                                key={g.id}
                                style={[
                                  styles.groupPill,
                                  isDone && !isActive && { backgroundColor: color.fg, borderColor: color.fg },
                                  isActive && styles.groupPillActive,
                                ]}
                                onPress={() => setSelectedGroupIndex(idx)}
                                onLongPress={() => handleRemoveGroup(idx)}
                              >
                                {isDone && !isActive && (
                                  <Check size={12} color="#FFFFFF" strokeWidth={3} />
                                )}
                                <Text
                                  style={[
                                    styles.groupPillText,
                                    isDone && !isActive && styles.groupPillTextDone,
                                    isActive && styles.groupPillTextActive,
                                  ]}
                                >
                                  {g.name} · {g.memberIds.length}/{perGroup}
                                </Text>
                              </Pressable>
                            );
                          })}
                          <Pressable style={styles.newGroupPill} onPress={handleAddManualGroup}>
                            <Text style={styles.newGroupPillText}>+ Nouveau</Text>
                          </Pressable>
                        </View>
                      </ScrollView>
                      <Text style={styles.remainingCount}>
                        {unassignedCount} restant{unassignedCount > 1 ? 's' : ''}
                      </Text>
                    </View>

                    {/* Plan de classe tappable */}
                    {renderMiniPlan()}

                    <Text style={styles.manualHint}>
                      Tap = ajouter au groupe actif · re-tap = retirer · appui long sur une pill =
                      supprimer le groupe
                    </Text>
                  </>
                )}
              </ScrollView>
            )}

            {/* Etape 2 : criteres (12a) */}
            {step === 'criteria' && (
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                {/* Selecteur de modele replie */}
                <Pressable
                  style={styles.templateSelector}
                  onPress={() => setTemplateExpanded((v) => !v)}
                >
                  <View style={styles.templateIcon}>
                    <FileText size={17} color={theme.colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={styles.templateInfo}>
                    <Text style={styles.templateName} numberOfLines={1}>
                      {selectedTemplate ? selectedTemplate.name : 'Partir de zéro'}
                    </Text>
                    <Text style={styles.templateDetail} numberOfLines={1}>
                      {selectedTemplate
                        ? `${selectedTemplate.criteria.length} critères · ${selectedTemplate.totalPoints} pts`
                        : 'Choisir un modèle de barème'}
                    </Text>
                  </View>
                  <ChevronsUpDown size={17} color={theme.colors.textTertiary} strokeWidth={1.8} />
                </Pressable>

                {templateExpanded && (
                  <View style={styles.templateList}>
                    {tpTemplates.map((tpl) => (
                      <Pressable
                        key={tpl.id}
                        style={({ pressed }) => [styles.templateOption, pressed && styles.pressedBg]}
                        onPress={() => handleSelectTemplate(tpl)}
                      >
                        <Text style={styles.templateOptionName}>{tpl.name}</Text>
                        <Text style={styles.templateOptionDetail}>
                          {tpl.criteria.length} critères · {tpl.totalPoints} pts
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      style={({ pressed }) => [styles.templateOption, pressed && styles.pressedBg]}
                      onPress={() => handleSelectTemplate(null)}
                    >
                      <Text style={[styles.templateOptionName, { color: theme.colors.primary }]}>
                        Partir de zéro
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* Liste des criteres */}
                {tempCriteria.map((crit) => (
                  <Pressable
                    key={crit.id}
                    style={styles.criteriaRow}
                    onLongPress={() => handleRemoveCriteria(crit.id)}
                    delayLongPress={500}
                  >
                    <GripHorizontal size={15} color={theme.colors.textTertiary} strokeWidth={1.8} />
                    <TextInput
                      style={styles.criteriaLabelInput}
                      value={crit.label}
                      onChangeText={(text) => handleCriteriaLabel(crit.id, text)}
                      placeholder="Nom du critère"
                      placeholderTextColor={theme.colors.textTertiary}
                    />
                    <Stepper
                      display={`${crit.maxPoints} pt${crit.maxPoints > 1 ? 's' : ''}`}
                      onMinus={() => handleCriteriaPoints(crit.id, -1)}
                      onPlus={() => handleCriteriaPoints(crit.id, 1)}
                      minusDisabled={crit.maxPoints <= 1}
                      plusDisabled={crit.maxPoints >= 20}
                    />
                  </Pressable>
                ))}

                {/* Ajouter un critere */}
                <Pressable
                  style={({ pressed }) => [styles.addCriteriaRow, pressed && styles.pressedBg]}
                  onPress={handleAddCriteria}
                >
                  <Plus size={16} color={theme.colors.primary} strokeWidth={2} />
                  <Text style={styles.addCriteriaText}>Ajouter un critère</Text>
                </Pressable>

                {tempCriteria.length > 0 && (
                  <Text style={styles.criteriaHint}>Appui long sur un critère pour le supprimer</Text>
                )}

                {/* Total du bareme */}
                <View style={styles.totalBox}>
                  <Text style={styles.totalBoxText}>
                    Total du barème : {totalMaxPoints} pt{totalMaxPoints > 1 ? 's' : ''}
                  </Text>
                </View>

                {/* Enregistrer comme modele */}
                <Pressable
                  style={styles.saveTemplateRow}
                  onPress={() => setSaveAsTemplate((v) => !v)}
                >
                  <Text style={styles.saveTemplateLabel}>Enregistrer comme modèle</Text>
                  <View style={[styles.switchTrack, saveAsTemplate && styles.switchTrackOn]}>
                    <View style={[styles.switchThumb, saveAsTemplate && styles.switchThumbOn]} />
                  </View>
                </Pressable>
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              {step === 'groups' ? (
                <>
                  <Pressable
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    onPress={handleFillRandom}
                  >
                    <Text style={styles.secondaryButtonText}>Compléter au hasard</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      !canProceedToCriteria && styles.buttonDisabled,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setStep('criteria');
                    }}
                    disabled={!canProceedToCriteria}
                  >
                    <Text style={styles.primaryButtonText}>Critères →</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    onPress={() => setStep('groups')}
                  >
                    <Text style={styles.secondaryButtonText}>← Groupes</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.startButton,
                      (!canStart || isCreating) && styles.buttonDisabled,
                      pressed && styles.pressed,
                    ]}
                    onPress={handleStart}
                    disabled={!canStart || isCreating}
                  >
                    {isCreating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.startButtonText}>Lancer la notation</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.sheetBackdrop,
  },
  sheetWrapper: {
    maxHeight: '92%',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleZone: {
    paddingTop: theme.spacing.sm + 2,
    paddingBottom: theme.spacing.xs,
    alignItems: 'center',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: theme.spacing.md,
  },
  headerLeft: {},
  headerTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
    gap: 6,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.segmentTrack,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: theme.colors.primary,
  },
  stepDotDone: {
    backgroundColor: theme.colors.action,
  },
  stepDotText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  stepDotTextInactive: {
    color: theme.colors.textSecondary,
  },
  stepLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.segmentTrack,
  },
  resumeLink: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.primary,
  },
  scrollArea: {
    maxHeight: 440,
    paddingHorizontal: 24,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.segmentTrack,
    padding: 3,
    borderRadius: 10,
    marginBottom: theme.spacing.md,
  },
  modeTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  modeTabText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13.5,
    color: theme.colors.textSecondary,
  },
  modeTabTextActive: {
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.text,
  },

  // Steppers
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stepperMinus: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperPlus: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperDisabled: {
    opacity: 0.45,
  },
  stepperValue: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 15,
    color: theme.colors.text,
    minWidth: 42,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  pressedBg: {
    backgroundColor: theme.colors.surfaceHover,
  },

  // Random mode
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  paramLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14.5,
    color: theme.colors.text,
  },
  previewBox: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  previewText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.primary,
  },
  generatedGroups: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  generatedPill: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  generatedPillText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
  },
  shuffleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: theme.spacing.md,
  },
  shuffleButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
  },

  // Manual mode
  manualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  groupPillsScroll: {
    flex: 1,
  },
  groupPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 6,
  },
  groupPillActive: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    backgroundColor: '#FFFBEB',
  },
  groupPillText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12.5,
    color: theme.colors.textSecondary,
  },
  groupPillTextDone: {
    color: '#FFFFFF',
  },
  groupPillTextActive: {
    color: '#B45309',
  },
  newGroupPill: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 6,
  },
  newGroupPillText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12.5,
    color: theme.colors.textSecondary,
  },
  remainingCount: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  planGrid: {
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  planRow: {
    flexDirection: 'row',
  },
  planCell: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
  },
  planCellAisle: {
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceDisabled,
  },
  planCellEmpty: {
    borderRadius: 8,
    backgroundColor: theme.colors.background,
  },
  planCellAbsent: {
    backgroundColor: theme.colors.surfaceDisabled,
    borderColor: theme.colors.surfaceDisabled,
  },
  planCellName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 9,
    color: theme.colors.text,
    textAlign: 'center',
  },
  planCellNameAbsent: {
    color: theme.colors.textTertiary,
  },
  planCellTag: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 7.5,
  },
  offPlanSection: {
    marginTop: theme.spacing.xs,
  },
  offPlanLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs + 2,
  },
  studentChip: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  studentChipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.text,
  },
  manualHint: {
    fontFamily: theme.fonts.body,
    fontSize: 11.5,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },

  // Etape 2 : criteres
  templateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: theme.spacing.sm + 2,
    marginBottom: theme.spacing.sm,
  },
  templateIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
  },
  templateDetail: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  templateList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  templateOption: {
    paddingVertical: 11,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  templateOptionName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
  },
  templateOptionDetail: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  criteriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.sm,
  },
  criteriaLabelInput: {
    flex: 1,
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14.5,
    color: theme.colors.text,
    paddingVertical: 4,
  },
  addCriteriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm + 2,
  },
  addCriteriaText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.primary,
  },
  criteriaHint: {
    fontFamily: theme.fonts.body,
    fontSize: 11.5,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  totalBox: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  totalBoxText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.primary,
  },
  saveTemplateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  saveTemplateLabel: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.segmentTrack,
    padding: 3,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: theme.colors.primary,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm + 2,
    paddingHorizontal: 24,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: '#fff',
  },
  startButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.action,
    alignItems: 'center',
  },
  startButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
