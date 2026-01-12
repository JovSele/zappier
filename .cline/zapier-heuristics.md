# ZAPIER AUDIT HEURISTICS

When analyzing Zapier ZIP exports, focus on these patterns:

## 1. Task Waste (Economic Impact)
- **Inefficient Polling:** High frequency checks on triggers that rarely return data.
- **Filter Overuse:** Zaps that trigger frequently but 90% of runs are stopped by a filter (should be moved to the source or use Webhooks).
- **Paths vs. Logic:** Identify complex Paths that could be simplified.

## 2. Operational Risks
- **Error Loops:** Zaps with "Autoreplay" enabled that fail repeatedly.
- **Single Point of Failure:** Critical Zaps without error handling steps.
- **Legacy Apps:** Usage of deprecated Zapier integrations.

## 3. Optimization Opportunities
- **Webhook Migration:** Identify Polling triggers that can be replaced by REST Hooks.
- **Formatting Bloat:** Excessive "Formatter" steps that can be combined into one Script/Code step.
- **App Switching:** Identify flows that are better suited for Make.com (e.g., heavy data manipulation).