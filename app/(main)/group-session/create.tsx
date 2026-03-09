import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme } from '../../../constants/theme';
import { useAuthStore, useClassStore, useStudentStore, useGroupSessionStore, type StudentWithMapping } from '../../../stores';

type CreationStep = 'config' | 'groups' | 'criteria';

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

export default function CreateGroupSessionScreen() {
  const { user } = useAuthStore();
  const { classes, loadClasses } = useClassStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();
  const { createSession, addGroup, addCriteria, setGroupMembers, startSession } = useGroupSessionStore();

  // Current step
  const [step, setStep] = useState<CreationStep>('config');

  // Step 1: Config
  const [sessionName, setSessionName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Step 2: Groups
  const [tempGroups, setTempGroups] = useState<TempGroup[]>([]);
  const [unassignedStudentIds, setUnassignedStudentIds] = useState<string[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(0);

  // Step 3: Criteria
  const [tempCriteria, setTempCriteria] = useState<TempCriteria[]>([]);
  const [newCriteriaLabel, setNewCriteriaLabel] = useState('');
  const [newCriteriaPoints, setNewCriteriaPoints] = useState('');

  // Loading states
  const [isCreating, setIsCreating] = useState(false);

  // Get students for selected class
  const students = useMemo(() => {
    return selectedClassId ? (studentsByClass[selectedClassId] || []) : [];
  }, [selectedClassId, studentsByClass]);

  // Load classes on mount
  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
    }
  }, [user?.id, loadClasses]);

  // Load students when class is selected
  useEffect(() => {
    if (selectedClassId) {
      loadStudentsForClass(selectedClassId);
    }
  }, [selectedClassId, loadStudentsForClass]);

  // Initialize unassigned students when students load
  useEffect(() => {
    if (students.length > 0 && unassignedStudentIds.length === 0 && tempGroups.length === 0) {
      setUnassignedStudentIds(students.map((s: StudentWithMapping) => s.id));
    }
  }, [students]);

  const selectedClass = classes.find(c => c.id === selectedClassId);

  // Calculate total points
  const totalMaxPoints = tempCriteria.reduce((sum, c) => sum + c.maxPoints, 0);

  // Helper to generate unique ID
  const generateId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Step navigation
  const canProceedToGroups = sessionName.trim().length > 0 && selectedClassId !== null;
  const canProceedToCriteria = tempGroups.length > 0 && tempGroups.every(g => g.memberIds.length > 0);
  const canStart = tempCriteria.length > 0;

  const handleNextStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 'config' && canProceedToGroups) {
      setStep('groups');
    } else if (step === 'groups' && canProceedToCriteria) {
      setStep('criteria');
    }
  };

  const handlePreviousStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 'groups') {
      setStep('config');
    } else if (step === 'criteria') {
      setStep('groups');
    } else {
      router.back();
    }
  };

  // Group management
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const group = tempGroups[index];
    // Return members to unassigned
    setUnassignedStudentIds([...unassignedStudentIds, ...group.memberIds]);
    setTempGroups(tempGroups.filter((_, i) => i !== index));
    if (selectedGroupIndex >= tempGroups.length - 1) {
      setSelectedGroupIndex(Math.max(0, tempGroups.length - 2));
    }
  };

  const handleAssignStudent = (studentId: string) => {
    if (tempGroups.length === 0 || selectedGroupIndex >= tempGroups.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Remove from unassigned
    setUnassignedStudentIds(unassignedStudentIds.filter(id => id !== studentId));

    // Add to selected group
    const updatedGroups = [...tempGroups];
    updatedGroups[selectedGroupIndex].memberIds.push(studentId);
    setTempGroups(updatedGroups);
  };

  const handleUnassignStudent = (studentId: string, groupIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Remove from group
    const updatedGroups = [...tempGroups];
    updatedGroups[groupIndex].memberIds = updatedGroups[groupIndex].memberIds.filter(id => id !== studentId);
    setTempGroups(updatedGroups);

    // Add back to unassigned
    setUnassignedStudentIds([...unassignedStudentIds, studentId]);
  };

  const handleRenameGroup = (index: number, newName: string) => {
    const updatedGroups = [...tempGroups];
    updatedGroups[index].name = newName;
    setTempGroups(updatedGroups);
  };

  // Criteria management
  const handleAddCriteria = () => {
    if (!newCriteriaLabel.trim() || !newCriteriaPoints) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const points = parseFloat(newCriteriaPoints);
    if (isNaN(points) || points <= 0) {
      Alert.alert('Erreur', 'Les points doivent être un nombre positif');
      return;
    }

    const newCrit: TempCriteria = {
      id: generateId(),
      label: newCriteriaLabel.trim(),
      maxPoints: points,
    };
    setTempCriteria([...tempCriteria, newCrit]);
    setNewCriteriaLabel('');
    setNewCriteriaPoints('');
  };

  const handleRemoveCriteria = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTempCriteria(tempCriteria.filter((_, i) => i !== index));
  };

  // Start the session
  const handleStartSession = async () => {
    if (!user?.id || !selectedClassId) return;

    setIsCreating(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 1. Create the session
      await createSession(user.id, selectedClassId, sessionName.trim());

      // 2. Add all criteria
      for (let i = 0; i < tempCriteria.length; i++) {
        const crit = tempCriteria[i];
        await addCriteria(crit.label, crit.maxPoints);
      }

      // 3. Add all groups with members
      for (const group of tempGroups) {
        const sessionGroup = await addGroup(group.name);
        if (sessionGroup) {
          await setGroupMembers(sessionGroup.id, group.memberIds);
        }
      }

      // 4. Start the session
      await startSession();

      // 5. Navigate to grading screen
      const store = useGroupSessionStore.getState();
      if (store.activeSession?.session) {
        router.replace(`/(main)/group-session/${store.activeSession.session.id}/grade`);
      }
    } catch (error) {
      console.error('Error creating group session:', error);
      Alert.alert('Erreur', 'Impossible de créer la séance');
    } finally {
      setIsCreating(false);
    }
  };

  const getStudentById = (id: string): StudentWithMapping | undefined => {
    return students.find((s: StudentWithMapping) => s.id === id);
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      <View style={[styles.stepDot, step === 'config' && styles.stepDotActive]} />
      <View style={styles.stepLine} />
      <View style={[styles.stepDot, step === 'groups' && styles.stepDotActive]} />
      <View style={styles.stepLine} />
      <View style={[styles.stepDot, step === 'criteria' && styles.stepDotActive]} />
    </View>
  );

  const renderConfigStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Configuration</Text>
      <Text style={styles.stepSubtitle}>Nommez votre séance et choisissez la classe</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Nom de la séance</Text>
        <TextInput
          style={styles.textInput}
          value={sessionName}
          onChangeText={setSessionName}
          placeholder="Ex: Dissection sardine"
          placeholderTextColor={theme.colors.textTertiary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Classe</Text>
        <View style={styles.classGrid}>
          {classes.map(cls => (
            <Pressable
              key={cls.id}
              style={[
                styles.classCard,
                selectedClassId === cls.id && styles.classCardSelected,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedClassId(cls.id);
                // Reset groups when changing class
                setTempGroups([]);
                setUnassignedStudentIds([]);
              }}
            >
              <Text style={[
                styles.classCardText,
                selectedClassId === cls.id && styles.classCardTextSelected,
              ]}>
                {cls.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const renderGroupsStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Groupes</Text>
      <Text style={styles.stepSubtitle}>
        Créez des groupes et assignez les élèves
      </Text>

      {/* Groups tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupTabs}>
        {tempGroups.map((group, index) => (
          <Pressable
            key={group.id}
            style={[
              styles.groupTab,
              selectedGroupIndex === index && styles.groupTabSelected,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedGroupIndex(index);
            }}
            onLongPress={() => {
              // Alert.prompt is iOS only, so we just use the group name for now
              // TODO: Add a custom modal for renaming on Android
              if (Platform.OS === 'ios') {
                Alert.prompt(
                  'Renommer le groupe',
                  'Nouveau nom :',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'OK', onPress: (newName?: string) => newName && handleRenameGroup(index, newName) },
                  ],
                  'plain-text',
                  group.name
                );
              }
            }}
          >
            <Text style={[
              styles.groupTabText,
              selectedGroupIndex === index && styles.groupTabTextSelected,
            ]}>
              {group.name} ({group.memberIds.length})
            </Text>
            <Pressable
              style={styles.removeGroupButton}
              onPress={() => handleRemoveGroup(index)}
            >
              <Text style={styles.removeGroupButtonText}>×</Text>
            </Pressable>
          </Pressable>
        ))}
        <Pressable style={styles.addGroupButton} onPress={handleAddGroup}>
          <Text style={styles.addGroupButtonText}>+ Groupe</Text>
        </Pressable>
      </ScrollView>

      {/* Two columns: unassigned + selected group */}
      <View style={styles.assignmentContainer}>
        {/* Unassigned students */}
        <View style={styles.assignmentColumn}>
          <Text style={styles.columnTitle}>
            Non assignés ({unassignedStudentIds.length})
          </Text>
          <ScrollView style={styles.studentList}>
            {unassignedStudentIds.map(studentId => {
              const student = getStudentById(studentId);
              if (!student) return null;
              return (
                <Pressable
                  key={studentId}
                  style={styles.studentChip}
                  onPress={() => handleAssignStudent(studentId)}
                >
                  <Text style={styles.studentChipText}>
                    {student.firstName || student.pseudo} {student.lastName ? `${student.lastName.substring(0, 2)}.` : ''}
                  </Text>
                  <Text style={styles.studentChipArrow}>→</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Selected group members */}
        <View style={styles.assignmentColumn}>
          <Text style={styles.columnTitle}>
            {tempGroups[selectedGroupIndex]?.name || 'Aucun groupe'}
          </Text>
          <ScrollView style={styles.studentList}>
            {tempGroups[selectedGroupIndex]?.memberIds.map(studentId => {
              const student = getStudentById(studentId);
              if (!student) return null;
              return (
                <Pressable
                  key={studentId}
                  style={[styles.studentChip, styles.studentChipAssigned]}
                  onPress={() => handleUnassignStudent(studentId, selectedGroupIndex)}
                >
                  <Text style={styles.studentChipArrowLeft}>←</Text>
                  <Text style={styles.studentChipText}>
                    {student.firstName || student.pseudo} {student.lastName ? `${student.lastName.substring(0, 2)}.` : ''}
                  </Text>
                </Pressable>
              );
            })}
            {tempGroups.length === 0 && (
              <Text style={styles.emptyText}>
                Créez un groupe avec le bouton "+ Groupe"
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );

  const renderCriteriaStep = () => (
    <KeyboardAvoidingView
      style={styles.stepContent}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.stepTitle}>Critères</Text>
      <Text style={styles.stepSubtitle}>
        Définissez les critères de notation
      </Text>

      {/* Add criteria form */}
      <View style={styles.addCriteriaForm}>
        <TextInput
          style={[styles.textInput, styles.criteriaLabelInput]}
          value={newCriteriaLabel}
          onChangeText={setNewCriteriaLabel}
          placeholder="Nom du critère"
          placeholderTextColor={theme.colors.textTertiary}
        />
        <TextInput
          style={[styles.textInput, styles.criteriaPointsInput]}
          value={newCriteriaPoints}
          onChangeText={setNewCriteriaPoints}
          placeholder="Pts"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="numeric"
        />
        <Pressable
          style={[
            styles.addCriteriaButton,
            (!newCriteriaLabel.trim() || !newCriteriaPoints) && styles.addCriteriaButtonDisabled,
          ]}
          onPress={handleAddCriteria}
          disabled={!newCriteriaLabel.trim() || !newCriteriaPoints}
        >
          <Text style={styles.addCriteriaButtonText}>+</Text>
        </Pressable>
      </View>

      {/* Criteria list */}
      <ScrollView style={styles.criteriaList}>
        {tempCriteria.map((crit, index) => (
          <View key={crit.id} style={styles.criteriaItem}>
            <View style={styles.criteriaInfo}>
              <Text style={styles.criteriaLabel}>{crit.label}</Text>
              <Text style={styles.criteriaPoints}>{crit.maxPoints} pts</Text>
            </View>
            <Pressable
              style={styles.removeCriteriaButton}
              onPress={() => handleRemoveCriteria(index)}
            >
              <Text style={styles.removeCriteriaButtonText}>×</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Total */}
      {tempCriteria.length > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total maximum</Text>
          <Text style={styles.totalPoints}>{totalMaxPoints} pts</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handlePreviousStep}>
          <Text style={styles.backButtonText}>
            {step === 'config' ? '✕' : '←'}
          </Text>
        </Pressable>
        <Text style={styles.headerTitle}>Nouvelle séance</Text>
        <View style={styles.headerSpacer} />
      </View>

      {renderStepIndicator()}

      {/* Step content */}
      {step === 'config' && renderConfigStep()}
      {step === 'groups' && renderGroupsStep()}
      {step === 'criteria' && renderCriteriaStep()}

      {/* Footer */}
      <View style={styles.footer}>
        {step === 'config' && (
          <Pressable
            style={[styles.nextButton, !canProceedToGroups && styles.nextButtonDisabled]}
            onPress={handleNextStep}
            disabled={!canProceedToGroups}
          >
            <Text style={styles.nextButtonText}>Suivant</Text>
          </Pressable>
        )}
        {step === 'groups' && (
          <Pressable
            style={[styles.nextButton, !canProceedToCriteria && styles.nextButtonDisabled]}
            onPress={handleNextStep}
            disabled={!canProceedToCriteria}
          >
            <Text style={styles.nextButtonText}>Suivant</Text>
          </Pressable>
        )}
        {step === 'criteria' && (
          <Pressable
            style={[styles.startButton, !canStart && styles.startButtonDisabled]}
            onPress={handleStartSession}
            disabled={!canStart || isCreating}
          >
            <Text style={styles.startButtonText}>
              {isCreating ? 'Création...' : 'Démarrer la notation'}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: theme.colors.text,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.border,
  },
  stepDotActive: {
    backgroundColor: theme.colors.primary,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.xs,
  },

  // Step content
  stepContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  stepSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },

  // Input
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  // Class grid
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  classCard: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  classCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  classCardText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  classCardTextSelected: {
    color: theme.colors.primary,
  },

  // Group tabs
  groupTabs: {
    flexGrow: 0,
    marginBottom: theme.spacing.md,
  },
  groupTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginRight: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  groupTabSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  groupTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  groupTabTextSelected: {
    color: theme.colors.primary,
  },
  removeGroupButton: {
    marginLeft: theme.spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.errorSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeGroupButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.error,
  },
  addGroupButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
  },
  addGroupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Assignment columns
  assignmentContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  assignmentColumn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  studentList: {
    flex: 1,
  },
  studentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.xs,
  },
  studentChipAssigned: {
    backgroundColor: theme.colors.primarySoft,
  },
  studentChipText: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  studentChipArrow: {
    fontSize: 14,
    color: theme.colors.primary,
    marginLeft: theme.spacing.xs,
  },
  studentChipArrowLeft: {
    fontSize: 14,
    color: theme.colors.primary,
    marginRight: theme.spacing.xs,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },

  // Add criteria form
  addCriteriaForm: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  criteriaLabelInput: {
    flex: 1,
  },
  criteriaPointsInput: {
    width: 70,
    textAlign: 'center',
  },
  addCriteriaButton: {
    width: 50,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCriteriaButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  addCriteriaButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },

  // Criteria list
  criteriaList: {
    flex: 1,
  },
  criteriaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  criteriaInfo: {
    flex: 1,
  },
  criteriaLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  criteriaPoints: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  removeCriteriaButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.errorSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeCriteriaButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.error,
  },

  // Total row
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  totalPoints: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.primary,
  },

  // Footer
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  nextButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
  startButton: {
    backgroundColor: theme.colors.success,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
});
