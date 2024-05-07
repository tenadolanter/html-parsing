import {
  CODE_POINTS as $,
  isSurrogate,
  isUndefinedCodePoint,
  isControlCodePoint,
} from "./unicode.js";
import { Err } from "./error.js";

export const State = {
  DATA: "DATA",
  RCDATA: "RCDATA",
  RAWTEXT: "RAWTEXT",
  SCRIPT_DATA: "SCRIPT_DATA",
  PLAINTEXT: "PLAINTEXT",
  TAG_OPEN: "TAG_OPEN",
  END_TAG_OPEN: "END_TAG_OPEN",
  TAG_NAME: "TAG_NAME",
  RCDATA_LESS_THAN_SIGN: "RCDATA_LESS_THAN_SIGN",
  RCDATA_END_TAG_OPEN: "RCDATA_END_TAG_OPEN",
  RCDATA_END_TAG_NAME: "RCDATA_END_TAG_NAME",
  RAWTEXT_LESS_THAN_SIGN: "RAWTEXT_LESS_THAN_SIGN",
  RAWTEXT_END_TAG_OPEN: "RAWTEXT_END_TAG_OPEN",
  RAWTEXT_END_TAG_NAME: "RAWTEXT_END_TAG_NAME",
  SCRIPT_DATA_LESS_THAN_SIGN: "SCRIPT_DATA_LESS_THAN_SIGN",
  SCRIPT_DATA_END_TAG_OPEN: "SCRIPT_DATA_END_TAG_OPEN",
  SCRIPT_DATA_END_TAG_NAME: "SCRIPT_DATA_END_TAG_NAME",
  SCRIPT_DATA_ESCAPE_START: "SCRIPT_DATA_ESCAPE_START",
  SCRIPT_DATA_ESCAPE_START_DASH: "SCRIPT_DATA_ESCAPE_START_DASH",
  SCRIPT_DATA_ESCAPED: "SCRIPT_DATA_ESCAPED",
  SCRIPT_DATA_ESCAPED_DASH: "SCRIPT_DATA_ESCAPED_DASH",
  SCRIPT_DATA_ESCAPED_DASH_DASH: "SCRIPT_DATA_ESCAPED_DASH_DASH",
  SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN: "SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN",
  SCRIPT_DATA_ESCAPED_END_TAG_OPEN: "SCRIPT_DATA_ESCAPED_END_TAG_OPEN",
  SCRIPT_DATA_ESCAPED_END_TAG_NAME: "SCRIPT_DATA_ESCAPED_END_TAG_NAME",
  SCRIPT_DATA_DOUBLE_ESCAPE_START: "SCRIPT_DATA_DOUBLE_ESCAPE_START",
  SCRIPT_DATA_DOUBLE_ESCAPED: "SCRIPT_DATA_DOUBLE_ESCAPED",
  SCRIPT_DATA_DOUBLE_ESCAPED_DASH: "SCRIPT_DATA_DOUBLE_ESCAPED_DASH",
  SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH: "SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH",
  SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN:
    "SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN",
  SCRIPT_DATA_DOUBLE_ESCAPE_END: "SCRIPT_DATA_DOUBLE_ESCAPE_END",
  BEFORE_ATTRIBUTE_NAME: "BEFORE_ATTRIBUTE_NAME",
  ATTRIBUTE_NAME: "ATTRIBUTE_NAME",
  AFTER_ATTRIBUTE_NAME: "AFTER_ATTRIBUTE_NAME",
  BEFORE_ATTRIBUTE_VALUE: "BEFORE_ATTRIBUTE_VALUE",
  ATTRIBUTE_VALUE_DOUBLE_QUOTED: "ATTRIBUTE_VALUE_DOUBLE_QUOTED",
  ATTRIBUTE_VALUE_SINGLE_QUOTED: "ATTRIBUTE_VALUE_SINGLE_QUOTED",
  ATTRIBUTE_VALUE_UNQUOTED: "ATTRIBUTE_VALUE_UNQUOTED",
  AFTER_ATTRIBUTE_VALUE_QUOTED: "AFTER_ATTRIBUTE_VALUE_QUOTED",
  SELF_CLOSING_START_TAG: "SELF_CLOSING_START_TAG",
  BOGUS_COMMENT: "BOGUS_COMMENT",
  MARKUP_DECLARATION_OPEN: "MARKUP_DECLARATION_OPEN",
  COMMENT_START: "COMMENT_START",
  COMMENT_START_DASH: "COMMENT_START_DASH",
  COMMENT: "COMMENT",
  COMMENT_LESS_THAN_SIGN: "COMMENT_LESS_THAN_SIGN",
  COMMENT_LESS_THAN_SIGN_BANG: "COMMENT_LESS_THAN_SIGN_BANG",
  COMMENT_LESS_THAN_SIGN_BANG_DASH: "COMMENT_LESS_THAN_SIGN_BANG_DASH",
  COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH:
    "COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH",
  COMMENT_END_DASH: "COMMENT_END_DASH",
  COMMENT_END: "COMMENT_END",
  COMMENT_END_BANG: "COMMENT_END_BANG",
  DOCTYPE: "DOCTYPE",
  BEFORE_DOCTYPE_NAME: "BEFORE_DOCTYPE_NAME",
  DOCTYPE_NAME: "DOCTYPE_NAME",
  AFTER_DOCTYPE_NAME: "AFTER_DOCTYPE_NAME",
  AFTER_DOCTYPE_PUBLIC_KEYWORD: "AFTER_DOCTYPE_PUBLIC_KEYWORD",
  BEFORE_DOCTYPE_PUBLIC_IDENTIFIER: "BEFORE_DOCTYPE_PUBLIC_IDENTIFIER",
  DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED:
    "DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED",
  DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED:
    "DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED",
  AFTER_DOCTYPE_PUBLIC_IDENTIFIER: "AFTER_DOCTYPE_PUBLIC_IDENTIFIER",
  BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS:
    "BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS",
  AFTER_DOCTYPE_SYSTEM_KEYWORD: "AFTER_DOCTYPE_SYSTEM_KEYWORD",
  BEFORE_DOCTYPE_SYSTEM_IDENTIFIER: "BEFORE_DOCTYPE_SYSTEM_IDENTIFIER",
  DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED:
    "DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED",
  DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED:
    "DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED",
  AFTER_DOCTYPE_SYSTEM_IDENTIFIER: "AFTER_DOCTYPE_SYSTEM_IDENTIFIER",
  BOGUS_DOCTYPE: "BOGUS_DOCTYPE",
  CDATA_SECTION: "CDATA_SECTION",
  CDATA_SECTION_BRACKET: "CDATA_SECTION_BRACKET",
  CDATA_SECTION_END: "CDATA_SECTION_END",
  CHARACTER_REFERENCE: "CHARACTER_REFERENCE",
  AMBIGUOUS_AMPERSAND: "AMBIGUOUS_AMPERSAND",
};

export const TokenType = {
  CHARACTER: "CHARACTER",
  NULL_CHARACTER: "NULL_CHARACTER",
  WHITESPACE_CHARACTER: "WHITESPACE_CHARACTER",
  START_TAG: "START_TAG",
  END_TAG: "END_TAG",
  COMMENT: "COMMENT",
  DOCTYPE: "DOCTYPE",
  EOF: "EOF",
  HIBERNATION: "HIBERNATION",
};

export const isAsciiUpper = (cp) => {
  return cp >= $.LATIN_CAPITAL_A && cp <= $.LATIN_CAPITAL_Z;
};

export const isAsciiLower = (cp) => {
  return cp >= $.LATIN_SMALL_A && cp <= $.LATIN_SMALL_Z;
};

export const isAsciiLetter = (cp) => {
  return isAsciiLower(cp) || isAsciiUpper(cp);
};

export const isAsciiAlphaNumeric = (cp) => {
  return isAsciiLetter(cp) || isAsciiDigit(cp);
};

export const toAsciiLower = (cp) => {
  return cp + 0x00_20;
};

export const isWhitespace = (cp) => {
  return (
    cp === $.SPACE ||
    cp === $.LINE_FEED ||
    cp === $.TABULATION ||
    cp === $.FORM_FEED
  );
};

export const isScriptDataDoubleEscapeSequenceEnd = (cp) => {
  return isWhitespace(cp) || cp === $.SOLIDUS || cp === $.GREATER_THAN_SIGN;
};

export const getErrorForNumericCharacterReference = (code) => {
  if (code === $.NULL) {
    return Err.nullCharacterReference;
  } else if (code > 0x10_ff_ff) {
    return Err.characterReferenceOutsideUnicodeRange;
  } else if (isSurrogate(code)) {
    return Err.surrogateCharacterReference;
  } else if (isUndefinedCodePoint(code)) {
    return Err.noncharacterCharacterReference;
  } else if (isControlCodePoint(code) || code === $.CARRIAGE_RETURN) {
    return Err.controlCharacterReference;
  }
  return null;
};

export const getTokenAttr = (token, attrName) => {
  for (let i = token.attrs.length - 1; i >= 0; i--) {
    if (token.attrs[i].name === attrName) {
      return token.attrs[i].value;
    }
  }
  return null;
};
