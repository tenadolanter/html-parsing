export default class Processor {
  html = '';
  pos = -1;
  line = 1;
  lastChunk = false;
  endOfChunkHit = false;
  skipNextNewLine = false;
  lineStartPos = 0;

  _lastGapPos = -2;
  _lineStartPos = 0;

  constructor() {}

  get col(){
    return this.pos - this._lineStartPos + Number(this._lastGapPos !== this.pos);
  }
  get offset(){}

  write(chunk, isLastChunk){
    if(this.html.length > 0) {
      this.html += chunk;
    } else {
      this.html += chunk;
    }
    this.endOfChunkHit = false;
    this.lastChunk = isLastChunk;
  }

}
