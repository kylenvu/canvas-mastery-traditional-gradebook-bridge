function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  
  // Retrieve active user's email (or fallback if empty)
  var userEmail = Session.getActiveUser().getEmail() || "User Email Not Available";
  template.userEmail = userEmail;

  return template
      .evaluate()
      .setTitle('Gradebook Viewer')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function parseTraditionalGradebookCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('No CSV data was provided.');
  }

  var rows = Utilities.parseCsv(csvText);
  if (rows.length < 2) {
    return {
      error: 'No student data found in the traditional gradebook export.'
    };
  }

  var headers = rows[0].map(function(header) {
    return String(header).trim();
  });
  var studentIndex = findHeaderIndex_(headers, 'Student');
  var idIndex = findHeaderIndex_(headers, 'ID');
  var sisUserIdIndex = findHeaderIndex_(headers, 'SIS User ID');
  var sisLoginIdIndex = findHeaderIndex_(headers, 'SIS Login ID');
  var sectionIndex = findHeaderIndex_(headers, 'Section');

  if ([studentIndex, idIndex, sisUserIdIndex, sisLoginIdIndex, sectionIndex].some(function(index) {
    return index === -1;
  })) {
    return {
      error: 'The traditional gradebook export must include Student, ID, SIS User ID, SIS Login ID, and Section columns.'
    };
  }

  var students = rows.slice(1)
    .filter(function(row) {
      return String(row[studentIndex] || '').trim() !== '' && String(row[idIndex] || '').trim() !== '';
    })
    .map(function(row) {
      return {
        id: row[idIndex] || '',
        name: formatStudentName_(row[studentIndex] || ''),
        sisUserId: row[sisUserIdIndex] || '',
        sisLoginId: row[sisLoginIdIndex] || '',
        section: row[sectionIndex] || ''
      };
    })
    .sort(compareStudentsByName_);

  if (students.length === 0) {
    return {
      error: 'No student roster rows were found in the traditional gradebook export.'
    };
  }

  return {
    students: students
  };
}

function parseGradeCsv(csvText, rosterStudents) {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('No CSV data was provided.');
  }

  var rows = Utilities.parseCsv(csvText);
  if (rows.length < 2) {
    return {
      error: 'No grade data found in the selected CSV file.'
    };
  }

  var headers = rows[0].map(function(header) {
    return String(header).trim();
  });
  var studentNameIndex = findHeaderIndex_(headers, 'Student name');
  var studentIdIndex = findHeaderIndex_(headers, 'Student ID');

  if (studentNameIndex === -1 || studentIdIndex === -1) {
    return {
      error: 'The CSV must include Student name and Student ID columns.'
    };
  }

  var studentRows = rows.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell).trim() !== '';
      });
    });

  var assignmentColumns = headers
    .map(function(header, index) {
      return {
        name: getAssignmentName_(header),
        index: index
      };
    })
    .filter(function(column) {
      return /\sresult$/i.test(headers[column.index]) && columnHasScores_(studentRows, column.index);
    });

  if (assignmentColumns.length === 0) {
    return {
      error: 'No assignment result columns were found in the selected CSV file.'
    };
  }

  var rosterById = buildRosterById_(rosterStudents || []);
  var students = studentRows
    .map(function(row) {
      var studentId = row[studentIdIndex] || '';
      var rosterStudent = rosterById[String(studentId).trim()] || {};

      return {
        id: studentId,
        name: rosterStudent.name || formatStudentName_(row[studentNameIndex] || ''),
        sisUserId: rosterStudent.sisUserId || '',
        sisLoginId: rosterStudent.sisLoginId || '',
        section: rosterStudent.section || '',
        scores: assignmentColumns.map(function(column) {
          return row[column.index] || '';
        })
      };
    })
    .sort(compareStudentsByName_);

  return {
    studentFields: ['Student ID', 'Student Name'],
    assignments: assignmentColumns.map(function(column) {
      return column.name;
    }),
    students: students
  };
}

function getAssignmentName_(header) {
  var withoutResult = String(header).replace(/\sresult$/i, '').trim();
  var separatorIndex = withoutResult.lastIndexOf('>');

  if (separatorIndex === -1) {
    return withoutResult;
  }

  return withoutResult.slice(separatorIndex + 1).trim();
}

function columnHasScores_(rows, columnIndex) {
  return rows.some(function(row) {
    return String(row[columnIndex] || '').trim() !== '';
  });
}

function formatStudentName_(name) {
  var trimmedName = String(name).trim();

  if (trimmedName.indexOf(',') !== -1) {
    return trimmedName;
  }

  var parts = trimmedName.split(/\s+/);

  if (parts.length < 2) {
    return trimmedName;
  }

  var lastName = parts.pop();
  return lastName + ', ' + parts.join(' ');
}

function buildRosterById_(students) {
  return students.reduce(function(rosterById, student) {
    var id = String(student.id || '').trim();
    if (id) {
      rosterById[id] = student;
    }
    return rosterById;
  }, {});
}

function compareStudentsByName_(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    sensitivity: 'base'
  });
}

function findHeaderIndex_(headers, columnName) {
  var target = columnName.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() === target) {
      return i;
    }
  }
  return -1;
}
