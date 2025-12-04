const urlInput = document.getElementById('website-url');
const segmentRadios = document.querySelectorAll('input[name="segment"]');
const timeSlider = document.getElementById('time-slider');
const sliderFill = document.getElementById('slider-fill');
const sliderThumb = document.getElementById('slider-thumb');
const timeValue = document.getElementById('time-value');
const timeUnit = document.getElementById('time-unit');
const saveBtn = document.getElementById('save-btn');
const blockedList = document.getElementById('blocked-sites');

const segmentHoursMap = {
  2: 12,
  4: 6,
  6: 4,
  8: 3,
  12: 2
};

function updateSliderUI() {
  const value = parseInt(timeSlider.value);
  const max = parseInt(timeSlider.max);
  const percentage = ((value - 1) / (max - 1)) * 100;
  
  sliderFill.style.width = `${percentage}%`;
  sliderThumb.style.left = `${percentage}%`;
  
  timeValue.textContent = value;
  timeUnit.textContent = value === 1 ? 'hour' : 'hours';
}

function updateSliderRange(segments) {
  const maxHours = segmentHoursMap[segments];
  timeSlider.max = maxHours;
  
  const currentValue = parseInt(timeSlider.value);
  if (currentValue > maxHours) {
    timeSlider.value = maxHours;
  }
  
  updateSliderUI();
}

segmentRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    const segments = parseInt(e.target.value);
    updateSliderRange(segments);
  });
});

timeSlider.addEventListener('input', updateSliderUI);

saveBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  
  if (!url) {
    showNotification('Please enter a website URL', 'error');
    return;
  }
  
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    showNotification('Please enter a valid URL', 'error');
    return;
  }
  
  const selectedSegment = parseInt(document.querySelector('input[name="segment"]:checked').value);
  const unblockTime = parseInt(timeSlider.value);
  
  const blockRule = {
    url: normalizedUrl,
    segments: selectedSegment,
    unblockHours: unblockTime,
    segmentDuration: segmentHoursMap[selectedSegment],
    createdAt: Date.now()
  };
  
  try {
    const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
    
    const existingIndex = blockedSites.findIndex(site => site.url === normalizedUrl);
    if (existingIndex !== -1) {
      blockedSites[existingIndex] = blockRule;
    } else {
      blockedSites.push(blockRule);
    }
    
    await chrome.storage.local.set({ blockedSites });
    
    await chrome.runtime.sendMessage({ 
      action: 'updateBlockRules',
      sites: blockedSites
    });
    
    urlInput.value = '';
    showNotification('Block rule saved successfully!', 'success');
    loadBlockedSites();
  } catch (error) {
    console.error('Error saving block rule:', error);
    showNotification('Failed to save block rule', 'error');
  }
});

async function loadBlockedSites() {
  try {
    const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
    
    if (blockedSites.length === 0) {
      blockedList.innerHTML = '';
      return;
    }
    
    blockedList.innerHTML = blockedSites.map((site, index) => `
      <div class="blocked-item">
        <div class="blocked-info">
          <div class="blocked-url">${site.url}</div>
          <div class="blocked-meta">
            ${site.segments} segments • ${site.unblockHours}h unblock per segment
          </div>
        </div>
        <button class="delete-btn" data-index="${index}">Delete</button>
      </div>
    `).join('');
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', deleteBlockRule);
    });
  } catch (error) {
    console.error('Error loading blocked sites:', error);
  }
}

async function deleteBlockRule(e) {
  const index = parseInt(e.target.dataset.index);
  
  try {
    const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
    blockedSites.splice(index, 1);
    
    await chrome.storage.local.set({ blockedSites });
    
    await chrome.runtime.sendMessage({ 
      action: 'updateBlockRules',
      sites: blockedSites
    });
    
    showNotification('Block rule deleted', 'success');
    loadBlockedSites();
  } catch (error) {
    console.error('Error deleting block rule:', error);
    showNotification('Failed to delete block rule', 'error');
  }
}

function normalizeUrl(url) {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    return hostname;
  } catch (error) {
    return null;
  }
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? 'rgba(52, 199, 89, 0.9)' : 'rgba(255, 59, 48, 0.9)'};
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    z-index: 1000;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideDown 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  
  @keyframes slideUp {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
  }
`;
document.head.appendChild(style);

updateSliderUI();
loadBlockedSites();
