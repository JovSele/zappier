import type { AuditResult, PerZapFinding, FlagCode } from './types/audit-schema';
import type { HandoffViewModel, ZapDescription, DependencyEntry, TroubleshootingEntry } from './handoffGenerator';

// ========================================
// HANDOFF VIEW MODEL MAPPER v1.0.0
// ========================================
// Transforms AuditResult (WASM output) → HandoffViewModel (client-facing Handoff PDF)
//
// Philosophy:
// - Rule-based only — no AI, no external calls
// - Plain English for non-technical clients
// - Never expose internal flag codes or technical jargon
// - Graceful fallbacks for missing/partial data
// ========================================

// ========================================
// PLAIN ENGLISH: TRIGGER TEMPLATES
// ========================================
// Rule: derive trigger description from zap_name heuristics + step count
// Since AuditResult doesn't include step-level app names, we derive from zap_name patterns.
// The mapper generates the best possible description from available data.

/**
 * Generate plain English trigger sentence from Zap name.
 * Pattern matching on common Zapier naming conventions.
 *
 * Examples:
 *   "New Gmail → Notion"     → "When a new email arrives in Gmail"
 *   "Typeform → Slack"       → "When a new form response is submitted in Typeform"
 *   "Schedule → Sheets"      → "On a recurring schedule"
 *   "Webhook → Airtable"     → "When a webhook request is received"
 */
function deriveTriggerDescription(zapName: string): string {
  const lower = zapName.toLowerCase();

  // Schedule/time-based triggers
  if (lower.includes('schedule') || lower.includes('every day') || lower.includes('daily') || lower.includes('weekly')) {
    return 'On a recurring schedule';
  }

  // Webhook triggers
  if (lower.includes('webhook') || lower.includes('catch hook')) {
    return 'When a webhook request is received from an external system';
  }

  // Email triggers
  if (lower.includes('gmail') || lower.includes('email') || lower.includes('mailchimp') || lower.includes('outlook')) {
    return 'When a new email arrives or is labeled in the email inbox';
  }

  // Form triggers
  if (lower.includes('typeform') || lower.includes('jotform') || lower.includes('gravity') || lower.includes('form')) {
    return 'When a new form response is submitted';
  }

  // CRM triggers
  if (lower.includes('hubspot') || lower.includes('salesforce') || lower.includes('pipedrive') || lower.includes('crm')) {
    return 'When a new contact, deal, or record is created or updated in the CRM';
  }

  // Stripe / payment triggers
  if (lower.includes('stripe') || lower.includes('payment') || lower.includes('invoice') || lower.includes('gumroad')) {
    return 'When a new payment or subscription event occurs';
  }

  // Airtable / database triggers
  if (lower.includes('airtable') || lower.includes('notion') || lower.includes('database')) {
    return 'When a new record is created or updated in the database';
  }

  // Slack triggers
  if (lower.includes('slack') && (lower.includes('new message') || lower.includes('mention'))) {
    return 'When a new message or mention appears in a Slack channel';
  }

  // Google Sheets triggers
  if (lower.includes('sheet') || lower.includes('spreadsheet')) {
    return 'When a new or updated row appears in the spreadsheet';
  }

  // Shopify / ecommerce
  if (lower.includes('shopify') || lower.includes('woocommerce') || lower.includes('order')) {
    return 'When a new order or customer event occurs in the store';
  }

  // Calendly / booking
  if (lower.includes('calendly') || lower.includes('booking') || lower.includes('acuity')) {
    return 'When a new meeting or appointment is booked';
  }

  // RSS / content
  if (lower.includes('rss') || lower.includes('feed')) {
    return 'When a new item appears in the RSS feed';
  }

  // Wordpress / 
  if (lower.includes('wordpress')) {
  return 'When a new post, page, or comment is published in WordPress'
}

  // Fallback
  return 'When the trigger condition is met in the source application';
}

/**
 * Generate plain English action sentence from Zap name.
 * Looks for the destination app (after "→" or "to" pattern).
 */
function deriveActionDescription(zapName: string): string {
  const lower = zapName.toLowerCase();

  // Try to extract destination from "X → Y" or "X to Y" naming
  const arrowMatch = zapName.match(/→\s*(.+)$/);
  const toMatch = zapName.match(/\bto\s+([A-Z][a-zA-Z\s]+)$/);

  const destination = arrowMatch?.[1]?.trim() || toMatch?.[1]?.trim();

  if (destination) {
    const dest = destination.toLowerCase();

    if (dest.includes('slack')) return `Send a notification to the Slack channel`;
    if (dest.includes('gmail') || dest.includes('email')) return `Send an email via Gmail`;
    if (dest.includes('notion')) return `Create or update a page in Notion`;
    if (dest.includes('airtable')) return `Add or update a record in Airtable`;
    if (dest.includes('sheet') || dest.includes('spreadsheet')) return `Add a row to the Google Sheet`;
    if (dest.includes('hubspot') || dest.includes('salesforce')) return `Create or update a record in the CRM`;
    if (dest.includes('trello')) return `Create a card in Trello`;
    if (dest.includes('asana') || dest.includes('monday') || dest.includes('clickup') || dest.includes('jira')) return `Create a task in the project management tool`;
    if (dest.includes('drive')) return `Save a file to Google Drive`;
    if (dest.includes('calendar')) return `Create an event in Google Calendar`;
    if (dest.includes('mailchimp') || dest.includes('klaviyo')) return `Add or tag a subscriber in the email marketing tool`;
    if (dest.includes('twilio') || dest.includes('sms')) return `Send an SMS message`;
    if (dest.includes('webhook') || dest.includes('http')) return `Send data to an external system via HTTP request`;
    if (dest.includes('reddit')) return 'Create a post or comment on Reddit'
    if (dest.includes('twitter') || dest.includes('x.com')) return 'Post a tweet or update on Twitter/X'
    if (dest.includes('linkedin')) return 'Publish a post on LinkedIn'
    if (dest.includes('discord')) return 'Send a message to a Discord channel'

    return `Perform an action in ${destination}`;
  }

  // Destination-based fallbacks from full name
  if (lower.includes('notify') || lower.includes('slack') || lower.includes('alert')) {
    return 'Send a notification to the team';
  }
  if (lower.includes('sheet') || lower.includes('log') || lower.includes('record')) {
    return 'Log the data to a spreadsheet or database';
  }
  if (lower.includes('email') || lower.includes('send')) {
    return 'Send an email notification';
  }
  if (lower.includes('create') || lower.includes('add')) {
    return 'Create a new record in the destination app';
  }

  return 'Perform the configured action in the destination application';
}

/**
 * Extract connected app names from Zap name (best effort, no step-level data).
 * Parses "App1 → App2" or "App1 to App2" patterns.
 */
function extractConnectedApps(zapName: string): string[] {
  // Try arrow separator
  const arrowParts = zapName.split('→').map(s => s.trim()).filter(Boolean);
  if (arrowParts.length >= 2) {
    // Clean up each part (remove trailing/leading junk)
    return arrowParts.map(p => p.split(/[-_]/)[0].trim()).filter(p => p.length > 1);
  }

  // Detect known app names in zap name
  const knownApps = [
    'Gmail', 'Slack', 'Notion', 'Airtable', 'HubSpot', 'Salesforce',
    'Typeform', 'JotForm', 'Stripe', 'Shopify', 'Trello', 'Asana',
    'Monday', 'ClickUp', 'Jira', 'Google Sheets', 'Google Drive',
    'Google Calendar', 'Mailchimp', 'Klaviyo', 'Twilio', 'Calendly',
    'Pipedrive', 'Webflow', 'WordPress', 'Zapier', 'Webhook', 'RSS',
    'Reddit', 'Twitter', 'LinkedIn', 'Facebook', 'Instagram',  
    'Dropbox', 'OneDrive', 'Zoom', 'Teams', 'Discord', 'Telegram', 
  ];

  const found = knownApps.filter(app =>
    zapName.toLowerCase().includes(app.toLowerCase())
  );

  return found.length > 0 ? found : ['Zapier'];
}

/**
 * Estimate frequency from monthly task count.
 * Converts raw task number to human-readable frequency.
 */
function deriveFrequency(monthlyTasks: number, status: string): string {
  if (status === 'off') return 'Currently inactive (Zap is turned off)';
  if (monthlyTasks === 0) return 'Not running recently (0 tasks last month)';
  if (monthlyTasks < 5) return `Runs rarely (~${monthlyTasks} times/month)`;
  if (monthlyTasks < 30) return `Runs occasionally (~${monthlyTasks} times/month)`;
  if (monthlyTasks < 100) return `Runs regularly (~${monthlyTasks} times/month)`;
  if (monthlyTasks < 500) return `Runs frequently (~${monthlyTasks} times/month)`;
  return `High-volume automation (~${monthlyTasks} tasks/month)`;
}

// ========================================
// PLAIN ENGLISH: TROUBLESHOOTING RULES
// ========================================

/**
 * Known failure patterns per app.
 * Rule-based — derived from common Zapier support issues.
 */
const APP_FAILURE_PATTERNS: Record<string, { issue: string; resolution: string }> = {
  gmail: {
    issue: 'Stops working when the Gmail connection token expires (usually every 6 months)',
    resolution: 'Go to Zapier Connected Accounts → Gmail → Reconnect. Takes 2 minutes.',
  },
  google: {
    issue: 'Google connection can expire or lose permissions after password changes',
    resolution: 'Reconnect the Google account in Zapier Connected Accounts settings.',
  },
  slack: {
    issue: 'Fails if the Slack bot is removed from the channel or workspace',
    resolution: 'Re-invite the Zapier bot to the channel and reconnect Slack in Zapier.',
  },
  notion: {
    issue: 'Breaks if the connected Notion page or database is moved or deleted',
    resolution: 'Update the Zap to point to the new Notion database location.',
  },
  airtable: {
    issue: 'Fails when Airtable field names are renamed or column structure changes',
    resolution: 'Edit the Zap and re-map the fields to match the updated Airtable structure.',
  },
  hubspot: {
    issue: 'Connection may break after HubSpot permission changes or portal migrations',
    resolution: 'Reconnect HubSpot in Zapier and verify the API key has the required scopes.',
  },
  salesforce: {
    issue: 'Stops when Salesforce session tokens expire or IP restrictions are applied',
    resolution: 'Reconnect Salesforce with an admin account and whitelist Zapier IPs.',
  },
  stripe: {
    issue: 'Test mode vs live mode mismatch can cause silent failures',
    resolution: 'Verify the Stripe connection in Zapier is using the live API key, not test key.',
  },
  shopify: {
    issue: 'Webhook triggers can miss events during Shopify maintenance windows',
    resolution: 'Check Zap history for errors after Shopify updates and re-test the trigger.',
  },
  webhook: {
    issue: 'Breaks if the sending system changes the payload structure or URL',
    resolution: 'Re-test the webhook trigger in Zapier to capture the new payload format.',
  },
  typeform: {
    issue: 'Stops if the Typeform is unpublished, deleted, or its fields are renamed',
    resolution: 'Ensure the Typeform is published and re-map any renamed fields in the Zap.',
  },
  calendly: {
    issue: 'Fails when Calendly event types are deleted or the account is reconnected',
    resolution: 'Reconnect Calendly and select the correct event type in the Zap trigger.',
  },
  wordpress: {
    issue: 'Stops working if the WordPress site URL changes or the Zapier plugin is deactivated',
    resolution: 'Verify the Zapier plugin is active in WordPress and reconnect the account in Zapier Connected Accounts.',
  },
  reddit: {
    issue: 'Reddit API connection can break after Reddit policy changes or token expiry',
    resolution: 'Reconnect the Reddit account in Zapier Connected Accounts and re-authorize the app.',
  },
};

/**
 * Generate troubleshooting entries for a Zap based on its name and flags.
 * Returns the single most likely failure mode (keep it simple for clients).
 */
function generateTroubleshootingEntry(zap: PerZapFinding): TroubleshootingEntry | null {
  const lower = zap.zap_name.toLowerCase();
  const displayName = getDisplayName(zap);

  // Check known app patterns
  for (const [appKey, pattern] of Object.entries(APP_FAILURE_PATTERNS)) {
    if (lower.includes(appKey)) {
      return {
        zapName: displayName,
        commonIssue: pattern.issue,
        resolution: pattern.resolution,
      };
    }
  }

  // Flag-based fallbacks
  const hasFlagCode = (code: FlagCode) => zap.flags.some(f => f.code === code);

  if (zap.is_zombie) {
    return {
      zapName: zap.zap_name,
      commonIssue: 'This automation is turned on but has not run recently',
      resolution: 'Check the Zap history in Zapier to see if there are errors. If unused, consider turning it off.',
    };
  }

  if (hasFlagCode('LATE_FILTER')) {
    return {
      zapName: zap.zap_name,
      commonIssue: 'Automation runs unnecessary steps before checking filter conditions',
      resolution: 'Move the Filter step closer to the beginning of the Zap to skip unnecessary work.',
    };
  }

  if (hasFlagCode('FORMATTER_CHAIN')) {
    return {
      zapName: zap.zap_name,
      commonIssue: 'Multiple formatting steps can cause unexpected results if one fails',
      resolution: 'Consolidate into a single Formatter step. If one step is wrong, it\'s easier to find and fix.',
    };
  }

  // Generic fallback for flagged zaps
  if (zap.flags.length > 0) {
    return {
      zapName: zap.zap_name,
      commonIssue: 'Automation has structural inefficiencies that may cause intermittent failures',
      resolution: 'Review the Zap steps in Zapier and check the task history for recent errors.',
    };
  }

  // Skip zaps with no flags and no known patterns — no troubleshooting needed
  return null;
}

// ========================================
// DEPENDENCY MAP
// ========================================

/**
 * Build dependency entries.
 * AuditResult has no explicit inter-zap dependency data,
 * so we derive from naming patterns (e.g., "Step 1/2", shared app names).
 * Also lists external services each Zap connects to.
 */
function buildDependencyEntries(zaps: PerZapFinding[]): DependencyEntry[] {
  // For now: each Zap is independent (AuditResult v1.0.0 has no dependency graph).
  // We list connected apps as external dependencies.
  // Future: when WASM exposes step-level app data, this can be enriched.

  return zaps
    .filter(zap => !zap.is_zombie) // skip zombies from dependency map
    .map(zap => {
      const connectedApps = extractConnectedApps(zap.zap_name);
      return {
        zapName: getDisplayName(zap),
        dependsOn: connectedApps.length > 0 ? connectedApps.slice(0, 1) : [], // trigger app
        feedsInto: connectedApps.length > 1 ? connectedApps.slice(1) : [],    // action apps
      };
    })
    .filter(dep => dep.dependsOn.length > 0 || dep.feedsInto.length > 0);
}

// ========================================
// STACK PURPOSE GENERATOR
// ========================================

/**
 * Generate a plain English summary of what the entire automation stack does.
 * Rule-based: counts apps, detects dominant patterns.
 */
function generateStackPurpose(zaps: PerZapFinding[]): string {
  const activeZaps = zaps.filter(z => z.status === 'on' && !z.is_zombie);
  const total = zaps.length;
  const active = activeZaps.length;

  if (total === 0) return 'No automations were found in this account.';

  // Detect dominant app categories
  const allNames = zaps.map(z => z.zap_name.toLowerCase()).join(' ');

  const hasCRM = /hubspot|salesforce|pipedrive|crm/.test(allNames);
  const hasNotifications = /slack|email|gmail|notify|alert/.test(allNames);
  const hasData = /sheet|airtable|notion|database|log/.test(allNames);
  const hasPayments = /stripe|payment|invoice|shopify/.test(allNames);
  const hasForms = /typeform|jotform|form|calendly|booking/.test(allNames);

  const purposes: string[] = [];
  if (hasCRM) purposes.push('managing contacts and deals in the CRM');
  if (hasNotifications) purposes.push('sending team notifications and alerts');
  if (hasData) purposes.push('logging and syncing data across tools');
  if (hasPayments) purposes.push('processing payments and order events');
  if (hasForms) purposes.push('handling form submissions and bookings');

  const purposeStr = purposes.length > 0
    ? purposes.join(', ')
    : 'connecting and automating various business tools';

  return `This account runs ${total} automation${total !== 1 ? 's' : ''} (${active} currently active), primarily focused on ${purposeStr}. These automations reduce manual work by automatically moving data and triggering actions between connected apps.`;
}

// ========================================
// HANDOFF CHECKLIST GENERATOR
// ========================================

/**
 * Generate a handoff checklist based on the audit data.
 * Categories: ACCESS, TEST, VERIFY, DOCUMENT
 */
function generateChecklist(
  auditResult: AuditResult
): HandoffViewModel['checklist'] {
  const items: HandoffViewModel['checklist'] = [];

  // ── ACCESS ──────────────────────────────
  items.push({
    category: 'ACCESS',
    step: 'Log in to Zapier with the account credentials and confirm you can see all Zaps listed in this report',
  });

  // Add reconnect steps for known apps
  const allNames = auditResult.per_zap_findings.map(z => z.zap_name.toLowerCase()).join(' ');

  if (/gmail|google/.test(allNames)) {
    items.push({ category: 'ACCESS', step: 'Verify the Gmail / Google account connection is active in Zapier → Connected Accounts' });
  }
  if (/slack/.test(allNames)) {
    items.push({ category: 'ACCESS', step: 'Verify the Slack connection is active and the Zapier bot has access to the required channels' });
  }
  if (/hubspot|salesforce|pipedrive/.test(allNames)) {
    items.push({ category: 'ACCESS', step: 'Verify the CRM connection is active and the API key has the required permissions' });
  }
  if (/airtable|notion/.test(allNames)) {
    items.push({ category: 'ACCESS', step: 'Verify Airtable / Notion connection is active and points to the correct bases/databases' });
  }
  if (/stripe|shopify/.test(allNames)) {
    items.push({ category: 'ACCESS', step: 'Verify Stripe / Shopify connection is using the live API key (not test mode)' });
  }

  // ── TEST ─────────────────────────────────
  const activeZaps = auditResult.per_zap_findings.filter(z => z.status === 'on' && !z.is_zombie);
  const topZaps = activeZaps.slice(0, 3);

  topZaps.forEach(zap => {
    items.push({
      category: 'TEST',
      step: `Trigger a test run for "${zap.zap_name}" and confirm it completes without errors in Zap History`,
    });
  });

  if (activeZaps.length > 3) {
    items.push({
      category: 'TEST',
      step: `Review Zap History for the remaining ${activeZaps.length - 3} active automations and confirm no recent errors`,
    });
  }

  // ── VERIFY ───────────────────────────────
  items.push({
    category: 'VERIFY',
    step: 'Check the Zapier Task History (last 7 days) for any failed tasks and investigate errors before handoff',
  });

  if (auditResult.global_metrics.zombie_zap_count > 0) {
    items.push({
      category: 'VERIFY',
      step: `Review ${auditResult.global_metrics.zombie_zap_count} inactive automation(s) flagged in the audit — decide whether to reactivate or permanently disable them`,
    });
  }

  items.push({
    category: 'VERIFY',
    step: 'Confirm that all destination apps (Slack channels, Notion databases, Sheets) still exist and are correctly linked',
  });

  // ── DOCUMENT ─────────────────────────────
  items.push({
    category: 'DOCUMENT',
    step: 'Save this Handoff Report in the shared team documentation folder (Notion, Drive, or Confluence)',
  });
  items.push({
    category: 'DOCUMENT',
    step: 'Note the date of handoff and the name of the new owner in the team documentation',
  });
  items.push({
    category: 'DOCUMENT',
    step: 'Store the Zapier account login credentials securely in the team password manager (1Password, Bitwarden, etc.)',
  });

  return items;
}

// ========================================
// CONNECTED APPS: DEDUPLICATION
// ========================================

function getAllConnectedApps(zaps: PerZapFinding[]): string[] {
  const apps = new Set<string>();
  zaps.forEach(zap => {
    extractConnectedApps(zap.zap_name).forEach(app => apps.add(app));
  });
  return Array.from(apps).sort();
}

// ========================================
// DISPLAY NAME HELPER (mirrors pdfViewModelMapper)
// ========================================

function getDisplayName(zap: PerZapFinding): string {
  if (zap.zap_name === 'Untitled Zap') {
    const shortId = zap.zap_id.slice(-4);
    return `Zap #${shortId} (Unnamed)`;
  }
  return zap.zap_name;
}

// ========================================
// MAIN MAPPER
// ========================================

/**
 * Transform AuditResult → HandoffViewModel
 * Entry point called from the Handoff generation flow.
 */
export function mapAuditToHandoffViewModel(
  auditResult: AuditResult,
  reportCode: string
): HandoffViewModel {

  const zaps = auditResult.per_zap_findings;

  // ── ZAP DESCRIPTIONS (core value) ───────
  const zapDescriptions: ZapDescription[] = zaps.map(zap => ({
    zapName: getDisplayName(zap),
    trigger: deriveTriggerDescription(zap.zap_name),
    action: deriveActionDescription(zap.zap_name),
    frequency: deriveFrequency(zap.metrics.monthly_tasks, zap.status),
    connectedApps: extractConnectedApps(zap.zap_name),
    notes: zap.is_zombie
      ? 'This automation is currently inactive — it is turned on but has not executed recently.'
      : zap.warnings.length > 0
        ? zap.warnings[0].message   // surface first warning as note
        : undefined,
  }));

  // ── DEPENDENCY MAP ───────────────────────
  const dependencies: DependencyEntry[] = buildDependencyEntries(zaps);

  // ── TROUBLESHOOTING ──────────────────────
  const troubleshooting: TroubleshootingEntry[] = zaps
  .map(generateTroubleshootingEntry)
  .filter((entry): entry is TroubleshootingEntry => entry !== null)
  .map(entry => ({           
    ...entry,
    zapName: getDisplayName(zaps.find(z => z.zap_name === entry.zapName || 
      getDisplayName(z) === entry.zapName)!),
  }))
  .filter((entry, idx, arr) => arr.findIndex(e => e.zapName === entry.zapName) === idx);

  // ── CHECKLIST ────────────────────────────
  const checklist = generateChecklist(auditResult);

  // ── SUMMARY ──────────────────────────────
  const stackPurpose = generateStackPurpose(zaps);
  const connectedApps = getAllConnectedApps(zaps);

  // ── ASSEMBLE ─────────────────────────────
  return {
    report: {
      reportId: reportCode,
      generatedAt: auditResult.audit_metadata.generated_at,
    },

    summary: {
      totalZaps: auditResult.global_metrics.total_zaps,
      activeZaps: auditResult.global_metrics.active_zaps,
      connectedApps,
      stackPurpose,
    },

    zaps: zapDescriptions,
    dependencies,
    troubleshooting,
    checklist,
  };
}