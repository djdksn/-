/**
 * Lorebook Matching Engine
 */

export class LorebookEngine {
  constructor(lorebook) {
    this.lorebook = lorebook;
  }

  scan(text, additionalContext) {
    const normalizedText = this.lorebook.caseSensitive ? text : text.toLowerCase();
    const normalizedContext = additionalContext
      ? this.lorebook.caseSensitive ? additionalContext : additionalContext.toLowerCase()
      : normalizedText;

    const matched = [];

    for (const entry of this.lorebook.entries) {
      if (entry.constant) {
        matched.push({ entry, score: -9999, matchedKeywords: ['constant'] });
        continue;
      }

      if (Math.random() * 100 >= entry.probability) continue;

      const isMatch = this._checkEntryMatch(entry, normalizedText, normalizedContext);
      if (isMatch) {
        matched.push({
          entry,
          score: entry.order,
          matchedKeywords: entry.keys.filter(k =>
            this._containsKeyword(normalizedText, this._normalizeKeyword(k))
          ),
        });
      }
    }

    return matched.sort((a, b) => a.score - b.score);
  }

  recursiveScan(initialText, maxDepth = 3, additionalContext) {
    if (!this.lorebook.recursiveScanning || maxDepth <= 0) {
      return this.scan(initialText, additionalContext);
    }

    const allMatched = new Map();
    let currentText = initialText;
    let depth = 0;

    while (depth < maxDepth) {
      const newMatches = this.scan(currentText, additionalContext);
      let hasNewMatches = false;

      for (const match of newMatches) {
        if (!allMatched.has(match.entry.id)) {
          allMatched.set(match.entry.id, match);
          currentText += ' ' + match.entry.content;
          hasNewMatches = true;
        }
      }

      if (!hasNewMatches) break;
      depth++;
    }

    return Array.from(allMatched.values()).sort((a, b) => a.score - b.score);
  }

  groupByPosition(matched) {
    const grouped = {
      before_char: [], after_char: [], before_example: [], after_example: [],
      at_depth: [], example_msg_top: [], example_msg_bottom: [], outlet: [],
    };
    for (const m of matched) {
      grouped[m.entry.position].push(m);
    }
    return grouped;
  }

  formatEntriesContent(entries) {
    if (entries.length === 0) return '';
    return entries.map(e => e.entry.content).join('\n\n');
  }

  _checkEntryMatch(entry, text, context) {
    const { keys, secondaryKeys, selective, selectiveLogic } = entry;
    if (keys.length === 0) return false;

    const primaryMatches = keys.map(k => this._containsKeyword(text, this._normalizeKeyword(k)));
    const anyPrimary = primaryMatches.some(m => m);
    const allPrimary = primaryMatches.every(m => m);

    let primaryOk;
    switch (selectiveLogic) {
      case 'and_all':
      case 'and_any':
        primaryOk = anyPrimary;
        break;
      case 'not_all':
        primaryOk = !allPrimary;
        break;
      case 'not_any':
        primaryOk = !anyPrimary;
        break;
      default:
        primaryOk = anyPrimary;
    }

    if (!primaryOk) return false;
    if (!selective || secondaryKeys.length === 0) return primaryOk;

    const secondaryMatches = secondaryKeys.map(k =>
      this._containsKeyword(context, this._normalizeKeyword(k))
    );
    const allSecondary = secondaryMatches.every(m => m);
    const anySecondary = secondaryMatches.some(m => m);

    switch (selectiveLogic) {
      case 'and_all': return allSecondary;
      case 'not_all': return allSecondary;
      case 'and_any':
      case 'not_any':
      default: return anySecondary;
    }
  }

  _normalizeKeyword(keyword) {
    return this.lorebook.caseSensitive ? keyword : keyword.toLowerCase();
  }

  _containsKeyword(text, keyword) {
    if (this.lorebook.matchWholeWords) {
      const regex = new RegExp(`\\b${this._escapeRegex(keyword)}\\b`, 'i');
      return regex.test(text);
    }
    return text.includes(keyword);
  }

  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export function createLorebookEngine(lorebook) {
  return new LorebookEngine(lorebook);
}
