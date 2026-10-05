/**
 * progress_detail is shared by internal tags and student-facing recaps.
 * Format legacy third-person notes at the display boundary without rewriting
 * history or turning a coach's suggestion into a completed achievement.
 */
export function formatStudentProgressDetail(detail) {
  if (typeof detail !== 'string') return '';

  return detail.trim()
    .replace(/(^|[。！？；\n]\s*)(?:AI|小幫手|助理)\s*(?=建議|提醒|鼓勵)/g, '$1')
    .replace(/(建議|提醒|鼓勵)\s*(?:這位|該名|該|本)?學員/g, '$1你')
    .replace(/(^|[，。！？；：\n]\s*)(?:這位|該名|該|本)?學員/g, '$1你');
}
