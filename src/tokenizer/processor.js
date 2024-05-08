import {
  CODE_POINTS as $,
  getSurrogatePairCodePoint,
  isControlCodePoint,
  isSurrogate,
  isSurrogatePair,
  isUndefinedCodePoint,
  Err,
} from "../common/index.js";
/**
 * 逐个字符解析html
 * @example
 * const processor = new Processor({ onParseError: () => {} });
 * const html = `Hello World!`
 * processor.write(html, true);
 * let cp = preprocessor.advance();
 * while(cp !== $.EOF) { cp = preprocessor.advance(); }
 * console.log(processor.html);
*/
export default class Processor {
  html = "";
  pos = -1;
  line = 1;
  lastChunk = false;
  endOfChunkHit = false;
  lineStartPos = 0;
  bufferWaterline = 1 << 16;
  droppedBufferSize = 0;
  lastErrOffset = -1;

  _lastGapPos = -2;
  _lineStartPos = 0;
  _gapStack = [];
  _skipNextNewLine = false;
  _isEol = false;
  _handler = {};

  constructor(handler) {
    this._handler = handler;
  }

  get col() {
    return (
      this.pos - this._lineStartPos + Number(this._lastGapPos !== this.pos)
    );
  }
  get offset() {
    return this.droppedBufferSize + this.pos;
  }

  write(chunk, isLastChunk) {
    if (this.html.length > 0) {
      this.html += chunk;
    } else {
      this.html += chunk;
    }
    this.endOfChunkHit = false;
    this.lastChunk = isLastChunk;
  }
  getError(code, cpOffset) {
    const { line, col, offset } = this;
    const startCol = col + cpOffset;
    const startOffset = offset + cpOffset;
    return {
      code,
      startLine: line,
      endLine: line,
      startCol,
      endCol: startCol,
      startOffset,
      endOffset: startOffset,
    };
  }
  willDropParsedChunk() {
    return this.pos > this.bufferWaterline;
  }
  dropParsedChunk() {
    if (this.willDropParsedChunk()) {
      this.html = this.html.substring(this.pos);
      this._lineStartPos -= this.pos;
      this.droppedBufferSize += this.pos;
      this.pos = 0;
      this._lastGapPos = -2;
      this._gapStack.length = 0;
    }
  }
  insertHtmlAtCurrentPos(chunk) {
    this.html =
      this.html.substring(0, this.pos + 1) +
      chunk +
      this.html.substring(this.pos + 1);
    this.endOfChunkHit = false;
  }
  startsWith(pattern, caseSensitive) {
    if (this.pos + pattern.length > this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return false;
    }
    if (caseSensitive) {
      return this.html.startsWith(pattern, this.pos);
    }
    for (let i = 0; i < pattern.length; i++) {
      const cp = this.html.charCodeAt(this.pos + i) | 0x20;
      if (cp !== pattern.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }
  peek(offset) {
    const pos = this.pos + offset;
    if (pos >= this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return $.EOF;
    }
    const code = this.html.charCodeAt(pos);
    return code === $.CARRIAGE_RETURN ? $.LINE_FEED : code;
  }
  advance() {
    this.pos++;
    if (this._isEol) {
      this._isEol = false;
      this.line++;
      this._lineStartPos = this.pos;
    }
    // 如果到字符结尾
    if (this.pos >= this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return $.EOF;
    }
    let cp = this.html.charCodeAt(this.pos);
    // 如果是\r
    if (cp === $.CARRIAGE_RETURN) {
      this._isEol = true;
      this._skipNextNewLine = true;
      return $.LINE_FEED;
    }
    // 如果是\n
    if (cp === $.LINE_FEED) {
      this._isEol = true;
      if (this._skipNextNewLine) {
        this.line--;
        this._skipNextNewLine = false;
        this._addGap();
        return this.advance();
      }
    }
    this._skipNextNewLine = false;
    // charCodeAt方法用于获取指定索引位置的 UTF-16 码元，但是一些特殊字符如表意文字、某些emoji表情符号等使用两个UTF-16 码元表示
    // 判断当前的cp是否为surrogate的一部分
    if (isSurrogate(cp)) {
      cp = this._processSurrogate(cp);
    }
    const isCommonValidRange =
      this._handler.onParseError === null ||
      (cp > 0x1f && cp < 0x7f) ||
      cp === $.LINE_FEED ||
      cp === $.CARRIAGE_RETURN ||
      (cp > 0x9f && cp < 0xfd_d0);
    if (!isCommonValidRange) {
      this._checkForProblematicCharacters(cp);
    }
    return cp;
  }
  retreat(count) {
    this.pos -= count;
    while (this.pos < this._lastGapPos) {
      this._lastGapPos = this._gapStack.pop();
      this.pos--;
    }
    this._isEol = false;
  }

  _err(code) {
    if (this._handler.onParseError && this.lastErrOffset !== this.offset) {
      this.lastErrOffset = this.offset;
      this._handler.onParseError(this.getError(code, 0));
    }
  }
  _addGap() {
    this._gapStack.push(this._lastGapPos);
    this._lastGapPos = this.pos;
  }
  _processSurrogate(cp) {
    if (this.pos !== this.html.length - 1) {
      const nextCp = this.html.charCodeAt(this.pos + 1);
      if (isSurrogatePair(nextCp)) {
        this.pos++;
        this._addGap();
        return getSurrogatePairCodePoint(cp, nextCp);
      }
    } else if (!this.lastChunkWritten) {
      this.endOfChunkHit = true;
      return $.EOF;
    }
    this._err(Err.surrogateInInputStream);
    return cp;
  }
  _checkForProblematicCharacters(cp) {
    if (isControlCodePoint(cp)) {
      this._err(Err.controlCharacterInInputStream);
    } else if (isUndefinedCodePoint(cp)) {
      this._err(Err.noncharacterInInputStream);
    }
  }
}
