import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../../constants/theme';
import { getGroupColor } from '../../constants/groups';
import { StudentSelector } from './StudentSelector';
import { GroupBadge } from './GroupBadge';
import { GroupActionModal, GroupAction } from './GroupActionModal';
import { GroupNoteModal } from './GroupNoteModal';
import { GroupRemarkModal } from './GroupRemarkModal';
import { useGroupStore, useGroupTemplateStore, StudentWithMapping } from '../../stores';
import { SessionGroupWithMembers, GroupTemplate, GroupConfig } from '../../types';
import { uploadEventPhoto, PhotoQuality } from '../../services/photos';

type PanelView = 'main' | 'create' | 'template' | 'edit';

interface GroupPanelProps {
  visible: boolean;
  onClose: () => void;
  sessionId: string;
  classId: string;
  userId: string;
  students: StudentWithMapping[];
  absentStudentIds: string[];
  positions?: Record<string, string>; // For island detection
}

/**
 * Bottom sheet panel for managing groups during a session
 */
export function GroupPanel({
  visible,
  onClose,
  sessionId,
  classId,
  userId,
  students,
  absentStudentIds,
  positions,
}: GroupPanelProps) {
  const {
    groups,
    isLoading: isGroupLoading,
    loadGroups,
    createGroup,
    createGroupsFromConfig,
    deleteGroup,
    clearAllGroups,
    addGroupRemark,
    addGroupGrade,
    addStudentToGroup,
    removeStudentFromGroup,
  } = useGroupStore();

  const {
    templates,
    isLoading: isTemplateLoading,
    loadTemplates,
    createTemplate,
  } = useGroupTemplateStore();

  const [view, setView] = useState<PanelView>('main');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Group action modals
  const [selectedGroup, setSelectedGroup] = useState<SessionGroupWithMembers | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SessionGroupWithMembers | null>(null);

  // Build student -> group mapping
  const studentGroups: Record<string, number> = {};
  groups.forEach((group) => {
    group.members.forEach((member) => {
      studentGroups[member.studentId] = group.groupNumber;
    });
  });

  // Load groups and templates on mount
  useEffect(() => {
    if (visible) {
      loadGroups(sessionId, students);
      loadTemplates(classId);
    }
  }, [visible, sessionId, classId]);

  // Handle creating a new group from selection
  const handleCreateGroup = async () => {
    if (selectedStudentIds.length === 0) {
      Alert.alert('Erreur', 'Selectionnez au moins un eleve');
      return;
    }

    await createGroup(sessionId, selectedStudentIds, students);
    setSelectedStudentIds([]);
    setView('main');
  };

  // Handle applying a template
  const handleApplyTemplate = async (template: GroupTemplate) => {
    Alert.alert(
      'Appliquer ce template ?',
      `Cela remplacera les groupes actuels par "${template.name}"`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Appliquer',
          onPress: async () => {
            await createGroupsFromConfig(sessionId, template.groupsConfig, students);
            setView('main');
          },
        },
      ]
    );
  };

  // Handle saving current groups as template
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      Alert.alert('Erreur', 'Entrez un nom pour le template');
      return;
    }

    setIsSaving(true);
    const config: GroupConfig[] = groups.map((g) => ({
      number: g.groupNumber,
      studentIds: g.members.map((m) => m.studentId),
    }));

    await createTemplate(userId, classId, templateName.trim(), config);
    setTemplateName('');
    setShowSaveTemplate(false);
    setIsSaving(false);
    Alert.alert('Succes', 'Template sauvegarde');
  };

  // Handle clearing all groups
  const handleClearGroups = () => {
    Alert.alert(
      'Supprimer tous les groupes ?',
      'Cette action est irreversible',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => clearAllGroups(sessionId),
        },
      ]
    );
  };

  // Handle group action selection
  const handleGroupAction = async (action: GroupAction) => {
    if (!selectedGroup) return;

    setShowActionModal(false);

    switch (action) {
      case 'remark':
        setShowRemarkModal(true);
        break;
      case 'grade':
        setShowNoteModal(true);
        break;
      case 'edit':
        setEditingGroup(selectedGroup);
        setSelectedStudentIds(selectedGroup.members.map((m) => m.studentId));
        setView('edit');
        break;
      case 'delete':
        Alert.alert(
          'Supprimer ce groupe ?',
          `Le groupe ${selectedGroup.groupNumber} sera supprime`,
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: async () => {
                await deleteGroup(selectedGroup.id);
                setSelectedGroup(null);
              },
            },
          ]
        );
        break;
    }
  };

  // Handle submitting group note
  const handleSubmitNote = async (gradeValue: number, gradeMax: number, note?: string) => {
    if (!selectedGroup) return;
    await addGroupGrade(selectedGroup.id, gradeValue, gradeMax, note);
  };

  // Handle submitting group remark
  const handleSubmitRemark = async (note: string, photoUri?: string, photoQuality?: PhotoQuality) => {
    if (!selectedGroup) return;

    let photoPath: string | null = null;
    if (photoUri) {
      const tempId = Date.now().toString();
      const result = await uploadEventPhoto(userId, tempId, photoUri, photoQuality || 'minimal');
      if (result.success && result.path) {
        photoPath = result.path;
      }
    }

    await addGroupRemark(selectedGroup.id, note, photoPath);
  };

  // Handle updating group members
  const handleUpdateMembers = async () => {
    if (!editingGroup) return;

    // Remove members that are no longer selected
    const currentMemberIds = editingGroup.members.map((m) => m.studentId);
    const toRemove = currentMemberIds.filter((id) => !selectedStudentIds.includes(id));
    const toAdd = selectedStudentIds.filter((id) => !currentMemberIds.includes(id));

    for (const studentId of toRemove) {
      await removeStudentFromGroup(editingGroup.id, studentId);
    }

    for (const studentId of toAdd) {
      await addStudentToGroup(editingGroup.id, studentId, students);
    }

    // Reload groups
    await loadGroups(sessionId, students);
    setEditingGroup(null);
    setSelectedStudentIds([]);
    setView('main');
  };

  // Get member names for a group
  const getMemberNames = (group: SessionGroupWithMembers): string[] => {
    return group.members.map((m) => {
      // student may have fullName from StudentWithMapping at runtime
      const fullName = (m.student as any).fullName;
      return fullName || m.student.pseudo;
    });
  };

  const renderMainView = () => (
    <>
      {/* Action buttons */}
      <View style={styles.actionGrid}>
        <Pressable
          style={styles.actionCard}
          onPress={() => setView('template')}
        >
          <Text style={styles.actionCardIcon}>📋</Text>
          <Text style={styles.actionCardText}>Depuis template</Text>
        </Pressable>

        <Pressable
          style={styles.actionCard}
          onPress={() => {
            setSelectedStudentIds([]);
            setView('create');
          }}
        >
          <Text style={styles.actionCardIcon}>🆕</Text>
          <Text style={styles.actionCardText}>Creation libre</Text>
        </Pressable>
      </View>

      {/* Active groups */}
      {groups.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Groupes actifs :</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.groupsRow}>
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  style={[
                    styles.groupCard,
                    { borderColor: getGroupColor(group.groupNumber) },
                  ]}
                  onPress={() => {
                    setSelectedGroup(group);
                    setShowActionModal(true);
                  }}
                >
                  <GroupBadge groupNumber={group.groupNumber} size="medium" />
                  <Text style={styles.groupCardCount}>
                    {group.members.length} el.
                  </Text>
                  {group.events.length > 0 && (
                    <View style={styles.eventIndicator}>
                      <Text style={styles.eventIndicatorText}>
                        {group.events.length}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Save as template */}
          {!showSaveTemplate ? (
            <Pressable
              style={styles.saveTemplateButton}
              onPress={() => setShowSaveTemplate(true)}
            >
              <Text style={styles.saveTemplateButtonText}>
                💾 Sauvegarder comme template
              </Text>
            </Pressable>
          ) : (
            <View style={styles.saveTemplateForm}>
              <TextInput
                style={styles.templateNameInput}
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="Nom du template..."
                placeholderTextColor={theme.colors.textTertiary}
              />
              <View style={styles.saveTemplateActions}>
                <Pressable
                  style={styles.saveTemplateCancelButton}
                  onPress={() => {
                    setShowSaveTemplate(false);
                    setTemplateName('');
                  }}
                >
                  <Text style={styles.saveTemplateCancelText}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.saveTemplateConfirmButton,
                    isSaving && styles.buttonDisabled,
                  ]}
                  onPress={handleSaveTemplate}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color={theme.colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.saveTemplateConfirmText}>Sauvegarder</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* Clear all button */}
          <Pressable
            style={styles.clearButton}
            onPress={handleClearGroups}
          >
            <Text style={styles.clearButtonText}>
              Supprimer tous les groupes
            </Text>
          </Pressable>
        </>
      )}

      {groups.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Aucun groupe pour cette seance
          </Text>
        </View>
      )}
    </>
  );

  const renderCreateView = () => (
    <>
      <View style={styles.viewHeader}>
        <Pressable onPress={() => setView('main')}>
          <Text style={styles.backButton}>← Retour</Text>
        </Pressable>
        <Text style={styles.viewTitle}>
          Creer groupe {groups.length + 1}
        </Text>
      </View>

      <Text style={styles.helperText}>
        Selectionnez les eleves :
      </Text>

      <StudentSelector
        students={students}
        studentGroups={studentGroups}
        selectedStudentIds={selectedStudentIds}
        onSelectionChange={setSelectedStudentIds}
        absentStudentIds={absentStudentIds}
      />

      <View style={styles.selectionInfo}>
        <Text style={styles.selectionInfoText}>
          {selectedStudentIds.length} eleve(s) selectionne(s)
        </Text>
      </View>

      <Pressable
        style={[
          styles.createButton,
          selectedStudentIds.length === 0 && styles.buttonDisabled,
        ]}
        onPress={handleCreateGroup}
        disabled={selectedStudentIds.length === 0}
      >
        <Text style={styles.createButtonText}>Creer le groupe</Text>
      </Pressable>
    </>
  );

  const renderTemplateView = () => (
    <>
      <View style={styles.viewHeader}>
        <Pressable onPress={() => setView('main')}>
          <Text style={styles.backButton}>← Retour</Text>
        </Pressable>
        <Text style={styles.viewTitle}>Templates</Text>
      </View>

      {isTemplateLoading ? (
        <ActivityIndicator color={theme.colors.participation} />
      ) : templates.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Aucun template sauvegarde pour cette classe
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.templateList}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              style={styles.templateCard}
              onPress={() => handleApplyTemplate(template)}
            >
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>{template.name}</Text>
                <Text style={styles.templateDetails}>
                  {template.groupsConfig.length} groupes
                </Text>
              </View>
              <Text style={styles.templateArrow}>→</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </>
  );

  const renderEditView = () => (
    <>
      <View style={styles.viewHeader}>
        <Pressable onPress={() => {
          setEditingGroup(null);
          setSelectedStudentIds([]);
          setView('main');
        }}>
          <Text style={styles.backButton}>← Retour</Text>
        </Pressable>
        <Text style={styles.viewTitle}>
          Modifier groupe {editingGroup?.groupNumber}
        </Text>
      </View>

      <Text style={styles.helperText}>
        Modifiez les membres :
      </Text>

      <StudentSelector
        students={students}
        studentGroups={{}} // Don't show group indicators when editing
        selectedStudentIds={selectedStudentIds}
        onSelectionChange={setSelectedStudentIds}
        absentStudentIds={absentStudentIds}
      />

      <View style={styles.selectionInfo}>
        <Text style={styles.selectionInfoText}>
          {selectedStudentIds.length} eleve(s) selectionne(s)
        </Text>
      </View>

      <Pressable
        style={[
          styles.createButton,
          selectedStudentIds.length === 0 && styles.buttonDisabled,
        ]}
        onPress={handleUpdateMembers}
        disabled={selectedStudentIds.length === 0}
      >
        <Text style={styles.createButtonText}>Enregistrer</Text>
      </Pressable>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.panel}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Groupes de travail</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {view === 'main' && renderMainView()}
            {view === 'create' && renderCreateView()}
            {view === 'template' && renderTemplateView()}
            {view === 'edit' && renderEditView()}
          </ScrollView>
        </View>
      </View>

      {/* Group action modal */}
      {selectedGroup && (
        <GroupActionModal
          visible={showActionModal}
          groupNumber={selectedGroup.groupNumber}
          memberNames={getMemberNames(selectedGroup)}
          onClose={() => {
            setShowActionModal(false);
            setSelectedGroup(null);
          }}
          onAction={handleGroupAction}
        />
      )}

      {/* Note modal */}
      {selectedGroup && (
        <GroupNoteModal
          visible={showNoteModal}
          groupNumber={selectedGroup.groupNumber}
          memberNames={getMemberNames(selectedGroup)}
          onClose={() => {
            setShowNoteModal(false);
            setSelectedGroup(null);
          }}
          onSubmit={handleSubmitNote}
        />
      )}

      {/* Remark modal */}
      {selectedGroup && (
        <GroupRemarkModal
          visible={showRemarkModal}
          groupNumber={selectedGroup.groupNumber}
          memberNames={getMemberNames(selectedGroup)}
          onClose={() => {
            setShowRemarkModal(false);
            setSelectedGroup(null);
          }}
          onSubmit={handleSubmitRemark}
        />
      )}
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
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    maxHeight: '80%',
    ...theme.shadows.lg,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  closeButton: {
    fontSize: 20,
    color: theme.colors.textSecondary,
    padding: theme.spacing.xs,
  },
  content: {
    padding: theme.spacing.md,
  },
  // Main view
  actionGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  actionCard: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionCardIcon: {
    fontSize: 28,
    marginBottom: theme.spacing.xs,
  },
  actionCardText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.text,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  groupsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  groupCard: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    minWidth: 70,
  },
  groupCardCount: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  eventIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: theme.colors.remarque,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventIndicatorText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  saveTemplateButton: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  saveTemplateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  saveTemplateForm: {
    marginTop: theme.spacing.md,
  },
  templateNameInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  saveTemplateActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  saveTemplateCancelButton: {
    padding: theme.spacing.sm,
  },
  saveTemplateCancelText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  saveTemplateConfirmButton: {
    backgroundColor: theme.colors.participation,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  saveTemplateConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  clearButton: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    color: theme.colors.error,
    fontWeight: '500',
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
  // Subviews
  viewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  backButton: {
    fontSize: 15,
    color: theme.colors.participation,
    fontWeight: '500',
  },
  viewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  helperText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  selectionInfo: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  selectionInfoText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  createButton: {
    backgroundColor: theme.colors.participation,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Template list
  templateList: {
    maxHeight: 300,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  templateDetails: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  templateArrow: {
    fontSize: 18,
    color: theme.colors.textTertiary,
  },
});
