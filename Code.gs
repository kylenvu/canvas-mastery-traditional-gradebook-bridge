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

function parseGradeCsv(csvText) {
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

  var students = studentRows
    .map(function(row) {
      return {
        id: row[studentIdIndex] || '',
        name: row[studentNameIndex] || '',
        scores: assignmentColumns.map(function(column) {
          return row[column.index] || '';
        })
      };
    });

  return {
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

function findHeaderIndex_(headers, columnName) {
  var target = columnName.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() === target) {
      return i;
    }
  }
  return -1;
}
