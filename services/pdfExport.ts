import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Event, EventType } from './database';

// Event type labels and colors for PDF
const EVENT_LABELS: Record<EventType, string> = {
  participation: 'Participation',
  bavardage: 'Bavardage',
  absence: 'Absence',
  remarque: 'Remarque',
  sortie: 'Sortie',
  retour: 'Retour',
};

const EVENT_COLORS: Record<EventType, string> = {
  participation: '#10B981',
  bavardage: '#F59E0B',
  absence: '#EF4444',
  remarque: '#6366F1',
  sortie: '#8B5CF6',
  retour: '#10B981',
};

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Format time for display
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format duration
function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '-';

  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const diffMs = end - start;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  }
  return `${minutes} min`;
}

// Common CSS styles for PDF
const PDF_STYLES = `
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #1a1a1a;
      padding: 20px;
      line-height: 1.4;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #6366F1;
    }
    .header h1 {
      font-size: 24px;
      color: #6366F1;
      margin-bottom: 5px;
    }
    .header .subtitle {
      font-size: 14px;
      color: #666;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 20px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 8px;
    }
    .meta-item {
      flex: 1;
      min-width: 120px;
    }
    .meta-label {
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-value {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #e0e0e0;
    }
    .stats-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 15px;
    }
    .stat-card {
      flex: 1;
      min-width: 80px;
      padding: 10px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
    }
    .stat-label {
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      color: #666;
    }
    tr:hover {
      background: #fafafa;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      color: white;
    }
    .text-center {
      text-align: center;
    }
    .text-right {
      text-align: right;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 10px;
      color: #999;
    }
    .student-section {
      margin-bottom: 15px;
      padding: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }
    .student-name {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #1a1a1a;
    }
    .student-events {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .event-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      background: #f0f0f0;
    }
    .page-break {
      page-break-before: always;
    }
  </style>
`;

interface SessionExportData {
  className: string;
  roomName: string;
  startedAt: string;
  endedAt: string | null;
  topic?: string | null;
  notes?: string | null;
  events: Event[];
  studentNames: Record<string, string>;
}

interface StudentEventSummary {
  studentId: string;
  studentName: string;
  events: Event[];
  counts: Record<EventType, number>;
}

/**
 * Generate PDF for a session
 */
export async function generateSessionPdf(data: SessionExportData): Promise<string> {
  // Calculate statistics
  const counts: Record<EventType, number> = {
    participation: 0,
    bavardage: 0,
    absence: 0,
    remarque: 0,
    sortie: 0,
    retour: 0,
  };

  data.events.forEach((e) => {
    counts[e.type]++;
  });

  // Group events by student
  const studentEvents: Record<string, Event[]> = {};
  data.events.forEach((e) => {
    if (!studentEvents[e.student_id]) {
      studentEvents[e.student_id] = [];
    }
    studentEvents[e.student_id].push(e);
  });

  // Sort students by name
  const sortedStudentIds = Object.keys(studentEvents).sort((a, b) => {
    const nameA = data.studentNames[a] || '';
    const nameB = data.studentNames[b] || '';
    return nameA.localeCompare(nameB);
  });

  // Build HTML
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${PDF_STYLES}
    </head>
    <body>
      <div class="header">
        <h1>Rapport de Seance</h1>
        <div class="subtitle">${data.className}</div>
      </div>

      <div class="meta">
        <div class="meta-item">
          <div class="meta-label">Date</div>
          <div class="meta-value">${formatDate(data.startedAt)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Horaires</div>
          <div class="meta-value">${formatTime(data.startedAt)} - ${data.endedAt ? formatTime(data.endedAt) : 'En cours'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Duree</div>
          <div class="meta-value">${formatDuration(data.startedAt, data.endedAt)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Salle</div>
          <div class="meta-value">${data.roomName}</div>
        </div>
      </div>

      ${data.topic ? `
      <div class="section">
        <div class="section-title">Theme</div>
        <p>${data.topic}</p>
      </div>
      ` : ''}

      ${data.notes ? `
      <div class="section">
        <div class="section-title">Notes de seance</div>
        <p>${data.notes}</p>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">Statistiques</div>
        <div class="stats-grid">
          <div class="stat-card" style="background: ${EVENT_COLORS.participation}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.participation};">${counts.participation}</div>
            <div class="stat-label">Participations</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.bavardage}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.bavardage};">${counts.bavardage}</div>
            <div class="stat-label">Bavardages</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.absence}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.absence};">${counts.absence}</div>
            <div class="stat-label">Absences</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.remarque}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.remarque};">${counts.remarque}</div>
            <div class="stat-label">Remarques</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.sortie}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.sortie};">${counts.sortie}</div>
            <div class="stat-label">Sorties</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Detail par eleve (${sortedStudentIds.length} eleves concernes)</div>
        ${sortedStudentIds.map((studentId) => {
          const events = studentEvents[studentId];
          const studentName = data.studentNames[studentId] || 'Eleve inconnu';
          return `
            <div class="student-section">
              <div class="student-name">${studentName}</div>
              <div class="student-events">
                ${events.map((e) => `
                  <span class="event-badge" style="background: ${EVENT_COLORS[e.type]}20; color: ${EVENT_COLORS[e.type]};">
                    ${EVENT_LABELS[e.type]}${e.subtype ? ` (${e.subtype})` : ''}${e.note ? ` - ${e.note.substring(0, 30)}${e.note.length > 30 ? '...' : ''}` : ''} - ${formatTime(e.timestamp)}
                  </span>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="section">
        <div class="section-title">Chronologie complete</div>
        <table>
          <thead>
            <tr>
              <th>Heure</th>
              <th>Eleve</th>
              <th>Type</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${data.events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((e) => `
              <tr>
                <td>${formatTime(e.timestamp)}</td>
                <td>${data.studentNames[e.student_id] || 'Inconnu'}</td>
                <td><span class="badge" style="background: ${EVENT_COLORS[e.type]};">${EVENT_LABELS[e.type]}</span></td>
                <td>${e.subtype || ''}${e.note ? (e.subtype ? ' - ' : '') + e.note : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        Genere par Gestion Classe le ${formatDate(new Date().toISOString())} a ${formatTime(new Date().toISOString())}
      </div>
    </body>
    </html>
  `;

  // Generate PDF
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  return uri;
}

interface StudentHistoryExportData {
  studentName: string;
  pseudo: string;
  className: string;
  events: Array<Event & { sessionDate?: string; sessionTopic?: string }>;
}

/**
 * Generate PDF for student history
 */
export async function generateStudentHistoryPdf(data: StudentHistoryExportData): Promise<string> {
  // Calculate totals
  const counts: Record<EventType, number> = {
    participation: 0,
    bavardage: 0,
    absence: 0,
    remarque: 0,
    sortie: 0,
    retour: 0,
  };

  data.events.forEach((e) => {
    counts[e.type]++;
  });

  // Group events by session/date
  const eventsByDate: Record<string, typeof data.events> = {};
  data.events.forEach((e) => {
    const date = e.timestamp.split('T')[0];
    if (!eventsByDate[date]) {
      eventsByDate[date] = [];
    }
    eventsByDate[date].push(e);
  });

  const sortedDates = Object.keys(eventsByDate).sort((a, b) => b.localeCompare(a));

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${PDF_STYLES}
    </head>
    <body>
      <div class="header">
        <h1>Historique Eleve</h1>
        <div class="subtitle">${data.studentName} (${data.pseudo})</div>
      </div>

      <div class="meta">
        <div class="meta-item">
          <div class="meta-label">Classe</div>
          <div class="meta-value">${data.className}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Total evenements</div>
          <div class="meta-value">${data.events.length}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Periode</div>
          <div class="meta-value">${sortedDates.length > 0 ? `${formatDate(sortedDates[sortedDates.length - 1])} - ${formatDate(sortedDates[0])}` : '-'}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Bilan</div>
        <div class="stats-grid">
          <div class="stat-card" style="background: ${EVENT_COLORS.participation}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.participation};">${counts.participation}</div>
            <div class="stat-label">Participations</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.bavardage}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.bavardage};">${counts.bavardage}</div>
            <div class="stat-label">Bavardages</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.absence}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.absence};">${counts.absence}</div>
            <div class="stat-label">Absences</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.remarque}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.remarque};">${counts.remarque}</div>
            <div class="stat-label">Remarques</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.sortie}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.sortie};">${counts.sortie}</div>
            <div class="stat-label">Sorties</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Historique detaille</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Heure</th>
              <th>Type</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${data.events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((e) => `
              <tr>
                <td>${formatDate(e.timestamp)}</td>
                <td>${formatTime(e.timestamp)}</td>
                <td><span class="badge" style="background: ${EVENT_COLORS[e.type]};">${EVENT_LABELS[e.type]}</span></td>
                <td>${e.subtype || ''}${e.note ? (e.subtype ? ' - ' : '') + e.note : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        Genere par Gestion Classe le ${formatDate(new Date().toISOString())} a ${formatTime(new Date().toISOString())}
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  return uri;
}

interface ClassExportData {
  className: string;
  students: Array<{
    id: string;
    name: string;
    pseudo: string;
    counts: Record<EventType, number>;
  }>;
  totalSessions: number;
  dateRange?: { from: string; to: string };
}

/**
 * Generate PDF for class overview
 */
export async function generateClassPdf(data: ClassExportData): Promise<string> {
  // Calculate class totals
  const totals: Record<EventType, number> = {
    participation: 0,
    bavardage: 0,
    absence: 0,
    remarque: 0,
    sortie: 0,
    retour: 0,
  };

  data.students.forEach((s) => {
    Object.keys(s.counts).forEach((type) => {
      totals[type as EventType] += s.counts[type as EventType];
    });
  });

  // Sort students by name
  const sortedStudents = [...data.students].sort((a, b) => a.name.localeCompare(b.name));

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${PDF_STYLES}
    </head>
    <body>
      <div class="header">
        <h1>Bilan de Classe</h1>
        <div class="subtitle">${data.className}</div>
      </div>

      <div class="meta">
        <div class="meta-item">
          <div class="meta-label">Eleves</div>
          <div class="meta-value">${data.students.length}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Seances</div>
          <div class="meta-value">${data.totalSessions}</div>
        </div>
        ${data.dateRange ? `
        <div class="meta-item">
          <div class="meta-label">Periode</div>
          <div class="meta-value">${formatDate(data.dateRange.from)} - ${formatDate(data.dateRange.to)}</div>
        </div>
        ` : ''}
      </div>

      <div class="section">
        <div class="section-title">Totaux classe</div>
        <div class="stats-grid">
          <div class="stat-card" style="background: ${EVENT_COLORS.participation}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.participation};">${totals.participation}</div>
            <div class="stat-label">Participations</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.bavardage}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.bavardage};">${totals.bavardage}</div>
            <div class="stat-label">Bavardages</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.absence}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.absence};">${totals.absence}</div>
            <div class="stat-label">Absences</div>
          </div>
          <div class="stat-card" style="background: ${EVENT_COLORS.remarque}20;">
            <div class="stat-value" style="color: ${EVENT_COLORS.remarque};">${totals.remarque}</div>
            <div class="stat-label">Remarques</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Detail par eleve</div>
        <table>
          <thead>
            <tr>
              <th>Eleve</th>
              <th class="text-center">+</th>
              <th class="text-center">-</th>
              <th class="text-center">Abs</th>
              <th class="text-center">Rem</th>
              <th class="text-center">Sort</th>
              <th class="text-center">Bilan</th>
            </tr>
          </thead>
          <tbody>
            ${sortedStudents.map((s) => {
              const balance = s.counts.participation - s.counts.bavardage;
              const balanceColor = balance > 0 ? EVENT_COLORS.participation : balance < 0 ? EVENT_COLORS.bavardage : '#666';
              return `
                <tr>
                  <td><strong>${s.name}</strong><br><small style="color: #666;">${s.pseudo}</small></td>
                  <td class="text-center" style="color: ${EVENT_COLORS.participation}; font-weight: 600;">${s.counts.participation || '-'}</td>
                  <td class="text-center" style="color: ${EVENT_COLORS.bavardage}; font-weight: 600;">${s.counts.bavardage || '-'}</td>
                  <td class="text-center" style="color: ${EVENT_COLORS.absence}; font-weight: 600;">${s.counts.absence || '-'}</td>
                  <td class="text-center" style="color: ${EVENT_COLORS.remarque}; font-weight: 600;">${s.counts.remarque || '-'}</td>
                  <td class="text-center" style="color: ${EVENT_COLORS.sortie}; font-weight: 600;">${s.counts.sortie || '-'}</td>
                  <td class="text-center" style="color: ${balanceColor}; font-weight: 700;">${balance > 0 ? '+' : ''}${balance}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        Genere par Gestion Classe le ${formatDate(new Date().toISOString())} a ${formatTime(new Date().toISOString())}
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  return uri;
}

/**
 * Share a generated PDF file
 */
export async function sharePdf(uri: string, filename?: string): Promise<void> {
  if (Platform.OS === 'web') {
    // On web, open in new tab
    window.open(uri, '_blank');
    return;
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Le partage n\'est pas disponible sur cet appareil');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: filename || 'Exporter le PDF',
    UTI: 'com.adobe.pdf',
  });
}

/**
 * Generate and share a session PDF
 */
export async function exportSessionPdf(data: SessionExportData): Promise<void> {
  const uri = await generateSessionPdf(data);
  const filename = `seance_${data.className.replace(/\s+/g, '_')}_${data.startedAt.split('T')[0]}.pdf`;
  await sharePdf(uri, filename);
}

/**
 * Generate and share a student history PDF
 */
export async function exportStudentHistoryPdf(data: StudentHistoryExportData): Promise<void> {
  const uri = await generateStudentHistoryPdf(data);
  const filename = `historique_${data.pseudo}_${new Date().toISOString().split('T')[0]}.pdf`;
  await sharePdf(uri, filename);
}

/**
 * Generate and share a class PDF
 */
export async function exportClassPdf(data: ClassExportData): Promise<void> {
  const uri = await generateClassPdf(data);
  const filename = `bilan_${data.className.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  await sharePdf(uri, filename);
}
