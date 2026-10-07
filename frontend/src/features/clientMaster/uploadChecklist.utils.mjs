const EXPLANATION_STAGES = ['Data Explained', 'Data Format Sent'];

export function withExplanationStages(data) {
  if (!data) return data;
  const checklist = [...(data.checklist || [])];
  for (const particular of EXPLANATION_STAGES) {
    if (checklist.some(row => row.particular === particular)) continue;
    const completeIndex = checklist.findIndex(row => row.particular === 'Upload Complete');
    checklist.splice(completeIndex < 0 ? checklist.length : completeIndex, 0, {
      particular, yesNo: '', date: '', files: [], remarks: ''
    });
  }
  return { ...data, checklist };
}
