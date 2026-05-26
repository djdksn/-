/**
 * Streaming XML tag parser for AI responses.
 * State machine: NORMAL → BUFFER_TAG → TAGGED/OPAQUE
 */

const PARTIAL_LIMIT = 64;

export class StreamTagParser {
  constructor(tags, opaqueTags) {
    this._tags = tags;
    this._opaqueTags = opaqueTags;
    this._state = 'NORMAL';
    this._partial = '';
    this._currentTag = '';
    this._currentBuf = '';
    this._optionBuf = '';
    this._events = [];
    this._rawBuf = '';
  }

  feed(chunk) {
    this._events = [];
    for (const ch of chunk) this._consumeChar(ch);
    return this._events;
  }

  finish() {
    this._events = [];
    if (this._state === 'BUFFER_TAG' && this._partial) {
      this._events.push({ type: 'raw', chunk: '<' + this._partial });
      this._partial = '';
    }
    if (this._state === 'TAGGED' || this._state === 'OPAQUE') {
      if (this._state === 'TAGGED' && this._currentTag === 'option' && this._optionBuf) {
        this._events.push({ type: 'option-line', line: this._optionBuf });
        this._optionBuf = '';
      }
      this._events.push({ type: 'tag-close', tag: this._currentTag, full: this._currentBuf });
      this._currentBuf = '';
      this._currentTag = '';
    }
    this._state = 'NORMAL';
    return this._events;
  }

  _consumeChar(ch) {
    if (this._state === 'NORMAL') {
      if (ch === '<') {
        this._state = 'BUFFER_TAG';
        this._partial = '';
      } else {
        this._events.push({ type: 'raw', chunk: ch });
      }
      return;
    }
    if (this._state === 'BUFFER_TAG') {
      if (ch === '>') {
        this._flushTagBuffer();
        return;
      }
      if (this._partial.length >= PARTIAL_LIMIT) {
        this._events.push({ type: 'raw', chunk: '<' + this._partial + ch });
        this._partial = '';
        this._state = 'NORMAL';
        return;
      }
      this._partial += ch;
      return;
    }
    if (this._state === 'OPAQUE') {
      this._currentBuf += ch;
      const closeMarker = `</${this._currentTag}>`;
      if (this._currentBuf.endsWith(closeMarker)) {
        const full = this._currentBuf.slice(0, -closeMarker.length);
        this._events.push({ type: 'tag-chunk', tag: this._currentTag, chunk: ch });
        this._events.push({ type: 'tag-close', tag: this._currentTag, full });
        this._state = 'NORMAL';
        this._currentBuf = '';
        this._currentTag = '';
      } else {
        this._events.push({ type: 'tag-chunk', tag: this._currentTag, chunk: ch });
      }
      return;
    }
    if (this._state === 'TAGGED') {
      if (ch === '<') {
        this._state = 'BUFFER_TAG';
        this._partial = '';
        return;
      }
      if (this._currentTag === 'option' && ch === '\n') {
        this._events.push({ type: 'option-line', line: this._optionBuf });
        this._optionBuf = '';
      } else if (this._currentTag === 'option') {
        this._optionBuf += ch;
      }
      this._currentBuf += ch;
      this._events.push({ type: 'tag-chunk', tag: this._currentTag, chunk: ch });
      return;
    }
  }

  _flushTagBuffer() {
    const tagText = this._partial;
    this._partial = '';
    const isClose = tagText.startsWith('/');
    const name = isClose ? tagText.slice(1) : tagText;

    if (isClose) {
      if (this._currentTag && this._currentTag === name) {
        if (this._currentTag === 'option' && this._optionBuf) {
          this._events.push({ type: 'option-line', line: this._optionBuf });
          this._optionBuf = '';
        }
        this._events.push({ type: 'tag-close', tag: this._currentTag, full: this._currentBuf });
        this._currentBuf = '';
        this._currentTag = '';
        this._state = 'NORMAL';
      } else {
        this._events.push({ type: 'raw', chunk: `</${name}>` });
        this._state = 'NORMAL';
      }
      return;
    }

    if (!this._tags.includes(name)) {
      this._events.push({ type: 'raw', chunk: `<${name}>` });
      this._state = 'NORMAL';
      return;
    }

    this._currentTag = name;
    this._currentBuf = '';
    this._optionBuf = '';
    this._events.push({ type: 'tag-open', tag: name });
    this._state = this._opaqueTags.includes(name) ? 'OPAQUE' : 'TAGGED';
  }
}
