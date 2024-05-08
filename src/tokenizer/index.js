import {
  htmlDecodeTree,
  EntityDecoder,
  DecodingMode,
} from "entities/lib/decode.js";
import Processor from "./processor.js";
import {
  isAsciiUpper,
  isAsciiLetter,
  isAsciiAlphaNumeric,
  toAsciiLower,
  isWhitespace,
  isScriptDataDoubleEscapeSequenceEnd,
  getErrorForNumericCharacterReference,
  TokenType,
  State,
  Err,
  CODE_POINTS as $,
  SEQUENCES as $$,
  TAG_ID,
  getTagID,
  getTokenAttr,
} from "../common/index.js";

export const TokenizerMode = {
  DATA: State.DATA,
  RCDATA: State.RCDATA,
  RAWTEXT: State.RAWTEXT,
  SCRIPT_DATA: State.SCRIPT_DATA,
  PLAINTEXT: State.PLAINTEXT,
  CDATA_SECTION: State.CDATA_SECTION,
};
export default class Tokenizer {
  preprocessor;
  paused = false;
  inLoop = false;
  inForeignNode = false;
  lastStartTagName = "";
  active = false;
  state = State.DATA;
  returnState = State.DATA;
  entityDecoder;
  entityStartPos = 0;
  consumedAfterSnapshot = -1;
  currentLocation;
  currentCharacterToken = null;
  currentToken = null;
  currentAttr = { name: "", value: "" };

  constructor(options, handler) {
    this.options = options;
    this.handler = handler;
    this.preprocessor = new Processor(handler);
    this.currentLocation = this.getCurrentLocation(-1);
    this.entityDecoder = new EntityDecoder(
      htmlDecodeTree,
      (cp, consumed) => {
        this.preprocessor.pos = this.entityStartPos + consumed - 1;
        this._flushCodePointConsumedAsCharacterReference(cp);
      },
      handler.onParseError
        ? {
            missingSemicolonAfterCharacterReference: () => {
              this._err(Err.missingSemicolonAfterCharacterReference, 1);
            },
            absenceOfDigitsInNumericCharacterReference: (consumed) => {
              this._err(
                Err.absenceOfDigitsInNumericCharacterReference,
                this.entityStartPos - this.preprocessor.pos + consumed
              );
            },
            validateNumericCharacterReference: (code) => {
              const error = getErrorForNumericCharacterReference(code);
              if (error) this._err(error, 1);
            },
          }
        : undefined
    );
  }

  getCurrentLocation(offset) {
    if (!this.options.sourceCodeLocationInfo) {
      return null;
    }
    return {
      startLine: this.preprocessor.line,
      startCol: this.preprocessor.col - offset,
      startOffset: this.preprocessor.offset - offset,
      endLine: -1,
      endCol: -1,
      endOffset: -1,
    };
  }
  // 将html字符串传入解析器中进行解析
  write(chunk, isLastChunk, writeCallback) {
    this.active = true;
    this.preprocessor.write(chunk, isLastChunk);
    this._runParsingLoop();
    if (!this.paused) {
      writeCallback?.();
    }
  }
  pause() {
    this.paused = true;
  }
  resume(writeCallback) {
    if (!this.paused) {
      throw new Error("Parser was already resumed");
    }
    this.paused = false;
    if (this.inLoop) return;
    this._runParsingLoop();
    if (!this.paused) {
      writeCallback?.();
    }
  }

  insertHtmlAtCurrentPos(chunk) {
    this.active = true;
    this.preprocessor.insertHtmlAtCurrentPos(chunk);
    this._runParsingLoop();
  }

  _err(code, cpOffset = 0) {
    this.handler.onParseError?.(this.preprocessor.getError(code, cpOffset));
  }
  _runParsingLoop() {
    if (this.inLoop) return;
    this.inLoop = true;
    while (this.active && !this.paused) {
      this.consumedAfterSnapshot = 0;
      const cp = this._consume();
      if (!this._ensureHibernation()) {
        this._callState(cp);
      }
    }
    this.inLoop = false;
  }
  _ensureHibernation() {
    if (this.preprocessor.endOfChunkHit) {
      this.preprocessor.retreat(this.consumedAfterSnapshot);
      this.consumedAfterSnapshot = 0;
      this.active = false;

      return true;
    }

    return false;
  }
  _consume() {
    this.consumedAfterSnapshot++;
    return this.preprocessor.advance();
  }
  _advanceBy(count) {
    this.consumedAfterSnapshot += count;
    for (let i = 0; i < count; i++) {
      this.preprocessor.advance();
    }
  }
  _consumeSequenceIfMatch(pattern, caseSensitive) {
    if (this.preprocessor.startsWith(pattern, caseSensitive)) {
      this._advanceBy(pattern.length - 1);
      return true;
    }
    return false;
  }

  _createStartTagToken() {
    this.currentToken = {
      type: TokenType.START_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: false,
      ackSelfClosing: false,
      attrs: [],
      location: this.getCurrentLocation(1),
    };
  }
  _createEndTagToken() {
    this.currentToken = {
      type: TokenType.END_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: false,
      ackSelfClosing: false,
      attrs: [],
      location: this.getCurrentLocation(2),
    };
  }

  _createCommentToken(offset) {
    this.currentToken = {
      type: TokenType.COMMENT,
      data: "",
      location: this.getCurrentLocation(offset),
    };
  }

  _createDoctypeToken(initialName) {
    this.currentToken = {
      type: TokenType.DOCTYPE,
      name: initialName,
      forceQuirks: false,
      publicId: null,
      systemId: null,
      location: this.currentLocation,
    };
  }

  _createCharacterToken(type, chars) {
    this.currentCharacterToken = {
      type,
      chars,
      location: this.currentLocation,
    };
  }
  _createAttr(attrNameFirstCh) {
    this.currentAttr = {
      name: attrNameFirstCh,
      value: "",
    };
    this.currentLocation = this.getCurrentLocation(0);
  }
  _leaveAttrName() {
    const token = this.currentToken;

    if (getTokenAttr(token, this.currentAttr.name) === null) {
      token.attrs.push(this.currentAttr);

      if (token.location && this.currentLocation) {
        const attrLocations = (token.location.attrs = (token.location.attrs === null || token.location.attrs === undefined) ?  Object.create(null): token.location.attrs);
        attrLocations[this.currentAttr.name] = this.currentLocation;

        this._leaveAttrValue();
      }
    } else {
      this._err(Err.duplicateAttribute);
    }
  }
  _leaveAttrValue() {
    if (this.currentLocation) {
      this.currentLocation.endLine = this.preprocessor.line;
      this.currentLocation.endCol = this.preprocessor.col;
      this.currentLocation.endOffset = this.preprocessor.offset;
    }
  }

  prepareToken(ct) {
    this._emitCurrentCharacterToken(ct.location);
    this.currentToken = null;

    if (ct.location) {
      ct.location.endLine = this.preprocessor.line;
      ct.location.endCol = this.preprocessor.col + 1;
      ct.location.endOffset = this.preprocessor.offset + 1;
    }

    this.currentLocation = this.getCurrentLocation(-1);
  }
  emitCurrentTagToken() {
    const ct = this.currentToken;

    this.prepareToken(ct);

    ct.tagID = getTagID(ct.tagName);

    if (ct.type === TokenType.START_TAG) {
      this.lastStartTagName = ct.tagName;
      this.handler.onStartTag(ct);
    } else {
      if (ct.attrs.length > 0) {
        this._err(Err.endTagWithAttributes);
      }

      if (ct.selfClosing) {
        this._err(Err.endTagWithTrailingSolidus);
      }

      this.handler.onEndTag(ct);
    }

    this.preprocessor.dropParsedChunk();
  }

  emitCurrentComment(ct) {
    this.prepareToken(ct);
    this.handler.onComment(ct);

    this.preprocessor.dropParsedChunk();
  }

  emitCurrentDoctype(ct) {
    this.prepareToken(ct);
    this.handler.onDoctype(ct);

    this.preprocessor.dropParsedChunk();
  }
  _emitCurrentCharacterToken(nextLocation) {
    if (this.currentCharacterToken) {
      if (nextLocation && this.currentCharacterToken.location) {
        this.currentCharacterToken.location.endLine = nextLocation.startLine;
        this.currentCharacterToken.location.endCol = nextLocation.startCol;
        this.currentCharacterToken.location.endOffset =
          nextLocation.startOffset;
      }

      switch (this.currentCharacterToken.type) {
        case TokenType.CHARACTER: {
          this.handler.onCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.NULL_CHARACTER: {
          this.handler.onNullCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.WHITESPACE_CHARACTER: {
          this.handler.onWhitespaceCharacter(this.currentCharacterToken);
          break;
        }
      }

      this.currentCharacterToken = null;
    }
  }

  _emitEOFToken() {
    const location = this.getCurrentLocation(0);

    if (location) {
      location.endLine = location.startLine;
      location.endCol = location.startCol;
      location.endOffset = location.startOffset;
    }

    this._emitCurrentCharacterToken(location);
    this.handler.onEof({ type: TokenType.EOF, location });
    this.active = false;
  }
  _appendCharToCurrentCharacterToken(type, ch) {
    if (this.currentCharacterToken) {
      if (this.currentCharacterToken.type === type) {
        this.currentCharacterToken.chars += ch;
        return;
      } else {
        this.currentLocation = this.getCurrentLocation(0);
        this._emitCurrentCharacterToken(this.currentLocation);
        this.preprocessor.dropParsedChunk();
      }
    }

    this._createCharacterToken(type, ch);
  }

  _emitCodePoint(cp) {
    const type = isWhitespace(cp)
      ? TokenType.WHITESPACE_CHARACTER
      : cp === $.NULL
      ? TokenType.NULL_CHARACTER
      : TokenType.CHARACTER;

    this._appendCharToCurrentCharacterToken(type, String.fromCodePoint(cp));
  }

  _emitChars(ch) {
    this._appendCharToCurrentCharacterToken(TokenType.CHARACTER, ch);
  }

  _startCharacterReference() {
    this.returnState = this.state;
    this.state = State.CHARACTER_REFERENCE;
    this.entityStartPos = this.preprocessor.pos;
    this.entityDecoder.startEntity(
      this._isCharacterReferenceInAttribute()
        ? DecodingMode.Attribute
        : DecodingMode.Legacy
    );
  }
  _flushCodePointConsumedAsCharacterReference(cp) {
    if (this._isCharacterReferenceInAttribute()) {
      this.currentAttr.value += String.fromCodePoint(cp);
    } else {
      this._emitCodePoint(cp);
    }
  }

  _callState(cp) {
    switch (this.state) {
      case State.DATA: {
        this._stateData(cp);
        break;
      }
      case State.RCDATA: {
        this._stateRcdata(cp);
        break;
      }
      case State.RAWTEXT: {
        this._stateRawtext(cp);
        break;
      }
      case State.SCRIPT_DATA: {
        this._stateScriptData(cp);
        break;
      }
      case State.PLAINTEXT: {
        this._statePlaintext(cp);
        break;
      }
      case State.TAG_OPEN: {
        this._stateTagOpen(cp);
        break;
      }
      case State.END_TAG_OPEN: {
        this._stateEndTagOpen(cp);
        break;
      }
      case State.TAG_NAME: {
        this._stateTagName(cp);
        break;
      }
      case State.RCDATA_LESS_THAN_SIGN: {
        this._stateRcdataLessThanSign(cp);
        break;
      }
      case State.RCDATA_END_TAG_OPEN: {
        this._stateRcdataEndTagOpen(cp);
        break;
      }
      case State.RCDATA_END_TAG_NAME: {
        this._stateRcdataEndTagName(cp);
        break;
      }
      case State.RAWTEXT_LESS_THAN_SIGN: {
        this._stateRawtextLessThanSign(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_OPEN: {
        this._stateRawtextEndTagOpen(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_NAME: {
        this._stateRawtextEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_LESS_THAN_SIGN: {
        this._stateScriptDataLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_OPEN: {
        this._stateScriptDataEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_NAME: {
        this._stateScriptDataEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START: {
        this._stateScriptDataEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START_DASH: {
        this._stateScriptDataEscapeStartDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED: {
        this._stateScriptDataEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH: {
        this._stateScriptDataEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH_DASH: {
        this._stateScriptDataEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN: {
        this._stateScriptDataEscapedEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_NAME: {
        this._stateScriptDataEscapedEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_START: {
        this._stateScriptDataDoubleEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED: {
        this._stateScriptDataDoubleEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH: {
        this._stateScriptDataDoubleEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH: {
        this._stateScriptDataDoubleEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataDoubleEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_END: {
        this._stateScriptDataDoubleEscapeEnd(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_NAME: {
        this._stateBeforeAttributeName(cp);
        break;
      }
      case State.ATTRIBUTE_NAME: {
        this._stateAttributeName(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_NAME: {
        this._stateAfterAttributeName(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_VALUE: {
        this._stateBeforeAttributeValue(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_DOUBLE_QUOTED: {
        this._stateAttributeValueDoubleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_SINGLE_QUOTED: {
        this._stateAttributeValueSingleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_UNQUOTED: {
        this._stateAttributeValueUnquoted(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_VALUE_QUOTED: {
        this._stateAfterAttributeValueQuoted(cp);
        break;
      }
      case State.SELF_CLOSING_START_TAG: {
        this._stateSelfClosingStartTag(cp);
        break;
      }
      case State.BOGUS_COMMENT: {
        this._stateBogusComment(cp);
        break;
      }
      case State.MARKUP_DECLARATION_OPEN: {
        this._stateMarkupDeclarationOpen(cp);
        break;
      }
      case State.COMMENT_START: {
        this._stateCommentStart(cp);
        break;
      }
      case State.COMMENT_START_DASH: {
        this._stateCommentStartDash(cp);
        break;
      }
      case State.COMMENT: {
        this._stateComment(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN: {
        this._stateCommentLessThanSign(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG: {
        this._stateCommentLessThanSignBang(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH: {
        this._stateCommentLessThanSignBangDash(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH: {
        this._stateCommentLessThanSignBangDashDash(cp);
        break;
      }
      case State.COMMENT_END_DASH: {
        this._stateCommentEndDash(cp);
        break;
      }
      case State.COMMENT_END: {
        this._stateCommentEnd(cp);
        break;
      }
      case State.COMMENT_END_BANG: {
        this._stateCommentEndBang(cp);
        break;
      }
      case State.DOCTYPE: {
        this._stateDoctype(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_NAME: {
        this._stateBeforeDoctypeName(cp);
        break;
      }
      case State.DOCTYPE_NAME: {
        this._stateDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_NAME: {
        this._stateAfterDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_KEYWORD: {
        this._stateAfterDoctypePublicKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateBeforeDoctypePublicIdentifier(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypePublicIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypePublicIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateAfterDoctypePublicIdentifier(cp);
        break;
      }
      case State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS: {
        this._stateBetweenDoctypePublicAndSystemIdentifiers(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_KEYWORD: {
        this._stateAfterDoctypeSystemKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateBeforeDoctypeSystemIdentifier(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypeSystemIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypeSystemIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateAfterDoctypeSystemIdentifier(cp);
        break;
      }
      case State.BOGUS_DOCTYPE: {
        this._stateBogusDoctype(cp);
        break;
      }
      case State.CDATA_SECTION: {
        this._stateCdataSection(cp);
        break;
      }
      case State.CDATA_SECTION_BRACKET: {
        this._stateCdataSectionBracket(cp);
        break;
      }
      case State.CDATA_SECTION_END: {
        this._stateCdataSectionEnd(cp);
        break;
      }
      case State.CHARACTER_REFERENCE: {
        this._stateCharacterReference();
        break;
      }
      case State.AMBIGUOUS_AMPERSAND: {
        this._stateAmbiguousAmpersand(cp);
        break;
      }
      default: {
        throw new Error("Unknown state");
      }
    }
  }

  _stateData(cp) {
    switch (cp) {
      case $.LESS_THAN_SIGN: {
        this.state = State.TAG_OPEN;
        break;
      }
      case $.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this._emitCodePoint(cp);
        break;
      }
      case $.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _stateRcdata(cp) {
    switch (cp) {
      case $.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case $.LESS_THAN_SIGN: {
        this.state = State.RCDATA_LESS_THAN_SIGN;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _stateRawtext(cp) {
    switch (cp) {
      case $.LESS_THAN_SIGN: {
        this.state = State.RAWTEXT_LESS_THAN_SIGN;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _stateScriptData(cp) {
    switch (cp) {
      case $.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_LESS_THAN_SIGN;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _statePlaintext(cp) {
    switch (cp) {
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _stateTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this._createStartTagToken();
      this.state = State.TAG_NAME;
      this._stateTagName(cp);
    } else
      switch (cp) {
        case $.EXCLAMATION_MARK: {
          this.state = State.MARKUP_DECLARATION_OPEN;
          break;
        }
        case $.SOLIDUS: {
          this.state = State.END_TAG_OPEN;
          break;
        }
        case $.QUESTION_MARK: {
          this._err(Err.unexpectedQuestionMarkInsteadOfTagName);
          this._createCommentToken(1);
          this.state = State.BOGUS_COMMENT;
          this._stateBogusComment(cp);
          break;
        }
        case $.EOF: {
          this._err(Err.eofBeforeTagName);
          this._emitChars("<");
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(Err.invalidFirstCharacterOfTagName);
          this._emitChars("<");
          this.state = State.DATA;
          this._stateData(cp);
        }
      }
  }

  _stateEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this._createEndTagToken();
      this.state = State.TAG_NAME;
      this._stateTagName(cp);
    } else
      switch (cp) {
        case $.GREATER_THAN_SIGN: {
          this._err(Err.missingEndTagName);
          this.state = State.DATA;
          break;
        }
        case $.EOF: {
          this._err(Err.eofBeforeTagName);
          this._emitChars("</");
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(Err.invalidFirstCharacterOfTagName);
          this._createCommentToken(2);
          this.state = State.BOGUS_COMMENT;
          this._stateBogusComment(cp);
        }
      }
  }

  _stateTagName(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case $.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.tagName += REPLACEMENT_CHARACTER;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        const { uppercaseTagEnabled } = this.options;
        token.tagName += String.fromCodePoint(
          isAsciiUpper(cp) && !uppercaseTagEnabled ? toAsciiLower(cp) : cp
        );
      }
    }
  }

  _stateRcdataLessThanSign(cp) {
    if (cp === $.SOLIDUS) {
      this.state = State.RCDATA_END_TAG_OPEN;
    } else {
      this._emitChars("<");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }

  _stateRcdataEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.RCDATA_END_TAG_NAME;
      this._stateRcdataEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }

  handleSpecialEndTag(_cp) {
    if (!this.preprocessor.startsWith(this.lastStartTagName, false)) {
      return !this._ensureHibernation();
    }

    this._createEndTagToken();
    const token = this.currentToken;
    token.tagName = this.lastStartTagName;

    const cp = this.preprocessor.peek(this.lastStartTagName.length);

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this._advanceBy(this.lastStartTagName.length);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        return false;
      }
      case $.SOLIDUS: {
        this._advanceBy(this.lastStartTagName.length);
        this.state = State.SELF_CLOSING_START_TAG;
        return false;
      }
      case $.GREATER_THAN_SIGN: {
        this._advanceBy(this.lastStartTagName.length);
        this.emitCurrentTagToken();
        this.state = State.DATA;
        return false;
      }
      default: {
        return !this._ensureHibernation();
      }
    }
  }

  _stateRcdataEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }

  _stateRawtextLessThanSign(cp) {
    if (cp === $.SOLIDUS) {
      this.state = State.RAWTEXT_END_TAG_OPEN;
    } else {
      this._emitChars("<");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }

  _stateRawtextEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.RAWTEXT_END_TAG_NAME;
      this._stateRawtextEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }

  _stateRawtextEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }

  _stateScriptDataLessThanSign(cp) {
    switch (cp) {
      case $.SOLIDUS: {
        this.state = State.SCRIPT_DATA_END_TAG_OPEN;
        break;
      }
      case $.EXCLAMATION_MARK: {
        this.state = State.SCRIPT_DATA_ESCAPE_START;
        this._emitChars("<!");
        break;
      }
      default: {
        this._emitChars("<");
        this.state = State.SCRIPT_DATA;
        this._stateScriptData(cp);
      }
    }
  }

  _stateScriptDataEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.SCRIPT_DATA_END_TAG_NAME;
      this._stateScriptDataEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }

  _stateScriptDataEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }

  _stateScriptDataEscapeStart(cp) {
    if (cp === $.HYPHEN_MINUS) {
      this.state = State.SCRIPT_DATA_ESCAPE_START_DASH;
      this._emitChars("-");
    } else {
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }

  _stateScriptDataEscapeStartDash(cp) {
    if (cp === $.HYPHEN_MINUS) {
      this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
      this._emitChars("-");
    } else {
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }

  _stateScriptDataEscaped(cp) {
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH;
        this._emitChars("-");
        break;
      }
      case $.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _stateScriptDataEscapedDash(cp) {
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
        this._emitChars("-");
        break;
      }
      case $.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }

  _stateScriptDataEscapedDashDash(cp) {
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case $.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA;
        this._emitChars(">");
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }

  _stateScriptDataEscapedLessThanSign(cp) {
    if (cp === $.SOLIDUS) {
      this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN;
    } else if (isAsciiLetter(cp)) {
      this._emitChars("<");
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_START;
      this._stateScriptDataDoubleEscapeStart(cp);
    } else {
      this._emitChars("<");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }

  _stateScriptDataEscapedEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_NAME;
      this._stateScriptDataEscapedEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }

  _stateScriptDataEscapedEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }

  _stateScriptDataDoubleEscapeStart(cp) {
    if (
      this.preprocessor.startsWith($$.SCRIPT, false) &&
      isScriptDataDoubleEscapeSequenceEnd(
        this.preprocessor.peek($$.SCRIPT.length)
      )
    ) {
      this._emitCodePoint(cp);
      for (let i = 0; i < $$.SCRIPT.length; i++) {
        this._emitCodePoint(this._consume());
      }

      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
    } else if (!this._ensureHibernation()) {
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }

  _stateScriptDataDoubleEscaped(cp) {
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH;
        this._emitChars("-");
        break;
      }
      case $.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _stateScriptDataDoubleEscapedDash(cp) {
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH;
        this._emitChars("-");
        break;
      }
      case $.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }

  _stateScriptDataDoubleEscapedDashDash(cp) {
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case $.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA;
        this._emitChars(">");
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }

  _stateScriptDataDoubleEscapedLessThanSign(cp) {
    if (cp === $.SOLIDUS) {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_END;
      this._emitChars("/");
    } else {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
      this._stateScriptDataDoubleEscaped(cp);
    }
  }

  _stateScriptDataDoubleEscapeEnd(cp) {
    if (
      this.preprocessor.startsWith($$.SCRIPT, false) &&
      isScriptDataDoubleEscapeSequenceEnd(
        this.preprocessor.peek($$.SCRIPT.length)
      )
    ) {
      this._emitCodePoint(cp);
      for (let i = 0; i < $$.SCRIPT.length; i++) {
        this._emitCodePoint(this._consume());
      }

      this.state = State.SCRIPT_DATA_ESCAPED;
    } else if (!this._ensureHibernation()) {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
      this._stateScriptDataDoubleEscaped(cp);
    }
  }

  _stateBeforeAttributeName(cp) {
    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.SOLIDUS:
      case $.GREATER_THAN_SIGN:
      case $.EOF: {
        this.state = State.AFTER_ATTRIBUTE_NAME;
        this._stateAfterAttributeName(cp);
        break;
      }
      case $.EQUALS_SIGN: {
        this._err(Err.unexpectedEqualsSignBeforeAttributeName);
        this._createAttr("=");
        this.state = State.ATTRIBUTE_NAME;
        break;
      }
      default: {
        this._createAttr("");
        this.state = State.ATTRIBUTE_NAME;
        this._stateAttributeName(cp);
      }
    }
  }

  _stateAttributeName(cp) {
    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED:
      case $.SOLIDUS:
      case $.GREATER_THAN_SIGN:
      case $.EOF: {
        this._leaveAttrName();
        this.state = State.AFTER_ATTRIBUTE_NAME;
        this._stateAfterAttributeName(cp);
        break;
      }
      case $.EQUALS_SIGN: {
        this._leaveAttrName();
        this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case $.QUOTATION_MARK:
      case $.APOSTROPHE:
      case $.LESS_THAN_SIGN: {
        this._err(Err.unexpectedCharacterInAttributeName);
        this.currentAttr.name += String.fromCodePoint(cp);
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.currentAttr.name += REPLACEMENT_CHARACTER;
        break;
      }
      default: {
        const { uppercaseAttrEnabled } = this.options;
        this.currentAttr.name += String.fromCodePoint(
          isAsciiUpper(cp) && !uppercaseAttrEnabled ? toAsciiLower(cp) : cp
        );
      }
    }
  }

  _stateAfterAttributeName(cp) {
    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case $.EQUALS_SIGN: {
        this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case $.EOF: {
        this._err(Err.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._createAttr("");
        this.state = State.ATTRIBUTE_NAME;
        this._stateAttributeName(cp);
      }
    }
  }

  _stateBeforeAttributeValue(cp) {
    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.QUOTATION_MARK: {
        this.state = State.ATTRIBUTE_VALUE_DOUBLE_QUOTED;
        break;
      }
      case $.APOSTROPHE: {
        this.state = State.ATTRIBUTE_VALUE_SINGLE_QUOTED;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.missingAttributeValue);
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      default: {
        this.state = State.ATTRIBUTE_VALUE_UNQUOTED;
        this._stateAttributeValueUnquoted(cp);
      }
    }
  }

  _stateAttributeValueDoubleQuoted(cp) {
    switch (cp) {
      case $.QUOTATION_MARK: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case $.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }

  _stateAttributeValueSingleQuoted(cp) {
    switch (cp) {
      case $.APOSTROPHE: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case $.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }

  _stateAttributeValueUnquoted(cp) {
    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this._leaveAttrValue();
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case $.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._leaveAttrValue();
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case $.QUOTATION_MARK:
      case $.APOSTROPHE:
      case $.LESS_THAN_SIGN:
      case $.EQUALS_SIGN:
      case $.GRAVE_ACCENT: {
        this._err(Err.unexpectedCharacterInUnquotedAttributeValue);
        this.currentAttr.value += String.fromCodePoint(cp);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }

  _stateAfterAttributeValueQuoted(cp) {
    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this._leaveAttrValue();
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case $.SOLIDUS: {
        this._leaveAttrValue();
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._leaveAttrValue();
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case $.EOF: {
        this._err(Err.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingWhitespaceBetweenAttributes);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        this._stateBeforeAttributeName(cp);
      }
    }
  }

  _stateSelfClosingStartTag(cp) {
    switch (cp) {
      case $.GREATER_THAN_SIGN: {
        const token = this.currentToken;
        token.selfClosing = true;
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case $.EOF: {
        this._err(Err.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.unexpectedSolidusInTag);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        this._stateBeforeAttributeName(cp);
      }
    }
  }

  _stateBogusComment(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case $.EOF: {
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.data += REPLACEMENT_CHARACTER;
        break;
      }
      default: {
        token.data += String.fromCodePoint(cp);
      }
    }
  }

  _stateMarkupDeclarationOpen(cp) {
    if (this._consumeSequenceIfMatch($$.DASH_DASH, true)) {
      this._createCommentToken($$.DASH_DASH.length + 1);
      this.state = State.COMMENT_START;
    } else if (this._consumeSequenceIfMatch($$.DOCTYPE, false)) {
      this.currentLocation = this.getCurrentLocation($$.DOCTYPE.length + 1);
      this.state = State.DOCTYPE;
    } else if (this._consumeSequenceIfMatch($$.CDATA_START, true)) {
      if (this.inForeignNode) {
        this.state = State.CDATA_SECTION;
      } else {
        this._err(Err.cdataInHtmlContent);
        this._createCommentToken($$.CDATA_START.length + 1);
        this.currentToken.data = "[CDATA[";
        this.state = State.BOGUS_COMMENT;
      }
    } else if (!this._ensureHibernation()) {
      this._err(Err.incorrectlyOpenedComment);
      this._createCommentToken(2);
      this.state = State.BOGUS_COMMENT;
      this._stateBogusComment(cp);
    }
  }

  _stateCommentStart(cp) {
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.COMMENT_START_DASH;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.abruptClosingOfEmptyComment);
        this.state = State.DATA;
        const token = this.currentToken;
        this.emitCurrentComment(token);
        break;
      }
      default: {
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }

  _stateCommentStartDash(cp) {
    const token = this.currentToken;
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.abruptClosingOfEmptyComment);
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "-";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }

  _stateComment(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.COMMENT_END_DASH;
        break;
      }
      case $.LESS_THAN_SIGN: {
        token.data += "<";
        this.state = State.COMMENT_LESS_THAN_SIGN;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.data += REPLACEMENT_CHARACTER;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += String.fromCodePoint(cp);
      }
    }
  }

  _stateCommentLessThanSign(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.EXCLAMATION_MARK: {
        token.data += "!";
        this.state = State.COMMENT_LESS_THAN_SIGN_BANG;
        break;
      }
      case $.LESS_THAN_SIGN: {
        token.data += "<";
        break;
      }
      default: {
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }

  _stateCommentLessThanSignBang(cp) {
    if (cp === $.HYPHEN_MINUS) {
      this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH;
    } else {
      this.state = State.COMMENT;
      this._stateComment(cp);
    }
  }

  _stateCommentLessThanSignBangDash(cp) {
    if (cp === $.HYPHEN_MINUS) {
      this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH;
    } else {
      this.state = State.COMMENT_END_DASH;
      this._stateCommentEndDash(cp);
    }
  }

  _stateCommentLessThanSignBangDashDash(cp) {
    if (cp !== $.GREATER_THAN_SIGN && cp !== $.EOF) {
      this._err(Err.nestedComment);
    }

    this.state = State.COMMENT_END;
    this._stateCommentEnd(cp);
  }

  _stateCommentEndDash(cp) {
    const token = this.currentToken;
    switch (cp) {
      case $.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "-";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }

  _stateCommentEnd(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case $.EXCLAMATION_MARK: {
        this.state = State.COMMENT_END_BANG;
        break;
      }
      case $.HYPHEN_MINUS: {
        token.data += "-";
        break;
      }
      case $.EOF: {
        this._err(Err.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "--";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }

  _stateCommentEndBang(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.HYPHEN_MINUS: {
        token.data += "--!";
        this.state = State.COMMENT_END_DASH;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.incorrectlyClosedComment);
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "--!";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }

  _stateDoctype(cp) {
    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_NAME;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.BEFORE_DOCTYPE_NAME;
        this._stateBeforeDoctypeName(cp);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        this._createDoctypeToken(null);
        const token = this.currentToken;
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingWhitespaceBeforeDoctypeName);
        this.state = State.BEFORE_DOCTYPE_NAME;
        this._stateBeforeDoctypeName(cp);
      }
    }
  }

  _stateBeforeDoctypeName(cp) {
    if (isAsciiUpper(cp)) {
      this._createDoctypeToken(String.fromCharCode(toAsciiLower(cp)));
      this.state = State.DOCTYPE_NAME;
    } else
      switch (cp) {
        case $.SPACE:
        case $.LINE_FEED:
        case $.TABULATION:
        case $.FORM_FEED: {
          break;
        }
        case $.NULL: {
          this._err(Err.unexpectedNullCharacter);
          this._createDoctypeToken(REPLACEMENT_CHARACTER);
          this.state = State.DOCTYPE_NAME;
          break;
        }
        case $.GREATER_THAN_SIGN: {
          this._err(Err.missingDoctypeName);
          this._createDoctypeToken(null);
          const token = this.currentToken;
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case $.EOF: {
          this._err(Err.eofInDoctype);
          this._createDoctypeToken(null);
          const token = this.currentToken;
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._createDoctypeToken(String.fromCodePoint(cp));
          this.state = State.DOCTYPE_NAME;
        }
      }
  }

  _stateDoctypeName(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this.state = State.AFTER_DOCTYPE_NAME;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.name += REPLACEMENT_CHARACTER;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.name += String.fromCodePoint(
          isAsciiUpper(cp) ? toAsciiLower(cp) : cp
        );
      }
    }
  }

  _stateAfterDoctypeName(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        if (this._consumeSequenceIfMatch($$.PUBLIC, false)) {
          this.state = State.AFTER_DOCTYPE_PUBLIC_KEYWORD;
        } else if (this._consumeSequenceIfMatch($$.SYSTEM, false)) {
          this.state = State.AFTER_DOCTYPE_SYSTEM_KEYWORD;
        } else if (!this._ensureHibernation()) {
          this._err(Err.invalidCharacterSequenceAfterDoctypeName);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
  }

  _stateAfterDoctypePublicKeyword(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case $.QUOTATION_MARK: {
        this._err(Err.missingWhitespaceAfterDoctypePublicKeyword);
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case $.APOSTROPHE: {
        this._err(Err.missingWhitespaceAfterDoctypePublicKeyword);
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.missingDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingQuoteBeforeDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }

  _stateBeforeDoctypePublicIdentifier(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.QUOTATION_MARK: {
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case $.APOSTROPHE: {
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.missingDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingQuoteBeforeDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }

  _stateDoctypePublicIdentifierDoubleQuoted(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.abruptDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.publicId += String.fromCodePoint(cp);
      }
    }
  }

  _stateDoctypePublicIdentifierSingleQuoted(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.abruptDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.publicId += String.fromCodePoint(cp);
      }
    }
  }

  _stateAfterDoctypePublicIdentifier(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this.state = State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case $.QUOTATION_MARK: {
        this._err(
          Err.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers
        );
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case $.APOSTROPHE: {
        this._err(
          Err.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers
        );
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }

  _stateBetweenDoctypePublicAndSystemIdentifiers(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case $.QUOTATION_MARK: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case $.APOSTROPHE: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }

  _stateAfterDoctypeSystemKeyword(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case $.QUOTATION_MARK: {
        this._err(Err.missingWhitespaceAfterDoctypeSystemKeyword);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case $.APOSTROPHE: {
        this._err(Err.missingWhitespaceAfterDoctypeSystemKeyword);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.missingDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }

  _stateBeforeDoctypeSystemIdentifier(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.QUOTATION_MARK: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case $.APOSTROPHE: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.missingDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }

  _stateDoctypeSystemIdentifierDoubleQuoted(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.abruptDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.systemId += String.fromCodePoint(cp);
      }
    }
  }

  _stateDoctypeSystemIdentifierSingleQuoted(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this._err(Err.abruptDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.systemId += String.fromCodePoint(cp);
      }
    }
  }

  _stateAfterDoctypeSystemIdentifier(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.SPACE:
      case $.LINE_FEED:
      case $.TABULATION:
      case $.FORM_FEED: {
        break;
      }
      case $.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(Err.unexpectedCharacterAfterDoctypeSystemIdentifier);
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }

  _stateBogusDoctype(cp) {
    const token = this.currentToken;

    switch (cp) {
      case $.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case $.NULL: {
        this._err(Err.unexpectedNullCharacter);
        break;
      }
      case $.EOF: {
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default:
    }
  }

  _stateCdataSection(cp) {
    switch (cp) {
      case $.RIGHT_SQUARE_BRACKET: {
        this.state = State.CDATA_SECTION_BRACKET;
        break;
      }
      case $.EOF: {
        this._err(Err.eofInCdata);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }

  _stateCdataSectionBracket(cp) {
    if (cp === $.RIGHT_SQUARE_BRACKET) {
      this.state = State.CDATA_SECTION_END;
    } else {
      this._emitChars("]");
      this.state = State.CDATA_SECTION;
      this._stateCdataSection(cp);
    }
  }

  _stateCdataSectionEnd(cp) {
    switch (cp) {
      case $.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        break;
      }
      case $.RIGHT_SQUARE_BRACKET: {
        this._emitChars("]");
        break;
      }
      default: {
        this._emitChars("]]");
        this.state = State.CDATA_SECTION;
        this._stateCdataSection(cp);
      }
    }
  }

  _stateCharacterReference() {
    let length = this.entityDecoder.write(
      this.preprocessor.html,
      this.preprocessor.pos
    );
    if (length < 0) {
      if (this.preprocessor.lastChunkWritten) {
        length = this.entityDecoder.end();
      } else {
        this.active = false;

        this.preprocessor.pos = this.preprocessor.html.length - 1;
        this.consumedAfterSnapshot = 0;
        this.preprocessor.endOfChunkHit = true;
        return;
      }
    }
    if (length === 0) {
      this.preprocessor.pos = this.entityStartPos;
      this._flushCodePointConsumedAsCharacterReference($.AMPERSAND);

      this.state =
        !this._isCharacterReferenceInAttribute() &&
        isAsciiAlphaNumeric(this.preprocessor.peek(1))
          ? State.AMBIGUOUS_AMPERSAND
          : this.returnState;
    } else {
      this.state = this.returnState;
    }
  }

  _stateAmbiguousAmpersand(cp) {
    if (isAsciiAlphaNumeric(cp)) {
      this._flushCodePointConsumedAsCharacterReference(cp);
    } else {
      if (cp === $.SEMICOLON) {
        this._err(Err.unknownNamedCharacterReference);
      }
      this.state = this.returnState;
      this._callState(cp);
    }
  }
}
