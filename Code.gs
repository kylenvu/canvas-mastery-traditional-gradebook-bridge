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