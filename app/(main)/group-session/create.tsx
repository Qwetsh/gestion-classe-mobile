import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme } from '../../../constants/theme';
import { useAuthStore, useClassStore, useStudentStore, useGroupSessionStore, type StudentWithMapping } from '../../../stores';
import { type TpTemplateWithCriteria, getActiveGroupSession, getGroupSessionsByClassId, getGroupsBySessionId, getGroupMemberIds } from '../../../services/database';
import { supabase } from '../../../services/supabase/client';

const HOUSE_NAMES: Record<string, string> = {
  gryffondor: 'Gryffondor',
  serpentard: 'Serpentard',
  serdaigle: 'Serdaigle',
  poufsouffle: 'Poufsouffle',
};
const HOUSE_IDS = ['gryffondor', 'serpentard', 'serdaigle', 'poufsouffle'] as const;

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
  const { createSession, addGroup, addCriteria, setGroupMembers, startSession, loadTpTemplates, copyGroupsFromPreviousSession, createRandomGroups, clearActiveSession } = useGroupSessionStore();

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

  // TP Templates
  const [tpTemplates, setTpTemplates] = useState<TpTemplateWithCriteria[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Random groups modal
  const [showRandomModal, setShowRandomModal] = useState(false);
  const [studentsPerGroup, setStudentsPerGroup] = useState('3');

  // Previous groups modal
  const [showPreviousGroupsModal, setShowPreviousGroupsModal] = useState(false);
  const [previousGroupsData, setPreviousGroupsData] = useState<{
    sessionName: string;
    groups: { name: string; memberIds: string[] }[];
  } | null>(null);

  // Academy mode
  const [academyMode, setAcademyMode] = useState(false);
  const [academyCoefficient, setAcademyCoefficient] = useState('1');

  // Loading states
  const [isCreating, setIsCreating] = useState(false);
  const [isCheckingActive, setIsCheckingActive] = useState(true);

  // Check for active/draft session on mount AND on focus (back navigation)
  useFocusEffect(
    useCallback(() => {
      const checkActiveSession = async () => {
        if (!user?.id) {
          setIsCheckingActive(false);
          return;
        }

        try {
          const existingSession = await getActiveGroupSession(user.id);
          if (existingSession) {
            if (existingSession.status === 'active') {
              // Resume active grading session
              router.replace(`/(main)/group-session/${existingSession.id}/grade`);
              return;
            }
            if (existingSession.status === 'draft') {
              // Clean up orphan draft sessions (leftover from incomplete creation)
              const { deleteGroupSession } = await import('../../../services/database');
              await deleteGroupSession(existingSession.id);
            }
          }
        } catch (error) {
          console.error('[CreateGroupSession] Error checking active session:', error);
        }
        setIsCheckingActive(false);
      };

      checkActiveSession();
    }, [user?.id])
  );

  // Get students for selected class
  const students = useMemo(() => {
    return selectedClassId ? (studentsByClass[selectedClassId] || []) : [];
  }, [selectedClassId, studentsByClass]);

  // Load classes and templates on mount
  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
      loadTpTemplates(user.id)
        .then(templates => setTpTemplates(templates))
        .catch(err => {
          console.error('[CreateGroupSession] Failed to load templates:', err);
          setTpTemplates([]);
        });
    }
  }, [user?.id, loadClasses, loadTpTemplates]);

  // Load students when class is selected
  useEffect(() => {
    if (selectedClassId) {
      loadStudentsForClass(selectedClassId);
    }
  }, [selectedClassId, loadStudentsForClass]);

  // Check for academy mode + previous sessions when class is selected
  useEffect(() => {
    const checkClassSetup = async () => {
      if (!selectedClassId) {
        setPreviousGroupsData(null);
        setAcademyMode(false);
        return;
      }

      // Wait until students are loaded before checking academy assignments
      if (students.length === 0) {
        return;
      }

      // Check academy config
      try {
        if (supabase) {
          const { data: config } = await supabase
            .from('academy_config')
            .select('enabled')
            .eq('class_id', selectedClassId)
            .maybeSingle();

          if (config?.enabled) {
            // Fetch assignments
            const { data: assignments } = await supabase
              .from('academy_assignments')
              .select('student_id, house')
              .eq('class_id', selectedClassId);

            if (assignments && assignments.length > 0) {
              const assignmentMap = new Map(assignments.map(a => [a.student_id, a.house]));

              // Auto-create 4 house groups
              const currentStudentIds = new Set(students.map((s: StudentWithMapping) => s.id));
              const autoGroups: TempGroup[] = HOUSE_IDS.map(houseId => ({
                id: generateId(),
                name: HOUSE_NAMES[houseId],
                memberIds: assignments
                  .filter(a => a.house === houseId && currentStudentIds.has(a.student_id))
                  .map(a => a.student_id),
              }));

              const assignedIds = new Set(assignments.map(a => a.student_id));
              const unassigned = students
                .filter((s: StudentWithMapping) => !assignedIds.has(s.id))
                .map((s: StudentWithMapping) => s.id);

              setTempGroups(autoGroups);
              setUnassignedStudentIds(unassigned);
              setAcademyMode(true);
              setAcademyCoefficient('1');
              setSelectedGroupIndex(0);
              return; // Skip previous groups check in academy mode
            }
          }
        }
        setAcademyMode(false);
      } catch (error) {
        console.error('[CreateGroupSession] Academy check error:', error);
        setAcademyMode(false);
      }

      // Check previous sessions (non-academy)
      try {
        const sessions = await getGroupSessionsByClassId(selectedClassId);
        const completedSession = sessions
          .filter(s => s.status === 'completed')
          .sort((a, b) => {
            const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
            const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
            return dateB - dateA;
          })[0];

        if (completedSession) {
          const groups = await getGroupsBySessionId(completedSession.id);
          if (groups.length > 0) {
            const groupsWithMembers = await Promise.all(
              groups.map(async (g) => ({
                name: g.name,
                memberIds: await getGroupMemberIds(g.id),
              }))
            );
            setPreviousGroupsData({
              sessionName: completedSession.name,
              groups: groupsWithMembers,
            });
            // Show modal to propose copying groups
            setShowPreviousGroupsModal(true);
          }
        }
      } catch (error) {
        console.error('[CreateGroupSession] Error checking previous sessions:', error);
      }
    };

    checkClassSetup();
  }, [selectedClassId, students]);

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

  // Handle TP template selection
  const handleSelectTemplate = (templateId: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTemplateId(templateId);

    if (templateId) {
      // Apply template criteria (deduplicate by label in case of sync issues)
      const template = tpTemplates.find(t => t.id === templateId);
      if (template) {
        const seenLabels = new Set<string>();
        const criteriaFromTemplate = template.criteria
          .filter(c => {
            if (seenLabels.has(c.label)) return false;
            seenLabels.add(c.label);
            return true;
          })
          .map(c => ({
            id: generateId(),
            label: c.label,
            maxPoints: c.maxPoints,
          }));
        setTempCriteria(criteriaFromTemplate);
      }
    } else {
      // Reset to empty (custom TP)
      setTempCriteria([]);
    }
  };

  // Copy groups from previous session
  const handleCopyPreviousGroups = () => {
    if (!previousGroupsData) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Filter out students that don't exist anymore (removed from class)
    const currentStudentIds = new Set(students.map((s: StudentWithMapping) => s.id));

    const newGroups: TempGroup[] = previousGroupsData.groups.map((g, index) => ({
      id: generateId(),
      name: g.name,
      memberIds: g.memberIds.filter(id => currentStudentIds.has(id)),
    }));

    // Find students that were in groups but no longer exist
    const assignedStudentIds = new Set(newGroups.flatMap(g => g.memberIds));
    const unassigned = students
      .filter((s: StudentWithMapping) => !assignedStudentIds.has(s.id))
      .map((s: StudentWithMapping) => s.id);

    setTempGroups(newGroups);
    setUnassignedStudentIds(unassigned);
    setShowPreviousGroupsModal(false);
    setSelectedGroupIndex(0);
  };

  // Decline copying previous groups
  const handleDeclinePreviousGroups = () => {
    setShowPreviousGroupsModal(false);
  };

  // Handle random groups
  const handleCreateRandomGroups = () => {
    const perGroup = parseInt(studentsPerGroup);
    if (isNaN(perGroup) || perGroup < 1) {
      Alert.alert('Erreur', 'Nombre d\'élèves invalide');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Shuffle all students
    const shuffled = [...students.map((s: StudentWithMapping) => s.id)].sort(() => Math.random() - 0.5);

    // Create groups
    const numGroups = Math.ceil(shuffled.length / perGroup);
    const newGroups: TempGroup[] = [];

    for (let i = 0; i < numGroups; i++) {
      const startIdx = i * perGroup;
      const endIdx = Math.min(startIdx + perGroup, shuffled.length);
      const memberIds = shuffled.slice(startIdx, endIdx);

      newGroups.push({
        id: generateId(),
        name: `Groupe ${i + 1}`,
        memberIds,
      });
    }

    setTempGroups(newGroups);
    setUnassignedStudentIds([]);
    setShowRandomModal(false);
    setSelectedGroupIndex(0);
  };

  // Start the session
  const handleStartSession = async () => {
    if (!user?.id || !selectedClassId) return;

    setIsCreating(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 0. Clear any previous session state
      clearActiveSession();

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

      // 5. Save academy coefficient if in academy mode
      const store = useGroupSessionStore.getState();
      if (academyMode && store.activeSession?.session && supabase) {
        const coeff = parseFloat(academyCoefficient) || 1;
        await supabase
          .from('academy_session_coefficients')
          .upsert({
            group_session_id: store.activeSession.session.id,
            coefficient: coeff,
          });
      }

      // 6. Navigate to grading screen
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
      <Text style={styles.stepTitle}>
        {academyMode ? 'Maisons' : 'Groupes'}
      </Text>
      <Text style={styles.stepSubtitle}>
        {academyMode
          ? 'Les maisons sont pré-assignées par le Choixpeau'
          : 'Créez des groupes et assignez les élèves'}
      </Text>

      {/* Academy coefficient */}
      {academyMode && (
        <View style={styles.coefficientRow}>
          <Text style={styles.coefficientLabel}>Coefficient Académie</Text>
          <TextInput
            style={styles.coefficientInput}
            value={academyCoefficient}
            onChangeText={setAcademyCoefficient}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={styles.coefficientHint}>
            Points = note x coeff
          </Text>
        </View>
      )}

      {/* Quick actions — hidden in academy mode */}
      {!academyMode && (
        <View style={styles.quickActions}>
          <Pressable
            style={styles.quickActionButton}
            onPress={() => setShowRandomModal(true)}
          >
            <Text style={styles.quickActionIcon}>🎲</Text>
            <Text style={styles.quickActionText}>Aléatoire</Text>
          </Pressable>
        </View>
      )}

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
              if (academyMode) return; // No renaming in academy mode
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
            {/* Hide remove button in academy mode */}
            {!academyMode && (
              <Pressable
                style={styles.removeGroupButton}
                onPress={() => handleRemoveGroup(index)}
              >
                <Text style={styles.removeGroupButtonText}>×</Text>
              </Pressable>
            )}
          </Pressable>
        ))}
        {/* Hide add group button in academy mode */}
        {!academyMode && (
          <Pressable style={styles.addGroupButton} onPress={handleAddGroup}>
            <Text style={styles.addGroupButtonText}>+ Groupe</Text>
          </Pressable>
        )}
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
        Choisissez un TP ou créez vos critères
      </Text>

      {/* TP Template selector */}
      {tpTemplates.length > 0 && (
        <View style={styles.templateSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Pressable
              style={[
                styles.templateChip,
                selectedTemplateId === null && styles.templateChipSelected,
              ]}
              onPress={() => handleSelectTemplate(null)}
            >
              <Text style={[
                styles.templateChipText,
                selectedTemplateId === null && styles.templateChipTextSelected,
              ]}>
                TP personnalisé
              </Text>
            </Pressable>
            {tpTemplates.map(template => (
              <Pressable
                key={template.id}
                style={[
                  styles.templateChip,
                  selectedTemplateId === template.id && styles.templateChipSelected,
                ]}
                onPress={() => handleSelectTemplate(template.id)}
              >
                <Text style={[
                  styles.templateChipText,
                  selectedTemplateId === template.id && styles.templateChipTextSelected,
                ]}>
                  {template.name}
                </Text>
                <Text style={styles.templateChipPoints}>{template.totalPoints} pts</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

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

  // Show loading while checking for active session
  if (isCheckingActive) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

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

      {/* Random groups modal */}
      {showRandomModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Groupes aléatoires</Text>
            <Text style={styles.modalSubtitle}>
              {students.length} élèves à répartir
            </Text>

            <View style={styles.modalInputRow}>
              <Text style={styles.modalLabel}>Élèves par groupe :</Text>
              <TextInput
                style={styles.modalInput}
                value={studentsPerGroup}
                onChangeText={setStudentsPerGroup}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>

            <Text style={styles.modalInfo}>
              → {Math.ceil(students.length / (parseInt(studentsPerGroup) || 1))} groupes
            </Text>

            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setShowRandomModal(false)}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleCreateRandomGroups}
              >
                <Text style={styles.modalConfirmText}>Créer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Previous groups modal */}
      {showPreviousGroupsModal && previousGroupsData && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reprendre les groupes ?</Text>
            <Text style={styles.modalSubtitle}>
              Des groupes existent de la séance "{previousGroupsData.sessionName}"
            </Text>

            <View style={styles.previousGroupsList}>
              {previousGroupsData.groups.map((g, index) => (
                <View key={index} style={styles.previousGroupItem}>
                  <Text style={styles.previousGroupName}>{g.name}</Text>
                  <Text style={styles.previousGroupCount}>{g.memberIds.length} élèves</Text>
                </View>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={handleDeclinePreviousGroups}
              >
                <Text style={styles.modalCancelText}>Non, créer</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleCopyPreviousGroups}
              >
                <Text style={styles.modalConfirmText}>Oui, reprendre</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
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

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  quickActionIcon: {
    fontSize: 16,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },

  // Academy coefficient
  coefficientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  coefficientLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  coefficientInput: {
    width: 60,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  coefficientHint: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    flex: 1,
  },

  // Template selector
  templateSelector: {
    marginBottom: theme.spacing.md,
  },
  templateChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginRight: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  templateChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  templateChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  templateChipTextSelected: {
    color: theme.colors.primary,
  },
  templateChipPoints: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // Modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  modalLabel: {
    fontSize: 14,
    color: theme.colors.text,
  },
  modalInput: {
    width: 60,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalInfo: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },

  // Previous groups modal
  previousGroupsList: {
    marginBottom: theme.spacing.lg,
  },
  previousGroupItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.xs,
  },
  previousGroupName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  previousGroupCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});
