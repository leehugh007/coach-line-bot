const STUDENT_ID_PATTERN = /^\d{6,}(?:-\d+)?$/;

/**
 * Parse one pasted student row.
 *
 * Current format: LINE name | real name | student ID | intro (optional)
 * Legacy three-column rows remain compatible: prose in column 3 is an intro,
 * while a value shaped like a student ID is stored as studentId.
 */
export function parseStudentImportLine(line, className) {
  const parts = String(line || '').split('|').map(part => part.trim());
  const lineName = parts[0] || '';
  const realName = parts[1] || lineName;

  let studentId = '';
  let intro = '';

  if (parts.length >= 4) {
    studentId = parts[2] || '';
    intro = parts.slice(3).join(' | ').trim();
  } else if (parts.length === 3) {
    if (STUDENT_ID_PATTERN.test(parts[2])) studentId = parts[2];
    else intro = parts[2];
  }

  return { lineName, realName, className, studentId, intro };
}

/**
 * Excel rows always use four explicit columns so studentId can never slide
 * into the optional intro field.
 */
export function formatStudentImportPreview({ lineName, realName, studentId }) {
  return [lineName || '', realName || lineName || '', studentId || '', ''].join(' | ');
}
