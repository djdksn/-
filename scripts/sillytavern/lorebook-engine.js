/**
 * Lorebook Matching Engine — Enhanced v3.
 * Supports: regex keys, timed effects, inclusion groups, character filters,
 * decorators, per-entry overrides, trigger filters, match targets, and more.
 */

// ========== Helpers ==========

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRegexKey(key) {
  if (typeof key !== 'string' || key.length < 3) return null;
  const match = key.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (!match) return null;
  try { return new RegExp(match[1], match[2]); } catch { return null; }
}

const REGEX_KEY_CACHE = new Map();

function getRegexKey(key) {
  if (REGEX_KEY_CACHE.has(key)) return REGEX_KEY_CACHE.get(key);
  const rx = parseRegexKey(key);
  REGEX_KEY_CACHE.set(key, rx);
  return rx;
}

export function clearRegexKeyCache() {
  REGEX_KEY_CACHE.clear();
}

// ========== Engine ==========

export class LorebookEngine {
  constructor(lorebook) {
    this.lorebook = lorebook;
  }

  // ---- Normalized helpers (respect per-entry override) ----

  _effectiveCaseSensitive(entry) {
    return entry.caseSensitive ?? this.lorebook.caseSensitive ?? false;
  }

  _effectiveMatchWholeWords(entry) {
    return entry.matchWholeWords ?? this.lorebook.matchWholeWords ?? false;
  }

  _normalize(text, entry) {
    if (!text) return '';
    return this._effectiveCaseSensitive(entry) ? text : text.toLowerCase();
  }

  _normalizeKeyword(keyword, entry) {
    return this._effectiveCaseSensitive(entry) ? keyword : keyword.toLowerCase();
  }

  // ---- Keyword Matching ----

  _matchesKeyword(text, keyword, entry) {
    const rx = getRegexKey(keyword);
    if (rx) {
      try { return rx.test(text); } catch { return false; }
    }

    const normKeyword = this._normalizeKeyword(keyword, entry);
    if (this._effectiveMatchWholeWords(entry)) {
      const regex = new RegExp('\\b' + escapeRegex(normKeyword) + '\\b', 'i');
      return regex.test(text);
    }
    return text.includes(normKeyword);
  }

  _containsKeyword(text, keyword, entry) {
    return this._matchesKeyword(text, keyword, entry);
  }

  // ---- Decorator Parsing ----

  _parseDecorators(content) {
    const decorators = [];
    if (content.includes('@@activate')) decorators.push('activate');
    if (content.includes('@@dont_activate')) decorators.push('dont_activate');
    return decorators;
  }

  _stripDecorators(content) {
    return content.replace(/@@activate|@@dont_activate/g, '').trim();
  }

  // ---- Entry Match Check ----

  _checkEntryMatch(entry, scanData) {
    const { text, additionalContexts, triggerFilter, characterName, characterTags } = scanData;
    const { keys, secondaryKeys, selective, selectiveLogic } = entry;

    const normalizedText = this._normalize(text, entry);
    const normalizedCtx = additionalContexts
      ? this._normalize([additionalContexts.personaDescription,
        additionalContexts.characterDescription,
        additionalContexts.characterPersonality,
        additionalContexts.scenario].filter(Boolean).join(' '), entry)
      : normalizedText;

    if (keys.length === 0) return false;

    // Check primary keys against main text
    let primaryOk = false;
    let primaryMatches = keys.map(k => this._matchesKeyword(normalizedText, k, entry));

    // Also check primary keys against match-target contexts
    if (entry.matchPersonaDescription && additionalContexts?.personaDescription) {
      const pText = this._normalize(additionalContexts.personaDescription, entry);
      primaryMatches = primaryMatches.map((m, i) => m || this._matchesKeyword(pText, keys[i], entry));
    }
    if (entry.matchCharacterDescription && additionalContexts?.characterDescription) {
      const cText = this._normalize(additionalContexts.characterDescription, entry);
      primaryMatches = primaryMatches.map((m, i) => m || this._matchesKeyword(cText, keys[i], entry));
    }
    if (entry.matchCharacterPersonality && additionalContexts?.characterPersonality) {
      const pText = this._normalize(additionalContexts.characterPersonality, entry);
      primaryMatches = primaryMatches.map((m, i) => m || this._matchesKeyword(pText, keys[i], entry));
    }
    if (entry.matchScenario && additionalContexts?.scenario) {
      const sText = this._normalize(additionalContexts.scenario, entry);
      primaryMatches = primaryMatches.map((m, i) => m || this._matchesKeyword(sText, keys[i], entry));
    }

    const anyPrimary = primaryMatches.some(m => m);
    const allPrimary = primaryMatches.every(m => m);

    switch (selectiveLogic) {
      case 'and_all': primaryOk = anyPrimary; break;
      case 'and_any': primaryOk = anyPrimary; break;
      case 'not_all': primaryOk = !allPrimary; break;
      case 'not_any': primaryOk = !anyPrimary; break;
      default: primaryOk = anyPrimary;
    }

    if (!primaryOk) return false;
    if (!selective || secondaryKeys.length === 0) return true;

    // Check secondary keys against context
    const secondaryMatches = secondaryKeys.map(k =>
      this._matchesKeyword(normalizedCtx, k, entry)
    );
    const allSecondary = secondaryMatches.every(m => m);
    const anySecondary = secondaryMatches.some(m => m);

    switch (selectiveLogic) {
      case 'and_all': return allSecondary;
      case 'not_all': return !allSecondary;
      case 'and_any': return anySecondary;
      case 'not_any': return !anySecondary;
      default: return anySecondary;
    }
  }

  // ---- Character Filter ----

  _checkCharacterFilter(entry, characterName, characterTags) {
    const filter = entry.characterFilter;
    if (!filter || (!filter.names?.length && !filter.tags?.length)) return true; // No filter, allow all

    const nameMatch = filter.names?.length > 0 && characterName
      ? filter.names.some(n => n.toLowerCase() === characterName.toLowerCase())
      : false;
    const tagMatch = filter.tags?.length > 0 && characterTags?.length > 0
      ? filter.tags.some(t => characterTags.some(ct => ct.toLowerCase() === t.toLowerCase()))
      : false;
    const anyMatch = nameMatch || tagMatch;

    return filter.isExclude ? !anyMatch : anyMatch;
  }

  // ---- Trigger Filter ----

  _checkTriggerFilter(entry, triggerFilter) {
    if (!entry.triggerFilter || entry.triggerFilter.length === 0) return true;
    if (!triggerFilter) return true;
    return entry.triggerFilter.includes(triggerFilter);
  }

  // ---- Main Scan ----

  /**
   * @param {string} text — text to scan
   * @param {object} [options]
   * @param {string} [options.additionalContext] — legacy single string
   * @param {object} [options.additionalContexts] — { personaDescription, characterDescription, characterPersonality, scenario }
   * @param {string} [options.characterName]
   * @param {string[]} [options.characterTags]
   * @param {string} [options.triggerFilter] — 'normal' | 'continue' | 'impersonate' | 'new_chat'
   * @param {Map} [options.state] — entryId → { activations, lastActivated, cooldownUntil }
   * @param {number} [options.depth] — current recursion depth
   * @param {number} [options.messageIndex] — for timed effects
   */
  scan(text, options = {}) {
    const {
      additionalContext,
      additionalContexts,
      characterName,
      characterTags,
      triggerFilter,
      state,
      depth = 0,
      messageIndex = 0,
    } = options;

    const matched = [];
    const scanData = {
      text,
      additionalContexts: additionalContexts || (additionalContext ? { personaDescription: additionalContext } : {}),
      triggerFilter,
      characterName,
      characterTags,
    };

    for (const entry of this.lorebook.entries) {
      // Skip disabled
      if (entry.disable || entry.excluded) continue;

      // Decorators first
      const decorators = entry.decorators || this._parseDecorators(entry.content || '');
      if (decorators.includes('dont_activate')) continue;
      if (decorators.includes('activate')) {
        matched.push({
          entry: { ...entry, content: this._stripDecorators(entry.content || '') },
          score: -9999,
          matchedKeywords: ['@@activate'],
        });
        continue;
      }

      // Constant
      if (entry.constant) {
        matched.push({
          entry: { ...entry, content: this._stripDecorators(entry.content || '') },
          score: -9998,
          matchedKeywords: ['constant'],
        });
        continue;
      }

      // Trigger filter
      if (!this._checkTriggerFilter(entry, triggerFilter)) continue;

      // Character filter
      if (!this._checkCharacterFilter(entry, characterName, characterTags)) continue;

      // Scan depth
      if (entry.scanDepth > 0 && depth > entry.scanDepth) continue;

      // Timed effects (state-based)
      if (state) {
        const st = state.get(entry.id);

        // Delay
        if (entry.delay > 0) {
          if (st?.firstMatchIndex !== undefined) {
            if (messageIndex - st.firstMatchIndex < entry.delay) continue;
          } else {
            state.set(entry.id, { firstMatchIndex: messageIndex, activations: 0, lastActivated: -1, cooldownUntil: -1 });
            continue;
          }
        }

        // Cooldown
        if (entry.cooldown > 0 && st?.cooldownUntil >= messageIndex) continue;

        // Sticky (still active)
        if (entry.sticky > 0 && st?.activations > 0 && (messageIndex - st.lastActivated) < entry.sticky) {
          matched.push({
            entry: { ...entry, content: this._stripDecorators(entry.content || '') },
            score: entry.order,
            matchedKeywords: entry.keys.filter(k =>
              this._matchesKeyword(this._normalize(text, entry), k, entry)
            ),
          });
          continue;
        }
      }

      // Probability
      if (entry.useProbability) {
        // Only roll once when state is fresh (no sticky active)
        const st = state?.get(entry.id);
        if (!st || st.activations === 0 || (entry.sticky > 0 && (messageIndex - st.lastActivated) >= entry.sticky)) {
          if (Math.random() * 100 >= entry.probability) continue;
        }
      } else {
        if (Math.random() * 100 >= entry.probability) continue;
      }

      // Key matching
      const isMatch = this._checkEntryMatch(entry, scanData);
      if (isMatch) {
        const strippedContent = this._stripDecorators(entry.content || '');
        matched.push({
          entry: { ...entry, content: strippedContent },
          score: entry.order,
          matchedKeywords: entry.keys.filter(k =>
            this._matchesKeyword(this._normalize(text, entry), k, entry)
          ),
        });

        // Update timed state
        if (state) {
          const st = state.get(entry.id) || { activations: 0, lastActivated: -1, cooldownUntil: -1, firstMatchIndex: messageIndex };
          st.activations = (st.activations || 0) + 1;
          st.lastActivated = messageIndex;
          st.cooldownUntil = entry.cooldown > 0 ? messageIndex + entry.cooldown : -1;
          state.set(entry.id, st);
        }
      }
    }

    // Post-scan: inclusion group resolution
    return this._resolveGroups(matched).sort((a, b) => a.score - b.score);
  }

  // ---- Inclusion Groups ----

  _resolveGroups(matched) {
    const groups = {};
    for (const m of matched) {
      const g = m.entry.group;
      if (!g) continue;
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    }

    const toRemove = new Set();
    for (const [groupName, members] of Object.entries(groups)) {
      if (members.length <= 1) continue;

      const hasOverride = members.some(m => m.entry.groupOverride);
      if (hasOverride) {
        // Keep all priority entries
        const nonOverride = members.filter(m => !m.entry.groupOverride);
        for (const m of nonOverride) toRemove.add(m.entry.id);
        continue;
      }

      if (members.some(m => m.entry.useGroupScoring)) {
        // Keep highest groupWeight
        const sorted = members.sort((a, b) => (b.entry.groupWeight || 100) - (a.entry.groupWeight || 100));
        const winner = sorted[0];
        for (const m of members) {
          if (m.entry.id !== winner.entry.id) toRemove.add(m.entry.id);
        }
      } else {
        // Random weighted selection
        const totalWeight = members.reduce((sum, m) => sum + (m.entry.groupWeight || 100), 0);
        let roll = Math.random() * totalWeight;
        let winner = members[0];
        for (const m of members) {
          roll -= (m.entry.groupWeight || 100);
          if (roll <= 0) { winner = m; break; }
        }
        for (const m of members) {
          if (m.entry.id !== winner.entry.id) toRemove.add(m.entry.id);
        }
      }
    }

    return matched.filter(m => !toRemove.has(m.entry.id));
  }

  // ---- Recursive Scan ----

  recursiveScan(initialText, maxDepth = 3, options = {}) {
    if (!this.lorebook.recursiveScanning || maxDepth <= 0) {
      return this.scan(initialText, options);
    }

    const allMatched = new Map();
    let currentText = initialText;
    let depth = 0;
    const state = options.state || new Map();

    while (depth < maxDepth) {
      const newMatches = this.scan(currentText, { ...options, depth, state });
      let hasNew = false;

      for (const match of newMatches) {
        const eid = match.entry.id;

        // Prevent recursion check
        if (match.entry.preventRecursion && depth > 0) {
          if (allMatched.has(eid)) continue; // Already activated in prior pass
        }

        if (!allMatched.has(eid)) {
          allMatched.set(eid, match);
          // Exclude recursion: don't feed content back
          if (!match.entry.excludeRecursion) {
            currentText += '\n' + match.entry.content;
          }
          hasNew = true;
        }
      }

      if (!hasNew) break;
      depth++;
    }

    return Array.from(allMatched.values()).sort((a, b) => a.score - b.score);
  }

  // ---- Position Grouping ----

  groupByPosition(matched) {
    const grouped = {
      before_char: [], after_char: [], before_example: [], after_example: [],
      at_depth: [], example_msg_top: [], example_msg_bottom: [], outlet: [],
    };
    for (const m of matched) {
      const pos = m.entry.position || 'after_char';
      if (grouped[pos]) grouped[pos].push(m);
    }
    return grouped;
  }

  formatEntriesContent(entries) {
    if (!entries || entries.length === 0) return '';
    return entries.map(e => e.entry.content).join('\n\n');
  }
}

export function createLorebookEngine(lorebook) {
  return new LorebookEngine(lorebook);
}
