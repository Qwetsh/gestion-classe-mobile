import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useAuthStore, useClassStore, useStudentStore, useRoomStore, useGroupStore, useHistoryStore, GROUP_COLORS, StudentWithMapping } from '../../../stores';
import { theme } from '../../../constants/theme';
import { Class, EventType } from '../../../types';
import { Room, getClassDeleteStats, deleteClassCompletely, StudentGroup, getClassStudentEventCounts, getSessionsByClassId } from '../../../services/database';
import { exportClassPdf } from '../../../services/pdfExport';

export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const {
    classes,
    isLoading: classLoading,
    error: classError,
    updateClassName,
    removeClass,
    clearError: clearClassError,
  } = useClassStore();
  const {
    studentsByClass,
    isLoading: studentsLoading,
    error: studentsError,
    lastImportResult,
    loadStudentsForClass,
    addStudent,
    removeStudent,
    importFromExcel,
    clearError: clearStudentsError,
    clearImportResult,
  } = useStudentStore();
  const {
    rooms,
    loadRooms,
  } = useRoomStore();
  const {
    groups,
    loadGroups,
    addGroup,
    editGroup,
    removeGroup,
    setStudentGroup,
  } = useGroupStore();

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Add student modal state
  const [addStudentModalVisible, setAddStudentModalVisible] = useState(false);
  const [newStudentFirstName, setNewStudentFirstName] = useState('');
  const [newStudentLastName, setNewStudentLastName] = useState('');
  const [isAddingStudent, setIsAddingStudent] = useState(false);

  // Group modal state
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StudentGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState<string>(GROUP_COLORS[0]);
  const [assignGroupModalVisible, setAssignGroupModalVisible] = useState(false);
  const [selectedStudentForGroup, setSelectedStudentForGroup] = useState<StudentWithMapping | null>(null);

  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStats, setDeleteStats] = useState<{
    studentsCount: number;
    sessionsCount: number;
    eventsCount: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // PDF export state
  const [isExporting, setIsExporting] = useState(false);

  const students = id ? studentsByClass[id] || [] : [];

  // Find the class in the store
  useEffect(() => {
    const found = classes.find((c) => c.id === id);
    setCurrentClass(found || null);
  }, [id, classes]);

  // Load students when class is found
  useEffect(() => {
    if (id) {
      loadStudentsForClass(id);
    }
  }, [id]);

  // Load rooms
  useEffect(() => {
    if (user?.id) {
      loadRooms(user.id);
    }
  }, [user?.id]);

  // Load groups for this class
  useEffect(() => {
    if (id) {
      loadGroups(id);
    }
  }, [id]);

  // Show import result
  useEffect(() => {
    if (lastImportResult) {
      if (lastImportResult.success) {
        Alert.alert(
          'Import reussi',
          `${lastImportResult.studentsImported} eleve(s) importe(s)`,
          [{ text: 'OK', onPress: clearImportResult }]
        );
      } else if (lastImportResult.errors.length > 0) {
        Alert.alert(
          'Erreur d\'import',
          lastImportResult.errors.join('\n'),
          [{ text: 'OK', onPress: clearImportResult }]
        );
      }
    }
  }, [lastImportResult]);

  const handleBack = () => {
    router.back();
  };

  const handleOpenEditModal = () => {
    if (currentClass) {
      clearClassError();
      setEditName(currentClass.name);
      setEditModalVisible(true);
    }
  };

  const handleCloseEditModal = () => {
    clearClassError();
    setEditModalVisible(false);
  };

  const handleUpdateName = async () => {
    if (!id || !editName.trim()) return;

    setIsUpdating(true);
    const success = await updateClassName(id, editName);
    setIsUpdating(false);

    if (success) {
      setEditModalVisible(false);
    }
  };

  const handleDeletePress = async () => {
    if (!id) return;
    const stats = await getClassDeleteStats(id);
    setDeleteStats(stats);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    const result = await deleteClassCompletely(id);
    setIsDeleting(false);
    setDeleteModalVisible(false);

    if (result.success) {
      // Refresh class list
      if (user?.id) {
        await useClassStore.getState().loadClasses(user.id);
      }
      router.back();
    } else {
      Alert.alert('Erreur', result.error || 'La suppression a echoue');
    }
  };

  const handleImportExcel = async () => {
    if (!user?.id || !id) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      console.log('[Import] Selected file:', file.name);

      setIsImporting(true);
      await importFromExcel(file.uri, user.id, id);
      setIsImporting(false);
    } catch (err) {
      console.error('[Import] Document picker error:', err);
      setIsImporting(false);
      Alert.alert('Erreur', 'Impossible de selectionner le fichier');
    }
  };

  const handleOpenAddStudentModal = () => {
    clearStudentsError();
    setNewStudentFirstName('');
    setNewStudentLastName('');
    setAddStudentModalVisible(true);
  };

  const handleCloseAddStudentModal = () => {
    clearStudentsError();
    setAddStudentModalVisible(false);
  };

  const handleAddStudent = async () => {
    if (!user?.id || !id) return;
    if (!newStudentFirstName.trim() || !newStudentLastName.trim()) {
      return;
    }

    setIsAddingStudent(true);
    const result = await addStudent(user.id, id, newStudentFirstName, newStudentLastName);
    setIsAddingStudent(false);

    if (result) {
      setNewStudentFirstName('');
      setNewStudentLastName('');
      setAddStudentModalVisible(false);
    }
  };

  const handleRemoveStudent = (student: StudentWithMapping) => {
    if (!id) return;

    Alert.alert(
      'Retirer l\'eleve',
      `Voulez-vous vraiment retirer "${student.fullName || student.pseudo}" de cette classe ?\n\nLes donnees historiques seront conservees.`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => removeStudent(student.id, id),
        },
      ]
    );
  };

  const handleStudentPress = (student: StudentWithMapping) => {
    router.push(`/(main)/students/${student.id}/history`);
  };

  // Group handlers
  const handleOpenGroupModal = (group?: StudentGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupName(group.name);
      setGroupColor(group.color);
    } else {
      setEditingGroup(null);
      setGroupName('');
      // Find next available color
      const usedColors = new Set(groups.map(g => g.color));
      const nextColor = GROUP_COLORS.find(c => !usedColors.has(c)) || GROUP_COLORS[0];
      setGroupColor(nextColor);
    }
    setGroupModalVisible(true);
  };

  const handleSaveGroup = async () => {
    if (!user?.id || !id || !groupName.trim()) return;

    if (editingGroup) {
      await editGroup(editingGroup.id, groupName, groupColor);
    } else {
      await addGroup(id, user.id, groupName, groupColor);
    }
    setGroupModalVisible(false);
  };

  const handleDeleteGroup = (group: StudentGroup) => {
    Alert.alert(
      'Supprimer le groupe',
      `Voulez-vous supprimer le groupe "${group.name}" ?\n\nLes eleves seront retires du groupe mais pas supprimes.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => removeGroup(group.id),
        },
      ]
    );
  };

  const handleOpenAssignGroup = (student: StudentWithMapping) => {
    setSelectedStudentForGroup(student);
    setAssignGroupModalVisible(true);
  };

  const handleAssignGroup = async (groupId: string | null) => {
    if (!selectedStudentForGroup) return;
    await setStudentGroup(selectedStudentForGroup.id, groupId);
    // Reload students to reflect the change
    if (id && user?.id) {
      await loadStudentsForClass(id);
    }
    setAssignGroupModalVisible(false);
    setSelectedStudentForGroup(null);
  };

  const getStudentGroup = (student: StudentWithMapping): StudentGroup | undefined => {
    return groups.find(g => g.id === student.groupId);
  };

  // Handle PDF export
  const handleExportPdf = useCallback(async () => {
    if (!currentClass || isExporting) return;

    setIsExporting(true);
    try {
      // Get event counts for all students
      const eventCounts = await getClassStudentEventCounts(currentClass.id);

      // Get session count
      const sessions = await getSessionsByClassId(currentClass.id);

      // Build student data with counts
      const studentData = students.map((student) => ({
        id: student.id,
        name: student.fullName || student.pseudo,
        pseudo: student.pseudo,
        counts: eventCounts[student.id] || {
          participation: 0,
          bavardage: 0,
          absence: 0,
          remarque: 0,
          sortie: 0,
          retour: 0,
        },
      }));

      // Calculate date range from sessions
      let dateRange: { from: string; to: string } | undefined;
      if (sessions.length > 0) {
        const sortedSessions = sessions.sort(
          (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        );
        dateRange = {
          from: sortedSessions[0].started_at,
          to: sortedSessions[sortedSessions.length - 1].started_at,
        };
      }

      await exportClassPdf({
        className: currentClass.name,
        students: studentData,
        totalSessions: sessions.length,
        dateRange,
      });
    } catch (err) {
      console.error('PDF export error:', err);
      Alert.alert('Erreur', 'Impossible d\'exporter le PDF');
    } finally {
      setIsExporting(false);
    }
  }, [currentClass, students, isExporting]);

  const renderStudentItem = ({ item }: { item: StudentWithMapping }) => {
    const studentGroup = getStudentGroup(item);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.studentItem,
          pressed && styles.studentItemPressed,
        ]}
        onPress={() => handleStudentPress(item)}
        onLongPress={() => handleRemoveStudent(item)}
        delayLongPress={500}
      >
        {studentGroup && (
          <View style={[styles.groupColorIndicator, { backgroundColor: studentGroup.color }]} />
        )}
        <View style={styles.studentAvatar}>
          <Text style={styles.studentInitial}>
            {item.firstName?.charAt(0) || item.pseudo.charAt(0)}
          </Text>
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>
            {item.fullName || item.pseudo}
          </Text>
          <Text style={styles.studentPseudo}>{item.pseudo}</Text>
        </View>
        <Pressable
          style={styles.assignGroupButton}
          onPress={() => handleOpenAssignGroup(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.assignGroupButtonText}>
            {studentGroup ? studentGroup.name : '+ Groupe'}
          </Text>
        </Pressable>
        <Text style={styles.studentChevron}>›</Text>
      </Pressable>
    );
  };

  if (!currentClass) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backText}>‹ Retour</Text>
          </Pressable>
        </View>
        <View style={styles.centerContent}>
          {classLoading ? (
            <ActivityIndicator size="large" color={theme.colors.participation} />
          ) : (
            <Text style={styles.errorText}>Classe non trouvee</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>‹ Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{currentClass.name}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.exportButton,
            pressed && styles.exportButtonPressed,
            isExporting && styles.exportButtonDisabled,
          ]}
          onPress={handleExportPdf}
          disabled={isExporting || students.length === 0}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Text style={styles.exportButtonText}>PDF</Text>
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Class Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nom</Text>
            <Pressable onPress={handleOpenEditModal}>
              <Text style={styles.infoValue}>
                {currentClass.name}
                <Text style={styles.editIcon}> ✎</Text>
              </Text>
            </Pressable>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Creee le</Text>
            <Text style={styles.infoValue}>
              {new Date(currentClass.createdAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Eleves</Text>
            <Text style={styles.infoValue}>{students.length}</Text>
          </View>
        </View>

        {/* Students Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Eleves</Text>
            <View style={styles.sectionActions}>
              <Pressable
                style={styles.addStudentButton}
                onPress={handleOpenAddStudentModal}
              >
                <Text style={styles.addStudentButtonText}>+ Ajouter</Text>
              </Pressable>
              <Pressable
                style={[styles.importButton, isImporting && styles.buttonDisabled]}
                onPress={handleImportExcel}
                disabled={isImporting}
              >
                {isImporting ? (
                  <ActivityIndicator color={theme.colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.importButtonText}>Importer</Text>
                )}
              </Pressable>
            </View>
          </View>

          {studentsLoading && students.length === 0 ? (
            <View style={styles.loadingSection}>
              <ActivityIndicator color={theme.colors.participation} />
            </View>
          ) : students.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionEmoji}>👥</Text>
              <Text style={styles.emptySectionText}>
                Aucun eleve dans cette classe
              </Text>
              <Text style={styles.emptySectionHint}>
                Importez des eleves depuis un fichier Excel (.xlsx)
              </Text>
            </View>
          ) : (
            <View style={styles.studentsList}>
              {students.map((student) => (
                <View key={student.id}>
                  {renderStudentItem({ item: student })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Groups Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Groupes / Ilots</Text>
            <Pressable
              style={styles.addGroupButton}
              onPress={() => handleOpenGroupModal()}
            >
              <Text style={styles.addGroupButtonText}>+ Nouveau</Text>
            </Pressable>
          </View>

          {groups.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionEmoji}>👥</Text>
              <Text style={styles.emptySectionText}>
                Aucun groupe cree
              </Text>
              <Text style={styles.emptySectionHint}>
                Creez des groupes pour organiser vos eleves en ilots
              </Text>
            </View>
          ) : (
            <View style={styles.groupsList}>
              {groups.map((group) => {
                const memberCount = students.filter(s => s.groupId === group.id).length;
                return (
                  <Pressable
                    key={group.id}
                    style={styles.groupItem}
                    onPress={() => handleOpenGroupModal(group)}
                    onLongPress={() => handleDeleteGroup(group)}
                    delayLongPress={500}
                  >
                    <View style={[styles.groupColorDot, { backgroundColor: group.color }]} />
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupMemberCount}>
                      {memberCount} eleve{memberCount !== 1 ? 's' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Plan de classe Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Plan de classe</Text>
          </View>

          {rooms.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionEmoji}>🏫</Text>
              <Text style={styles.emptySectionText}>
                Aucune salle configuree
              </Text>
              <Pressable
                style={styles.createRoomLink}
                onPress={() => router.push('/(main)/rooms')}
              >
                <Text style={styles.createRoomLinkText}>Creer une salle</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.roomsList}>
              {rooms.map((room) => (
                <Pressable
                  key={room.id}
                  style={({ pressed }) => [
                    styles.roomItem,
                    pressed && styles.roomItemPressed,
                  ]}
                  onPress={() => router.push(`/(main)/plan/${id}/${room.id}`)}
                >
                  <View style={styles.roomInfo}>
                    <Text style={styles.roomName}>{room.name}</Text>
                    <Text style={styles.roomGrid}>
                      {room.grid_rows} x {room.grid_cols} places
                    </Text>
                  </View>
                  <Text style={styles.roomChevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Zone de danger</Text>
          <Pressable
            style={styles.deleteClassButton}
            onPress={handleDeletePress}
          >
            <Text style={styles.deleteClassButtonText}>Supprimer cette classe</Text>
          </Pressable>
          <Text style={styles.dangerHint}>
            Cette action supprimera definitivement toutes les donnees de la classe (RGPD).
          </Text>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={handleCloseEditModal}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Modifier la classe</Text>

            <TextInput
              style={styles.input}
              placeholder="Nom de la classe"
              placeholderTextColor={theme.colors.textTertiary}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleUpdateName}
            />

            {classError && (
              <Text style={styles.modalErrorText}>{classError}</Text>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={handleCloseEditModal}
                disabled={isUpdating}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.confirmButton,
                  (!editName.trim() || isUpdating) && styles.buttonDisabled,
                ]}
                onPress={handleUpdateName}
                disabled={!editName.trim() || isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator color={theme.colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Enregistrer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Student Modal */}
      <Modal
        visible={addStudentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseAddStudentModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={handleCloseAddStudentModal}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajouter un eleve</Text>

            <TextInput
              style={styles.input}
              placeholder="Prenom"
              placeholderTextColor={theme.colors.textTertiary}
              value={newStudentFirstName}
              onChangeText={setNewStudentFirstName}
              autoFocus
              autoCapitalize="words"
              returnKeyType="next"
            />

            <TextInput
              style={styles.input}
              placeholder="Nom"
              placeholderTextColor={theme.colors.textTertiary}
              value={newStudentLastName}
              onChangeText={setNewStudentLastName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleAddStudent}
            />

            {studentsError && (
              <Text style={styles.modalErrorText}>{studentsError}</Text>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={handleCloseAddStudentModal}
                disabled={isAddingStudent}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.confirmButton,
                  (!newStudentFirstName.trim() || !newStudentLastName.trim() || isAddingStudent) && styles.buttonDisabled,
                ]}
                onPress={handleAddStudent}
                disabled={!newStudentFirstName.trim() || !newStudentLastName.trim() || isAddingStudent}
              >
                {isAddingStudent ? (
                  <ActivityIndicator color={theme.colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Ajouter</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Create/Edit Modal */}
      <Modal
        visible={groupModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setGroupModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingGroup ? 'Modifier le groupe' : 'Nouveau groupe'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Nom du groupe"
              placeholderTextColor={theme.colors.textTertiary}
              value={groupName}
              onChangeText={setGroupName}
              autoCapitalize="words"
              autoFocus
            />

            <Text style={styles.colorPickerLabel}>Couleur</Text>
            <View style={styles.colorPicker}>
              {GROUP_COLORS.map((color) => (
                <Pressable
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    groupColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setGroupColor(color)}
                />
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setGroupModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.confirmButton,
                  !groupName.trim() && styles.buttonDisabled,
                ]}
                onPress={handleSaveGroup}
                disabled={!groupName.trim()}
              >
                <Text style={styles.confirmButtonText}>
                  {editingGroup ? 'Modifier' : 'Creer'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Assign Group Modal */}
      <Modal
        visible={assignGroupModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignGroupModalVisible(false)}
      >
        <Pressable
          style={styles.assignGroupModalOverlay}
          onPress={() => setAssignGroupModalVisible(false)}
        >
          <Pressable
            style={styles.assignGroupModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              Assigner {selectedStudentForGroup?.fullName || selectedStudentForGroup?.pseudo}
            </Text>

            <ScrollView style={styles.assignGroupList}>
              <Pressable
                style={[
                  styles.assignGroupOption,
                  !selectedStudentForGroup?.groupId && styles.assignGroupOptionSelected,
                ]}
                onPress={() => handleAssignGroup(null)}
              >
                <View style={[styles.assignGroupDot, { backgroundColor: theme.colors.textTertiary }]} />
                <Text style={styles.assignGroupOptionText}>Aucun groupe</Text>
                {!selectedStudentForGroup?.groupId && (
                  <Text style={styles.assignGroupCheck}>✓</Text>
                )}
              </Pressable>

              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  style={[
                    styles.assignGroupOption,
                    selectedStudentForGroup?.groupId === group.id && styles.assignGroupOptionSelected,
                  ]}
                  onPress={() => handleAssignGroup(group.id)}
                >
                  <View style={[styles.assignGroupDot, { backgroundColor: group.color }]} />
                  <Text style={styles.assignGroupOptionText}>{group.name}</Text>
                  {selectedStudentForGroup?.groupId === group.id && (
                    <Text style={styles.assignGroupCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setAssignGroupModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={styles.deleteModalOverlay}
          onPress={() => !isDeleting && setDeleteModalVisible(false)}
        >
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.deleteModalIcon}>⚠️</Text>
            <Text style={styles.deleteModalTitle}>Supprimer la classe ?</Text>
            <Text style={styles.deleteModalText}>
              Cette action est irreversible. Toutes les donnees seront definitivement supprimees :
            </Text>
            <View style={styles.deleteModalStats}>
              <Text style={styles.deleteModalStatItem}>
                • {deleteStats?.studentsCount || 0} eleve{(deleteStats?.studentsCount || 0) > 1 ? 's' : ''}
              </Text>
              <Text style={styles.deleteModalStatItem}>
                • {deleteStats?.sessionsCount || 0} seance{(deleteStats?.sessionsCount || 0) > 1 ? 's' : ''}
              </Text>
              <Text style={styles.deleteModalStatItem}>
                • {deleteStats?.eventsCount || 0} evenement{(deleteStats?.eventsCount || 0) > 1 ? 's' : ''}
              </Text>
              <Text style={styles.deleteModalStatItem}>
                • Plans de classe associes
              </Text>
            </View>
            <View style={styles.deleteModalActions}>
              <Pressable
                style={styles.deleteModalCancelButton}
                onPress={() => setDeleteModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={styles.deleteModalCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteModalDeleteButton, isDeleting && styles.buttonDisabled]}
                onPress={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.deleteModalDeleteText}>Supprimer</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    paddingVertical: theme.spacing.xs,
    paddingRight: theme.spacing.md,
    minWidth: 80,
  },
  backText: {
    fontSize: 16,
    color: theme.colors.participation,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 80,
  },
  exportButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.lg,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  infoLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  editIcon: {
    color: theme.colors.participation,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  section: {
    marginTop: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  addStudentButton: {
    backgroundColor: theme.colors.participation,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  addStudentButtonText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  importButton: {
    backgroundColor: theme.colors.remarque,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  importButtonText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingSection: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptySection: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptySectionEmoji: {
    fontSize: 32,
    marginBottom: theme.spacing.sm,
  },
  emptySectionText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  emptySectionHint: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  studentsList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  studentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  studentItemPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  studentChevron: {
    fontSize: 24,
    color: theme.colors.textTertiary,
    marginLeft: theme.spacing.sm,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.participation,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  studentInitial: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  studentPseudo: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  createRoomLink: {
    marginTop: theme.spacing.md,
  },
  createRoomLinkText: {
    color: theme.colors.participation,
    fontSize: 14,
    fontWeight: '500',
  },
  roomsList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  roomItemPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  roomGrid: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  roomChevron: {
    fontSize: 24,
    color: theme.colors.textTertiary,
    marginLeft: theme.spacing.sm,
  },
  dangerZone: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
  },
  deleteClassButton: {
    backgroundColor: theme.colors.error,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  deleteClassButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  dangerHint: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },

  // Modal styles
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
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  modalErrorText: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  cancelButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: theme.colors.participation,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    minWidth: 100,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Delete modal styles
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteModalContent: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.lg,
  },
  deleteModalIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.sm,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  deleteModalText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  deleteModalStats: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  deleteModalStatItem: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 4,
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  deleteModalCancelButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  deleteModalCancelText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  deleteModalDeleteButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    backgroundColor: theme.colors.error,
  },
  deleteModalDeleteText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },

  // Group styles
  groupColorIndicator: {
    width: 4,
    height: '80%',
    borderRadius: 2,
    marginRight: theme.spacing.sm,
  },
  groupsList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  groupColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: theme.spacing.md,
  },
  groupName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  groupMemberCount: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  addGroupButton: {
    backgroundColor: theme.colors.participation,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  addGroupButtonText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  assignGroupButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.xs,
  },
  assignGroupButtonText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  colorPickerLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: theme.colors.text,
  },
  assignGroupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignGroupModalContent: {
    width: '85%',
    maxWidth: 340,
    maxHeight: '60%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.lg,
  },
  assignGroupList: {
    maxHeight: 250,
    marginBottom: theme.spacing.md,
  },
  assignGroupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.xs,
  },
  assignGroupOptionSelected: {
    backgroundColor: theme.colors.background,
  },
  assignGroupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: theme.spacing.md,
  },
  assignGroupOptionText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },
  assignGroupCheck: {
    fontSize: 16,
    color: theme.colors.participation,
    fontWeight: '600',
  },
});
