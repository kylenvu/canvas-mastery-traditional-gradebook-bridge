/**
 * Application State
 */
const state = {
  averageScoreStudents: [],
  numberMasteredStudents: [],
  numberMasteredTotalStandards: 0,
  rosterStudents: [],
  uploadModalInstance: null
};

/**
 * Initialization
 */
document.addEventListener("DOMContentLoaded", () => {
  const maxScoreInput = document.getElementById("max-score-input");
  
  maxScoreInput?.addEventListener("input", () => {
    if (state.averageScoreStudents.length > 0) {
      renderExportTable(state.averageScoreStudents);
    }
  });

  const modalEl = document.getElementById('upload-modal');
  if (modalEl) {
    state.uploadModalInstance = new bootstrap.Modal(modalEl);
  }
});

/**
 * File Upload Flow & Handlers
 */
function handleUploadClick() {
  state.uploadModalInstance?.show();
}

function triggerTraditionalGradebookSelect() {
  document.getElementById('traditional-file-input').click();
}

function triggerMasteryGradebookSelect() {
  document.getElementById('mastery-file-input').click();
}

// Reusable Promisified FileReader
const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

async function handleTraditionalFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const csvText = await readFileAsText(file);
    const result = parseTraditionalGradebookCsv(csvText);
    
    if (result.error) {
      setUploadStatus('traditional', result.error, true);
      return;
    }

    state.rosterStudents = result.students;
    setUploadStatus('traditional', `Successfully processed ${state.rosterStudents.length} students.`, false);
    
    // Enable mastery upload step
    const masteryStep = document.getElementById('mastery-upload-step');
    masteryStep.classList.remove('opacity-50');
    
    document.getElementById('mastery-upload-button').disabled = false;
    document.getElementById('mastery-upload-status').textContent = 'Ready for file.';
    
  } catch (err) {
    setUploadStatus('traditional', 'Error parsing file.', true);
  }
}

async function handleMasteryFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const csvText = await readFileAsText(file);
    const result = parseGradeCsv(csvText, state.rosterStudents);
    
    if (result.error) {
      setUploadStatus('mastery', result.error, true);
      return;
    }

    setUploadStatus('mastery', 'Successfully parsed grades.', false);
    state.uploadModalInstance?.hide();
    renderParsedGrades(result);
    
  } catch (err) {
    setUploadStatus('mastery', 'Error parsing file.', true);
  }
}

function setUploadStatus(type, message, isError) {
  const el = document.getElementById(`${type}-upload-status`);
  if (!el) return;
  
  el.textContent = message;
  if (isError) {
    el.classList.add('text-danger');
    el.classList.remove('text-success', 'text-muted');
  } else {
    el.classList.remove('text-danger', 'text-muted');
    el.classList.add('text-success');
  }
}

function saveMaxScoreAndContinue() {
  const val = document.getElementById('max-score-modal-input').value;
  if (val && parseInt(val, 10) > 0) {
    document.getElementById('max-score-input').value = val;
    
    const maxScoreModalEl = document.getElementById('max-score-modal');
    bootstrap.Modal.getInstance(maxScoreModalEl)?.hide();
    
    if (state.averageScoreStudents.length > 0) {
      renderExportTable(state.averageScoreStudents);
    }
  } else {
    document.getElementById('max-score-modal-error').classList.remove('d-none');
  }
}

/**
 * CSV Parsing Utilities
 */
function parseCsvString(str) {
  const arr = [];
  let quote = false;
  let row = 0, col = 0;
  
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    
    if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { ++col; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc === '\n' && !quote) { ++row; col = 0; continue; }
    if (cc === '\r' && !quote) { ++row; col = 0; continue; }
    
    arr[row][col] += cc;
  }
  return arr;
}

function parseTraditionalGradebookCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') throw new Error('No CSV data provided.');

  const rows = parseCsvString(csvText);
  if (rows.length < 2) return { error: 'No student data found.' };

  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  const getIdx = (name) => headers.indexOf(name.toLowerCase());
  
  const indices = {
    student: getIdx('Student'),
    id: getIdx('ID'),
    sisUserId: getIdx('SIS User ID'),
    sisLoginId: getIdx('SIS Login ID'),
    section: getIdx('Section')
  };

  if (Object.values(indices).includes(-1)) {
    return { error: 'Missing required columns in traditional gradebook (Student, ID, SIS User ID, SIS Login ID, Section).' };
  }

  const students = rows.slice(1)
    .filter(row => String(row[indices.student] || '').trim() && String(row[indices.id] || '').trim())
    .map(row => ({
      id: row[indices.id] || '',
      name: formatStudentName(row[indices.student] || ''),
      sisUserId: row[indices.sisUserId] || '',
      sisLoginId: row[indices.sisLoginId] || '',
      section: row[indices.section] || ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return students.length === 0 
    ? { error: 'No student roster rows found.' } 
    : { students };
}

function parseGradeCsv(csvText, rosterStudents) {
  if (!csvText || typeof csvText !== 'string') throw new Error('No CSV data provided.');

  const rows = parseCsvString(csvText);
  if (rows.length < 2) return { error: 'No grade data found.' };

  const headers = rows[0].map(h => String(h).trim());
  const getIdx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  
  const studentNameIdx = getIdx('Student name');
  const studentIdIdx = getIdx('Student ID');

  if (studentNameIdx === -1 || studentIdIdx === -1) {
    return { error: 'Missing Student name and/or Student ID columns in mastery CSV.' };
  }

  const studentRows = rows.slice(1).filter(row => row.some(cell => String(cell).trim() !== ''));

  const assignmentColumns = headers
    .map((header, index) => ({ name: getAssignmentName(header), index, masteryIndex: index + 1 }))
    .filter(col => /\sresult$/i.test(headers[col.index]) && studentRows.some(r => String(r[col.index] || '').trim()));

  if (assignmentColumns.length === 0) return { error: 'No assignment result columns found.' };

  const rosterById = rosterStudents.reduce((acc, student) => {
    if (student.id) acc[student.id] = student;
    return acc;
  }, {});

  const unmatchedStudents = [];
  const students = studentRows.reduce((acc, row) => {
    const studentId = String(row[studentIdIdx] || '').trim();
    const rosterStudent = rosterById[studentId];

    if (!rosterStudent) {
      unmatchedStudents.push({ id: studentId, name: formatStudentName(row[studentNameIdx] || '') });
      return acc;
    }

    acc.push({
      ...rosterStudent, // Inherit id, name, sisUserId, sisLoginId, section
      scores: assignmentColumns.map(col => row[col.index] || ''),
      numberMastered: countMasteredAssignments(row, assignmentColumns)
    });
    
    return acc;
  }, []).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    studentFields: ['Student ID', 'Student Name'],
    assignments: assignmentColumns.map(col => col.name),
    totalStandards: assignmentColumns.length,
    students,
    unmatchedStudents,
    warning: buildRosterMismatchWarning(unmatchedStudents, studentRows.length)
  };
}

function getAssignmentName(header) {
  const cleanHeader = String(header).replace(/\sresult$/i, '').trim();
  const lastIndex = cleanHeader.lastIndexOf('>');
  return lastIndex === -1 ? cleanHeader : cleanHeader.slice(lastIndex + 1).trim();
}

function countMasteredAssignments(row, assignmentColumns) {
  return assignmentColumns.reduce((total, col) => {
    const score = parseFloat(row[col.index]);
    const threshold = parseFloat(row[col.masteryIndex]);
    return (!isNaN(score) && !isNaN(threshold) && score >= threshold) ? total + 1 : total;
  }, 0);
}

function formatStudentName(name) {
  const trimmed = String(name).trim();
  if (trimmed.includes(',')) return trimmed;
  
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  
  return `${parts.pop()}, ${parts.join(' ')}`;
}

function buildRosterMismatchWarning(unmatchedStudents, totalStudents) {
  if (unmatchedStudents.length === 0) return '';
  if (unmatchedStudents.length === totalStudents) return 'No uploaded students were found in the roster. No scores displayed.';
  return `${unmatchedStudents.length} students not found in roster. Scores excluded.`;
}

/**
 * Rendering Utilities
 */
function renderParsedGrades(parsedGrades) {
  if (!parsedGrades) {
    renderAlert("grades-tab", "No grade data returned.");
    return;
  }
  if (parsedGrades.error) {
    ["grades-tab", "export-tab", "number-mastered-tab"].forEach(id => renderAlert(id, parsedGrades.error));
    return;
  }

  const { students = [], warning, assignments = [], studentFields = [], totalStandards = 0 } = parsedGrades;

  if (students.length === 0 && warning) {
    const warningEl = createWarningElement(warning, parsedGrades.unmatchedStudents);
    document.getElementById("grades-tab").replaceChildren(warningEl);
    ["export-tab", "number-mastered-tab"].forEach(id => renderAlert(id, warning));
    return;
  }

  renderGradesTable(students, assignments, studentFields, parsedGrades);
  renderExportTable(students);
  renderNumberMasteredTable(students, totalStandards);
}

function renderGradesTable(students, assignments, studentFields, parsedGrades) {
  const table = document.createElement("table");
  table.className = "table table-striped table-hover grades-table mb-0";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const identityHeaders = studentFields.length ? studentFields : ["Student ID", "Student Name"];
  
  [...identityHeaders, ...assignments].forEach(header => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = header;
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  students.forEach(student => {
    const tr = document.createElement("tr");
    [...getStudentIdentityValues(student, identityHeaders), ...student.scores].forEach(val => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);

  const wrapper = document.createElement("div");
  wrapper.className = "grades-table-wrapper";
  wrapper.appendChild(table);

  const content = document.createDocumentFragment();
  const warning = createWarningElement(parsedGrades.warning, parsedGrades.unmatchedStudents);
  if (warning) content.appendChild(warning);
  content.appendChild(wrapper);

  document.getElementById("grades-tab").replaceChildren(content);
}

function getStudentIdentityValues(student, headers) {
  const map = {
    "Student ID": student.sisUserId || student.id || "",
    "Student Name": student.name ?? "",
    "SIS User ID": student.sisUserId ?? "",
    "SIS Login ID": student.sisLoginId ?? "",
    "Section": student.section ?? ""
  };
  return headers.map(h => map[h] ?? "");
}

function createWarningElement(warningText, unmatched = []) {
  if (!warningText) return null;

  const warningContainer = document.createElement("div");
  warningContainer.className = "alert alert-warning roster-warning";
  
  const msg = document.createElement("div");
  msg.className = "fw-bold mb-2";
  msg.textContent = warningText;
  warningContainer.appendChild(msg);

  if (unmatched.length > 0) {
    const list = document.createElement("ul");
    list.className = "mb-0 roster-warning-list";
    unmatched.forEach(student => {
      const li = document.createElement("li");
      li.textContent = `${student.name} ${student.id ? `(${student.id})` : ''}`;
      list.appendChild(li);
    });
    warningContainer.appendChild(list);
  }
  
  return warningContainer;
}

function renderAlert(tabId, message, type = "warning") {
  const el = document.getElementById(tabId);
  if (!el) return;
  const alert = document.createElement("div");
  alert.className = `alert alert-${type} mb-0`;
  alert.textContent = message;
  el.replaceChildren(alert);
}

function renderExportTable(students) {
  state.averageScoreStudents = students;
  const selectedView = getRadioValue('average-score-view', 'max');
  const maxScore = getMaxScoreValue();
  
  const content = document.createDocumentFragment();
  content.appendChild(createSummaryControls(
    createAverageScoreOptions(selectedView, maxScore),
    createExportButton("Export CSV", exportAverageScoresCsv)
  ));

  if (selectedView === "percent" && !maxScore) {
    const warning = document.createElement("div");
    warning.className = "alert alert-warning";
    warning.textContent = "Enter a valid max score per outcome to view averages as percentages.";
    content.appendChild(warning);
  }

  const table = document.createElement("table");
  table.className = "table table-striped table-hover export-table mb-0";
  
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Student ID</th>
        <th scope="col">Student Name</th>
        <th scope="col">Section</th>
        <th scope="col">Total Average Score</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector('tbody');
  students.forEach(student => {
    const tr = document.createElement("tr");
    [
      student.sisUserId || student.id || "",
      student.name ?? "",
      student.section ?? "",
      formatAverageScore(student.scores ?? [], selectedView, maxScore)
    ].forEach(val => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const wrapper = document.createElement("div");
  wrapper.className = "export-table-wrapper";
  wrapper.appendChild(table);
  content.appendChild(wrapper);

  document.getElementById("export-tab").replaceChildren(content);
}

function createAverageScoreOptions(selectedView, maxScore) {
  const options = document.createElement("div");
  options.className = "average-score-options";

  [
    { id: "average-view-max-score", value: "max", label: `View as max score (out of ${maxScore ? maxScore.toFixed(2) : ""})` },
    { id: "average-view-percent", value: "percent", label: "View as percent (out of 100.0%)" }
  ].forEach(opt => {
    const div = document.createElement("div");
    div.className = "form-check";
    div.innerHTML = `
      <input class="form-check-input" type="radio" name="average-score-view" id="${opt.id}" value="${opt.value}" ${selectedView === opt.value ? 'checked' : ''}>
      <label class="form-check-label" for="${opt.id}">${opt.label}</label>
    `;
    div.querySelector('input').addEventListener('change', () => renderExportTable(state.averageScoreStudents));
    options.appendChild(div);
  });
  
  return options;
}

function formatAverageScore(scores, viewMode, maxScore) {
  const numScores = scores.map(s => parseFloat(s)).filter(s => !isNaN(s));
  if (numScores.length === 0) return "";
  
  const average = numScores.reduce((sum, val) => sum + val, 0) / numScores.length;
  if (viewMode === "percent") {
    return maxScore ? ((average / maxScore) * 100).toFixed(2) : "";
  }
  return average.toFixed(2);
}

function renderNumberMasteredTable(students, totalStandards) {
  state.numberMasteredStudents = students;
  state.numberMasteredTotalStandards = totalStandards;
  
  const selectedView = getRadioValue('number-mastered-view', 'count');
  const content = document.createDocumentFragment();

  content.appendChild(createSummaryControls(
    createNumberMasteredOptions(selectedView),
    createSummaryActions([
      createExportButton("Export CSV", exportNumberMasteredCsv),
      createSummaryTotal(`Total standards: ${totalStandards}`)
    ])
  ));

  const table = document.createElement("table");
  table.className = "table table-striped table-hover summary-table mb-0";
  table.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Student ID</th>
        <th scope="col">Student Name</th>
        <th scope="col">Section</th>
        <th scope="col">Number Mastered</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector('tbody');
  students.forEach(student => {
    const tr = document.createElement("tr");
    [
      student.sisUserId || student.id || "",
      student.name ?? "",
      student.section ?? "",
      formatNumberMastered(student.numberMastered ?? 0, totalStandards, selectedView)
    ].forEach(val => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const wrapper = document.createElement("div");
  wrapper.className = "summary-table-wrapper";
  wrapper.appendChild(table);
  content.appendChild(wrapper);

  document.getElementById("number-mastered-tab").replaceChildren(content);
}

function createNumberMasteredOptions(selectedView) {
  const options = document.createElement("div");
  options.className = "summary-options";

  [
    { id: "number-mastered-view-count", value: "count", label: "View as number mastered" },
    { id: "number-mastered-view-percent", value: "percent", label: "View as percent (out of 100.0%)" }
  ].forEach(opt => {
    const div = document.createElement("div");
    div.className = "form-check";
    div.innerHTML = `
      <input class="form-check-input" type="radio" name="number-mastered-view" id="${opt.id}" value="${opt.value}" ${selectedView === opt.value ? 'checked' : ''}>
      <label class="form-check-label" for="${opt.id}">${opt.label}</label>
    `;
    div.querySelector('input').addEventListener('change', () => renderNumberMasteredTable(state.numberMasteredStudents, state.numberMasteredTotalStandards));
    options.appendChild(div);
  });
  
  return options;
}

function formatNumberMastered(count, total, viewMode) {
  if (viewMode === "percent") {
    return total ? `${((count / total) * 100).toFixed(1)}%` : "";
  }
  return String(count);
}

function getRadioValue(name, fallback) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : fallback;
}

function getMaxScoreValue() {
  const maxScore = parseFloat(document.getElementById("max-score-input")?.value);
  return (!isNaN(maxScore) && maxScore > 0) ? maxScore : null;
}

/**
 * UI Component Helpers
 */
function createSummaryControls(options, actions) {
  const controls = document.createElement("div");
  controls.className = "summary-controls";
  controls.appendChild(options);
  controls.appendChild(actions);
  return controls;
}

function createSummaryActions(children) {
  const actions = document.createElement("div");
  actions.className = "summary-actions";
  children.forEach(child => actions.appendChild(child));
  return actions;
}

function createSummaryTotal(text) {
  const total = document.createElement("div");
  total.className = "summary-total";
  total.textContent = text;
  return total;
}

function createExportButton(label, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-primary";
  btn.textContent = label;
  btn.addEventListener("click", handler);
  return btn;
}

/**
 * CSV Export
 */
function exportAverageScoresCsv() {
  const selectedView = getRadioValue('average-score-view', 'max');
  const maxScore = getMaxScoreValue();

  exportSummaryCsv({
    students: state.averageScoreStudents,
    assignmentName: "Total Average Score",
    pointsPossible: selectedView === "percent" ? "100" : (maxScore ? maxScore.toFixed(2) : ""),
    fileName: "average-scores.csv",
    scoreFormatter: (student) => formatAverageScore(student.scores ?? [], selectedView, maxScore)
  });
}

function exportNumberMasteredCsv() {
  exportSummaryCsv({
    students: state.numberMasteredStudents,
    assignmentName: "Number Mastered",
    pointsPossible: "100",
    fileName: "number-mastered.csv",
    scoreFormatter: (student) => formatNumberMastered(student.numberMastered ?? 0, state.numberMasteredTotalStandards, "percent").replace("%", "")
  });
}

function exportSummaryCsv({ students, assignmentName, pointsPossible, fileName, scoreFormatter }) {
  const rows = [
    ["Student", "ID", "SIS User ID", "SIS Login ID", "Section", assignmentName],
    ["", "", "", "", "", ""],
    ["Points Possible", "", "", "", "", pointsPossible],
    ...students.map(s => [
      s.name ?? "",
      s.id ?? "",
      s.sisUserId ?? "",
      s.sisLoginId ?? "",
      s.section ?? "",
      scoreFormatter(s)
    ])
  ];
  
  downloadCsv(fileName, rows);
}

function downloadCsv(fileName, rows) {
  const escapeCsv = (val) => {
    const text = String(val ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  
  const csvText = rows.map(r => r.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
