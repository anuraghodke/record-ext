// Handles extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  // Open side panel
  await chrome.sidePanel.open({ tabId: tab.id });
  
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'index.html',
    enabled: true
  });
});
