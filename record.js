class Recorder {
  constructor() {
    this.isRecording = false;
    this.isReplaying = false;
    this.steps = [];
    this.activeTabId = null;
    this.replaySteps = [];
    this.currentReplayStep = 0;
    this.isPaused = false;
    
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
    
    // Replay functionality
    document.getElementById('traceFileInput').addEventListener('change', (e) => this.handleFileSelect(e));
    document.getElementById('playBtn').addEventListener('click', () => this.startReplay());
    document.getElementById('stopReplayBtn').addEventListener('click', () => this.stopReplay());
    document.getElementById('stepBtn').addEventListener('click', () => this.stepReplay());
  }
  
  handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const trace = JSON.parse(e.target.result);
          if (trace.version && trace.steps) {
            this.replaySteps = trace.steps;
            document.getElementById('playBtn').disabled = false;
            console.log(`Loaded trace with ${trace.steps.length} steps`);
          } else {
            alert('Invalid trace file format');
          }
        } catch (error) {
          alert('Error reading trace file: ' + error.message);
        }
      };
      reader.readAsText(file);
    }
  }
  
  async startReplay() {
    if (this.replaySteps.length === 0) {
      alert('No trace loaded');
      return;
    }
    
    try {
      this.isReplaying = true;
      this.currentReplayStep = 0;
      this.isPaused = false;
      
      // Get the active tab
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tabs[0]) {
        console.error('No active tab found');
        return;
      }
      
      this.activeTabId = tabs[0].id;
      
      // Load the trace steps into the timeline
      this.loadTraceIntoTimeline();
      
      // Update UI
      this.updateReplayUI();
      
      console.log('Replay started - ready for manual stepping');
      
    } catch (error) {
      console.error('Replay failed:', error);
      this.stopReplay();
    }
  }
  
  loadTraceIntoTimeline() {
    // Clear existing timeline
    this.clearTimeline();
    
    // Add all replay steps to timeline
    this.replaySteps.forEach((step, index) => {
      this.addTimelineItem(step, index);
    });
    
    console.log(`Loaded ${this.replaySteps.length} steps into timeline`);
  }
  
  stopReplay() {
    this.isReplaying = false;
    this.isPaused = false;
    this.currentReplayStep = 0;
    
    this.updateReplayUI();
    this.clearReplayHighlights();
    
    // Clear the timeline back to empty state
    this.clearTimeline();
  }
  
  async stepReplay() {
    if (!this.isReplaying) {
      alert('Please start replay first');
      return;
    }
    
    if (this.currentReplayStep >= this.replaySteps.length) {
      console.log('Replay completed');
      this.stopReplay();
      return;
    }
    
    const step = this.replaySteps[this.currentReplayStep];
    
    console.log(`Executing step ${this.currentReplayStep + 1}/${this.replaySteps.length}:`, step);
    
    // Highlight current step BEFORE executing
    this.highlightReplayStep(this.currentReplayStep);
    
    // Update progress BEFORE executing
    this.updateReplayProgress();
    
    try {
      await this.executeAction(step);
      
      // Move to next step after successful execution
      this.currentReplayStep++;
      
      // Check if we've completed all steps
      if (this.currentReplayStep >= this.replaySteps.length) {
        console.log('Replay completed');
        this.stopReplay();
      } else {
        // Update progress to show we're ready for next step
        this.updateReplayProgress();
        console.log(`Ready for next step. Click Step button to execute step ${this.currentReplayStep + 1}`);
      }
      
    } catch (error) {
      console.error('Error executing step:', error);
      this.stopReplay();
    }
  }
  
  async executeAction(step) {
    const actionType = step.type;
    console.log(`Executing: ${actionType}`, step);
    
    switch (actionType) {
      case 'navigate':
        await this.executeNavigation(step);
        break;
      case 'click':
        await this.executeClick(step);
        break;
      case 'type':
        await this.executeType(step);
        break;
      case 'press':
        await this.executeKeyPress(step);
        break;
      default:
        console.warn(`Unknown action type: ${actionType}`);
    }
  }
  
  async executeNavigation(step) {
    const url = step.url;
    if (url) {
      console.log(`Navigating to: ${url}`);
      await chrome.tabs.update(this.activeTabId, { url: url });
      
      // Wait for navigation
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  async executeClick(step) {
    const target = step.target || {};
    const locators = target.locators || [];
    
    console.log('Resolving locators for click:', locators);
    
    const selector = await this.resolveLocator(locators);
    if (selector) {
      console.log('Resolved selector:', selector);
      // Send click message to content script
      const response = await this.sendMessageToContentScript({
        type: 'REPLAY_CLICK',
        selector: selector
      });
      console.log('Click response:', response);
    } else {
      console.error('Could not resolve locators:', locators);
    }
  }
  
  async executeType(step) {
    const text = step.text || '';
    if (text) {
      console.log(`Starting typing animation for: "${text}"`);
      // Send type message to content script and wait for completion
      const response = await this.sendMessageToContentScript({
        type: 'REPLAY_TYPE',
        text: text
      });
      console.log('Typing response:', response);
    }
  }
  
  async executeKeyPress(step) {
    const key = step.key;
    if (key) {
      console.log(`Executing key press: ${key}`);
      // Send key press message to content script
      const response = await this.sendMessageToContentScript({
        type: 'REPLAY_KEY_PRESS',
        key: key
      });
      console.log('Key press response:', response);
    }
  }
  
  async resolveLocator(locators) {
    // Send locator resolution request to content script
    return new Promise((resolve) => {
      const messageId = Date.now();
      
      const handleResponse = (message) => {
        if (message.type === 'LOCATOR_RESOLVED' && message.messageId === messageId) {
          chrome.runtime.onMessage.removeListener(handleResponse);
          resolve(message.selector);
        }
      };
      
      chrome.runtime.onMessage.addListener(handleResponse);
      
      this.sendMessageToContentScript({
        type: 'RESOLVE_LOCATOR',
        locators: locators,
        messageId: messageId
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(handleResponse);
        resolve(null);
      }, 5000);
    });
  }
  
  highlightReplayStep(stepIndex) {
    // Remove previous highlights
    this.clearReplayHighlights();
    
    // Add highlight to current step
    const timelineItems = document.querySelectorAll('.timeline-item');
    console.log(`Highlighting step ${stepIndex}, found ${timelineItems.length} timeline items`);
    
    if (timelineItems[stepIndex]) {
      timelineItems[stepIndex].classList.add('replaying');
      console.log(`Highlighted step ${stepIndex}`);
    } else {
      console.warn(`Could not find timeline item for step ${stepIndex}`);
    }
  }
  
  clearReplayHighlights() {
    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach(item => {
      item.classList.remove('replaying');
    });
  }
  
  updateReplayProgress() {
    const progress = (this.currentReplayStep / this.replaySteps.length) * 100;
    document.getElementById('currentStep').textContent = this.currentReplayStep;
    document.getElementById('totalSteps').textContent = this.replaySteps.length;
    document.getElementById('progressBar').style.width = `${progress}%`;
    
    console.log(`Progress: ${this.currentReplayStep}/${this.replaySteps.length} (${progress.toFixed(1)}%)`);
  }
  
  updateReplayUI() {
    const playBtn = document.getElementById('playBtn');
    const replayControls = document.getElementById('replayControls');
    const replayProgress = document.getElementById('replayProgress');
    const status = document.getElementById('status');
    
    if (this.isReplaying) {
      playBtn.disabled = true;
      replayControls.style.display = 'flex';
      replayProgress.style.display = 'block';
      status.textContent = 'Replay ready - use Step button to advance';
      status.className = 'status replaying';
    } else {
      playBtn.disabled = this.replaySteps.length === 0;
      replayControls.style.display = 'none';
      replayProgress.style.display = 'none';
      status.textContent = this.steps.length > 0 ? 'Recording stopped' : 'Ready to record';
      status.className = 'status';
    }
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
      console.log('Sending message to content script:', message);
      
      // Ensure content script is injected before sending message
      await this.ensureContentScriptInjected();
      
      const response = await chrome.tabs.sendMessage(this.activeTabId, message);
      console.log('Received response from content script:', response);
      return response;
    } catch (error) {
      console.error('Failed to send message to content script:', error);
      
      // Try to re-inject content script and retry once
      try {
        console.log('Attempting to re-inject content script and retry...');
        await this.ensureContentScriptInjected();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        const retryResponse = await chrome.tabs.sendMessage(this.activeTabId, message);
        console.log('Retry successful, received response:', retryResponse);
        return retryResponse;
      } catch (retryError) {
        console.error('Retry also failed:', retryError);
        return null;
      }
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
  
  addTimelineItem(step, index = null) {
    const timeline = document.getElementById('timeline');
    
    // Remove empty state if it exists
    const emptyState = timeline.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
    
    const timelineItem = document.createElement('div');
    timelineItem.className = `timeline-item ${step.type}`;
    
    // Add data attribute for step index if provided
    if (index !== null) {
      timelineItem.setAttribute('data-step-index', index);
    }
    
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
    
    // Scroll to bottom
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
          case 'web-search':
            content = `Web Search Button`;
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
