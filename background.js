const SEGMENT_HOURS_MAP = {
  2: 12,
  4: 6,
  6: 4,
  8: 3,
  12: 2
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('BlockBySegment installed');
  initializeAlarms();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBlockRules') {
    updateDeclarativeRules(message.sites);
    sendResponse({ success: true });
  }
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkSegmentReset') {
    resetSegmentTimers();
  }
});

function initializeAlarms() {
  chrome.alarms.create('checkSegmentReset', {
    periodInMinutes: 1
  });
}

async function getCurrentSegment(segments) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  
  const hoursSinceStart = (now - startOfDay) / (1000 * 60 * 60);
  const segmentDuration = SEGMENT_HOURS_MAP[segments];
  const currentSegment = Math.floor(hoursSinceStart / segmentDuration);
  
  return {
    segmentIndex: currentSegment,
    segmentDuration: segmentDuration,
    segmentStartTime: startOfDay.getTime() + (currentSegment * segmentDuration * 60 * 60 * 1000)
  };
}

async function getUsageForCurrentSegment(url, segmentInfo) {
  const storageKey = `usage_${url}_${segmentInfo.segmentStartTime}`;
  const result = await chrome.storage.local.get(storageKey);
  return result[storageKey] || 0;
}

async function updateUsage(url, segmentInfo, minutes) {
  const storageKey = `usage_${url}_${segmentInfo.segmentStartTime}`;
  const currentUsage = await getUsageForCurrentSegment(url, segmentInfo);
  await chrome.storage.local.set({ [storageKey]: currentUsage + minutes });
}

async function shouldBlockSite(url, rule) {
  const segmentInfo = await getCurrentSegment(rule.segments);
  const usageMinutes = await getUsageForCurrentSegment(url, segmentInfo);
  const unblockMinutes = rule.unblockHours * 60;
  
  return usageMinutes >= unblockMinutes;
}

async function updateDeclarativeRules(sites) {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(rule => rule.id);
    
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds
      });
    }
    
    const newRules = [];
    
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const shouldBlock = await shouldBlockSite(site.url, site);
      
      if (shouldBlock) {
        newRules.push({
          id: i + 1,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              url: chrome.runtime.getURL('blocked.html') + '?url=' + encodeURIComponent(site.url)
            }
          },
          condition: {
            urlFilter: `*://*.${site.url}/*`,
            resourceTypes: ['main_frame']
          }
        });
      }
    }
    
    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules
      });
    }
  } catch (error) {
    console.error('Error updating declarative rules:', error);
  }
}

async function resetSegmentTimers() {
  try {
    const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
    
    if (blockedSites.length > 0) {
      await updateDeclarativeRules(blockedSites);
    }
  } catch (error) {
    console.error('Error resetting segment timers:', error);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
      
      const url = new URL(tab.url);
      let hostname = url.hostname;
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      
      const matchedRule = blockedSites.find(site => hostname.includes(site.url));
      
      if (matchedRule) {
        const segmentInfo = await getCurrentSegment(matchedRule.segments);
        await updateUsage(matchedRule.url, segmentInfo, 1);
        
        const shouldBlock = await shouldBlockSite(matchedRule.url, matchedRule);
        if (shouldBlock) {
          await updateDeclarativeRules(blockedSites);
        }
      }
    } catch (error) {
      console.error('Error tracking usage:', error);
    }
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.blockedSites) {
    updateDeclarativeRules(changes.blockedSites.newValue || []);
  }
});
