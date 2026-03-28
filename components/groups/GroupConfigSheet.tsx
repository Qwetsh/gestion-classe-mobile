import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { theme } from '../../constants/theme';
import { useGroupSessionStore, type StudentWithMapping } from '../../stores';
import type { TpTemplateWithCriteria } from '../../services/database';
import { getPreviousGroupsForClass } from '../../services/database';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;

type ConfigStep = 'groups' | 'criteria';

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

function getDisplayName(student: StudentWithMapping): string {
  const name = student.fullName || student.pseudo;
  return name.split(' ')[0];
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

  const [step, setStep] = useState<ConfigStep>('groups');
  const [sessionName, setSessionName] = useState('Séance de groupe');
  const [tempGroups, setTempGroups] = useState<TempGroup[]>([]);
  const [tempCriteria, setTempCriteria] = useState<TempCriteria[]>([]);
  const [unassignedStudentIds, setUnassignedStudentIds] = useState<string[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);

  // Random groups modal
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [studentsPerGroup, setStudentsPerGroup] = useState('4');

  // Template
  const [tpTemplates, setTpTemplates] = useState<TpTemplateWithCriteria[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // New criteria input
  const [newCriteriaLabel, setNewCriteriaLabel] = useState('');
  const [newCriteriaMax, setNewCriteriaMax] = useState('5');

  // Init
  useEffect(() => {
    if (visible) {
      setStep('groups');
      setTempGroups([]);
      setTempCriteria([]);
      setUnassignedStudentIds(students.map((s) => s.id));
      setSelectedGroupIndex(0);

      loadTpTemplates(userId)
        .then(setTpTemplates)
        .catch(() => setTpTemplates([]));

      // Check for previous groups to reuse
      getPreviousGroupsForClass(classId).then((previousGroups) => {
        if (previousGroups && previousGroups.length > 0) {
          Alert.alert(
            'Groupes précédents',
            `${previousGroups.length} groupes trouvés de la dernière séance. Voulez-vous les réutiliser ?`,
            [
              { text: 'Non, repartir de zéro', style: 'cancel' },
              {
                text: 'Oui, réutiliser',
                onPress: () => {
                  const studentIds = students.map((s) => s.id);
                  const groups: TempGroup[] = previousGroups.map((g) => ({
                    id: generateId(),
                    name: g.name,
                    memberIds: g.memberIds.filter((id) => studentIds.includes(id)),
                  }));
                  const assignedIds = new Set(groups.flatMap((g) => g.memberIds));
                  setTempGroups(groups);
                  setUnassignedStudentIds(studentIds.filter((id) => !assignedIds.has(id)));
                  setSelectedGroupIndex(0);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                },
              },
            ]
          );
        }
      }).catch(() => {});
    }
  }, [visible, students, userId, classId, loadTpTemplates]);

  const selectedGroup = tempGroups[selectedGroupIndex] || null;

  const canProceedToCriteria = tempGroups.length > 0 && tempGroups.every((g) => g.memberIds.length > 0);
  const canStart = tempCriteria.length > 0;

  // ---- Group management ----

  const handleAddGroup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newGroup: TempGroup = {
      id: generateId(),
      name: `Groupe ${tempGroups.length + 1}`,
      memberIds: [],
    };
    setTempGroups([...tempGroups, newGroup]);
    setSelectedGroupIndex(tempGroups.length);
  };

  const handleRemoveGroup = (index: number) => {
    const group = tempGroups[index];
    setUnassignedStudentIds((prev) => [...prev, ...group.memberIds]);
    const newGroups = tempGroups.filter((_, i) => i !== index);
    setTempGroups(newGroups);
    if (selectedGroupIndex >= newGroups.length) {
      setSelectedGroupIndex(Math.max(0, newGroups.length - 1));
    }
  };

  const handleAssignStudent = (studentId: string) => {
    if (!selectedGroup) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempGroups((prev) =>
      prev.map((g) =>
        g.id === selectedGroup.id
          ? { ...g, memberIds: [...g.memberIds, studentId] }
          : g
      )
    );
    setUnassignedStudentIds((prev) => prev.filter((id) => id !== studentId));
  };

  const handleUnassignStudent = (studentId: string) => {
    if (!selectedGroup) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempGroups((prev) =>
      prev.map((g) =>
        g.id === selectedGroup.id
          ? { ...g, memberIds: g.memberIds.filter((id) => id !== studentId) }
          : g
      )
    );
    setUnassignedStudentIds((prev) => [...prev, studentId]);
  };

  const handleCreateRandomGroups = () => {
    const perGroup = parseInt(studentsPerGroup);
    if (isNaN(perGroup) || perGroup < 1) {
      Alert.alert('Erreur', "Nombre d'élèves invalide");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const shuffled = [...students.map((s) => s.id)].sort(() => Math.random() - 0.5);
    const numGroups = Math.ceil(shuffled.length / perGroup);
    const newGroups: TempGroup[] = [];

    for (let i = 0; i < numGroups; i++) {
      newGroups.push({
        id: generateId(),
        name: `Groupe ${i + 1}`,
        memberIds: shuffled.slice(i * perGroup, Math.min((i + 1) * perGroup, shuffled.length)),
      });
    }

    setTempGroups(newGroups);
    setUnassignedStudentIds([]);
    setSelectedGroupIndex(0);
    setShowRandomModal(false);
  };

  // ---- Criteria management ----

  const handleAddCriteria = () => {
    const label = newCriteriaLabel.trim();
    const maxPoints = parseFloat(newCriteriaMax);
    if (!label || isNaN(maxPoints) || maxPoints <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setTempCriteria((prev) => [
      ...prev,
      { id: generateId(), label, maxPoints },
    ]);
    setNewCriteriaLabel('');
    setNewCriteriaMax('5');
  };

  const handleRemoveCriteria = (id: string) => {
    setTempCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  const handleApplyTemplate = (template: TpTemplateWithCriteria) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const criteria = template.criteria.map((c) => ({
      id: generateId(),
      label: c.label,
      maxPoints: c.maxPoints,
    }));
    setTempCriteria(criteria);
    setShowTemplateModal(false);
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

      onComplete();
    } catch (error) {
      console.error('[GroupConfigSheet] Error:', error);
      Alert.alert('Erreur', 'Impossible de créer les groupes');
    } finally {
      setIsCreating(false);
    }
  };

  const totalMaxPoints = tempCriteria.reduce((sum, c) => sum + c.maxPoints, 0);

  // ---- Render ----

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

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                {step === 'groups' ? 'Composer les groupes' : 'Critères de notation'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {step === 'groups'
                  ? `${students.length} élèves - ${tempGroups.length} groupe${tempGroups.length > 1 ? 's' : ''}`
                  : `${tempCriteria.length} critère${tempCriteria.length > 1 ? 's' : ''} - Total: ${totalMaxPoints} pts`}
              </Text>
            </View>

            {/* Step: Groups */}
            {step === 'groups' && (
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                {/* Actions row */}
                <View style={styles.actionsRow}>
                  <Pressable style={styles.actionButton} onPress={handleAddGroup}>
                    <Text style={styles.actionButtonText}>+ Groupe</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.actionButtonSecondary]}
                    onPress={() => setShowRandomModal(true)}
                  >
                    <Text style={styles.actionButtonSecondaryText}>Aléatoire</Text>
                  </Pressable>
                </View>

                {/* Group tabs */}
                {tempGroups.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupTabs}>
                    {tempGroups.map((g, idx) => (
                      <Pressable
                        key={g.id}
                        style={[styles.groupTab, idx === selectedGroupIndex && styles.groupTabActive]}
                        onPress={() => setSelectedGroupIndex(idx)}
                        onLongPress={() => handleRemoveGroup(idx)}
                      >
                        <Text style={[styles.groupTabText, idx === selectedGroupIndex && styles.groupTabTextActive]}>
                          {g.name} ({g.memberIds.length})
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}

                {/* Selected group members */}
                {selectedGroup && (
                  <View style={styles.membersSection}>
                    <Text style={styles.sectionLabel}>Membres de {selectedGroup.name} :</Text>
                    <View style={styles.chipsRow}>
                      {selectedGroup.memberIds.map((id) => {
                        const student = students.find((s) => s.id === id);
                        if (!student) return null;
                        return (
                          <Pressable
                            key={id}
                            style={styles.memberChipAssigned}
                            onPress={() => handleUnassignStudent(id)}
                          >
                            <Text style={styles.memberChipAssignedText}>
                              {getDisplayName(student)} x
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Unassigned students */}
                {unassignedStudentIds.length > 0 && selectedGroup && (
                  <View style={styles.membersSection}>
                    <Text style={styles.sectionLabel}>
                      Non assignés ({unassignedStudentIds.length}) :
                    </Text>
                    <View style={styles.chipsRow}>
                      {unassignedStudentIds.map((id) => {
                        const student = students.find((s) => s.id === id);
                        if (!student) return null;
                        return (
                          <Pressable
                            key={id}
                            style={styles.memberChipUnassigned}
                            onPress={() => handleAssignStudent(id)}
                          >
                            <Text style={styles.memberChipUnassignedText}>
                              {getDisplayName(student)} +
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {tempGroups.length > 0 && (
                  <Text style={styles.hint}>Appui long sur un onglet pour supprimer un groupe</Text>
                )}
              </ScrollView>
            )}

            {/* Step: Criteria */}
            {step === 'criteria' && (
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                {/* Template button */}
                {tpTemplates.length > 0 && (
                  <Pressable
                    style={[styles.actionButton, styles.actionButtonSecondary, { marginBottom: theme.spacing.md }]}
                    onPress={() => setShowTemplateModal(true)}
                  >
                    <Text style={styles.actionButtonSecondaryText}>Charger un modèle TP</Text>
                  </Pressable>
                )}

                {/* Existing criteria */}
                {tempCriteria.map((crit) => (
                  <View key={crit.id} style={styles.criteriaRow}>
                    <View style={styles.criteriaInfo}>
                      <Text style={styles.criteriaLabel}>{crit.label}</Text>
                      <Text style={styles.criteriaMax}>/{crit.maxPoints}</Text>
                    </View>
                    <Pressable onPress={() => handleRemoveCriteria(crit.id)}>
                      <Text style={styles.criteriaRemove}>x</Text>
                    </Pressable>
                  </View>
                ))}

                {/* Add criteria form */}
                <View style={styles.addCriteriaForm}>
                  <TextInput
                    style={styles.criteriaInput}
                    placeholder="Nom du critère"
                    placeholderTextColor={theme.colors.textTertiary}
                    value={newCriteriaLabel}
                    onChangeText={setNewCriteriaLabel}
                  />
                  <TextInput
                    style={styles.criteriaMaxInput}
                    placeholder="Max"
                    placeholderTextColor={theme.colors.textTertiary}
                    value={newCriteriaMax}
                    onChangeText={setNewCriteriaMax}
                    keyboardType="numeric"
                  />
                  <Pressable
                    style={[styles.addCriteriaButton, !newCriteriaLabel.trim() && styles.addCriteriaButtonDisabled]}
                    onPress={handleAddCriteria}
                    disabled={!newCriteriaLabel.trim()}
                  >
                    <Text style={styles.addCriteriaButtonText}>+</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              {step === 'groups' ? (
                <>
                  <Pressable style={styles.cancelButton} onPress={onClose}>
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.nextButton, !canProceedToCriteria && styles.nextButtonDisabled]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setStep('criteria');
                    }}
                    disabled={!canProceedToCriteria}
                  >
                    <Text style={styles.nextButtonText}>Critères →</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => setStep('groups')}
                  >
                    <Text style={styles.cancelButtonText}>← Groupes</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.startButton, (!canStart || isCreating) && styles.startButtonDisabled]}
                    onPress={handleStart}
                    disabled={!canStart || isCreating}
                  >
                    {isCreating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.startButtonText}>Démarrer</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>

      {/* Random groups modal */}
      <Modal visible={showRandomModal} transparent animationType="fade">
        <View style={styles.subModalOverlay}>
          <View style={styles.subModalContent}>
            <Text style={styles.subModalTitle}>Groupes aléatoires</Text>
            <TextInput
              style={styles.subModalInput}
              placeholder="Élèves par groupe"
              placeholderTextColor={theme.colors.textTertiary}
              value={studentsPerGroup}
              onChangeText={setStudentsPerGroup}
              keyboardType="numeric"
            />
            <Text style={styles.subModalHint}>
              → {Math.ceil(students.length / (parseInt(studentsPerGroup) || 1))} groupes
            </Text>
            <View style={styles.subModalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setShowRandomModal(false)}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </Pressable>
              <Pressable style={styles.nextButton} onPress={handleCreateRandomGroups}>
                <Text style={styles.nextButtonText}>Créer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Template picker modal */}
      <Modal visible={showTemplateModal} transparent animationType="fade">
        <View style={styles.subModalOverlay}>
          <View style={styles.subModalContent}>
            <Text style={styles.subModalTitle}>Choisir un modèle</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {tpTemplates.map((tpl) => (
                <Pressable
                  key={tpl.id}
                  style={styles.templateRow}
                  onPress={() => handleApplyTemplate(tpl)}
                >
                  <Text style={styles.templateName}>{tpl.name}</Text>
                  <Text style={styles.templateDetail}>
                    {tpl.criteria.length} critères - {tpl.criteria.reduce((s, c) => s + c.maxPoints, 0)} pts
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={[styles.cancelButton, { marginTop: theme.spacing.md }]} onPress={() => setShowTemplateModal(false)}>
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  sheetWrapper: {
    maxHeight: '90%',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
  },
  handleZone: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  scrollArea: {
    maxHeight: 400,
    paddingHorizontal: theme.spacing.lg,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonSecondary: {
    backgroundColor: theme.colors.primarySoft,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Group tabs
  groupTabs: {
    marginBottom: theme.spacing.md,
  },
  groupTab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
  },
  groupTabActive: {
    backgroundColor: theme.colors.primary,
  },
  groupTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  groupTabTextActive: {
    color: '#fff',
  },

  // Members
  membersSection: {
    marginBottom: theme.spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  memberChipAssigned: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  memberChipAssignedText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  memberChipUnassigned: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  memberChipUnassignedText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  hint: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },

  // Criteria
  criteriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  criteriaInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.xs,
  },
  criteriaLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  criteriaMax: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  criteriaRemove: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.error,
    paddingHorizontal: theme.spacing.sm,
  },
  addCriteriaForm: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  criteriaInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 14,
    color: theme.colors.text,
  },
  criteriaMaxInput: {
    width: 60,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'center',
  },
  addCriteriaButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCriteriaButtonDisabled: {
    opacity: 0.4,
  },
  addCriteriaButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceHover,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  nextButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  startButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.participation,
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.4,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Sub-modals
  subModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  subModalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    width: '85%',
    maxHeight: '70%',
  },
  subModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  subModalInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subModalHint: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  subModalActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  templateRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.sm,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  templateDetail: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
