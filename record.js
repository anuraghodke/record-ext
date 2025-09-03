class Recorder {
  constructor() {
    this.isRecording = false;
    this.steps = [];
    this.activeTabId = null;
    
    this.init();
  }
  
  init() {
    this.bindEvents();
    this.updateUI();
    console.log('Recorder initialized');
  }
  
  bindEvents() {
    document.getElementById('recordBtn').addEventListener('click', () => this.startRecording());
    document.getElementById('stopBtn').addEventListener('click', () => this.stopRecording());
    document.getElementById('downloadBtn').addEventListener('click', () => this.downloadTrace());
  }
  
  async startRecording() {
    try {
      console.log('Starting recording...');
      
      // Get the active tab
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tabs[0]) {
        console.error('No active tab found');
        return;
      }
      
      console.log('Active tab:', tabs[0]);
      
      this.activeTabId = tabs[0].id;
      this.isRecording = true;
      this.steps = [];
      
      // Clear timeline
      this.clearTimeline();
      
      // Inject content script if not already injected
      await this.ensureContentScriptInjected();
      
      // Send start message to content script
      await this.sendMessageToContentScript({type: 'START_RECORDING'});
      
      // Listen for messages from content script
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
      
      console.log('Recording started successfully');
      this.updateUI();
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isRecording = false;
      this.updateUI();
    }
  }
  
  stopRecording() {
    console.log('Stopping recording...');
    this.isRecording = false;
    
    // Remove message listener
    chrome.runtime.onMessage.removeListener(this.handleMessage.bind(this));
    
    // Send stop message to content script
    this.sendMessageToContentScript({type: 'STOP_RECORDING'});
    
    console.log('Final steps:', this.steps);
    this.updateUI();
  }
  
  async ensureContentScriptInjected() {
    try {
      console.log('Ensuring content script is injected...');
      await chrome.scripting.executeScript({
        target: {tabId: this.activeTabId},
        files: ['content.js']
      });
      console.log('Content script injected successfully');
    } catch (error) {
      console.error('Failed to inject content script:', error);
      throw error;
    }
  }
  
  async sendMessageToContentScript(message) {
    try {
      await chrome.tabs.sendMessage(this.activeTabId, message);
    } catch (error) {
      console.error('Failed to send message to content script:', error);
    }
  }
  
  handleMessage(message, sender, sendResponse) {
    console.log('Received message:', message);
    
    switch (message.type) {
      case 'RECORDING_STARTED':
        console.log('Recording started in content script');
        break;
      case 'RECORDING_STOPPED':
        console.log('Recording stopped in content script');
        this.steps = message.steps || [];
        this.updateTimeline();
        break;
      case 'RECORD_STEP':
        console.log('Adding step:', message.step);
        this.addStep(message.step);
        break;
    }
  }
  
  addStep(step) {
    this.steps.push(step);
    console.log('Step added, total steps:', this.steps.length);
    
    // Add to timeline
    this.addTimelineItem(step);
  }
  
  updateTimeline() {
    // Clear existing timeline
    this.clearTimeline();
    
    // Add all steps
    this.steps.forEach(step => {
      this.addTimelineItem(step);
    });
  }
  
  addTimelineItem(step) {
    const timeline = document.getElementById('timeline');
    
    // Remove empty state if it exists
    const emptyState = timeline.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
    
    const timelineItem = document.createElement('div');
    timelineItem.className = `timeline-item ${step.type}`;
    
    const time = this.formatTime(step.t);
    const content = this.formatStepContent(step);
    
    timelineItem.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-type">${this.getStepTypeLabel(step.type)}</div>
        <div class="timeline-time">${time}</div>
      </div>
      <div class="timeline-content">${content}</div>
      ${this.formatLocators(step)}
    `;
    
    timeline.appendChild(timelineItem);
    
    timeline.scrollTop = timeline.scrollHeight;
  }
  
  formatTime(timestamp) {
    if (timestamp === 0) return '0ms';
    return `${timestamp}ms`;
  }
  
  getStepTypeLabel(type) {
    const labels = {
      'navigate': 'Navigation',
      'click': 'Click',
      'type': 'Type',
      'press': 'Key Press'
    };
    return labels[type] || type;
  }
  
  formatStepContent(step) {
    switch (step.type) {
      case 'navigate':
        return `Navigated to: ${this.getPageName(step.url)}`;
      case 'click':
        return `Clicked element`;
      case 'type':
        return `Typed: "${step.text}"`;
      case 'press':
        return `Pressed: ${step.key}`;
      default:
        return JSON.stringify(step);
    }
  }
  
  getPageName(url) {
    try {
      const urlObj = new URL(url);
      let pageName = urlObj.hostname;
      
      if (pageName.startsWith('www.')) {
        pageName = pageName.substring(4);
      }
      
      if (urlObj.pathname && urlObj.pathname !== '/') {
        const path = urlObj.pathname.split('/').filter(segment => segment.length > 0);
        if (path.length > 0) {
          pageName += ` - ${path[0]}`;
        }
      }
      
      return pageName;
    } catch (e) {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }
  }
  
  formatLocators(step) {
    if (step.target && step.target.locators && step.target.locators.length > 0) {
      const displayLocators = step.target.locators.filter(locator => 
        locator.type !== 'xpath' && locator.type !== 'css'
      );
      
      if (displayLocators.length === 0) {
        return '';
      }
      
      const locatorsHtml = displayLocators.map(locator => {
        let content = '';
        switch (locator.type) {
          case 'role':
            content = `Role: ${locator.role}${locator.name ? ` (${locator.name})` : ''}`;
            break;
          case 'id':
            content = `ID: ${locator.value}`;
            break;
          case 'href':
            content = `Link: ${locator.path}`;
            break;
          case 'title':
            content = `Title: ${locator.value}`;
            break;
          case 'text':
            content = `Text: "${locator.content}"`;
            break;
          default:
            content = JSON.stringify(locator);
        }
        return `<span class="locator">${content}</span>`;
      }).join('');
      
      return `<div class="timeline-locators">${locatorsHtml}</div>`;
    }
    return '';
  }
  
  clearTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📹</div>
        <div>No actions recorded yet</div>
        <div>Start recording to see your actions here</div>
      </div>
    `;
  }
  
  updateUI() {
    const recordBtn = document.getElementById('recordBtn');
    const stopBtn = document.getElementById('stopBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const status = document.getElementById('status');
    
    if (this.isRecording) {
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      downloadBtn.disabled = true;
      status.textContent = 'Recording...';
      status.className = 'status recording';
    } else {
      recordBtn.disabled = false;
      stopBtn.disabled = true;
      downloadBtn.disabled = this.steps.length === 0;
      status.textContent = this.steps.length > 0 ? 'Recording stopped' : 'Ready to record';
      status.className = 'status';
    }
  }
  
  downloadTrace() {
    const trace = {
      version: 1,
      steps: this.steps
    };
    
    console.log('Downloading trace:', trace);
    
    const blob = new Blob([JSON.stringify(trace, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize recorder when side panel opens
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing recorder...');
  new Recorder();
});
