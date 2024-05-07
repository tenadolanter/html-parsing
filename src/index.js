import Parser from "./parser/index.js";
import Tokenizer, { TokenizerMode } from "./tokenizer/index.js";
import Serialize, { SerializeOuter } from "./serializer/index.js";
import TreeAdapter from "./adapter/index.js";
import ParserOption from "./config.js"
/**
 * 解析html字符串
 *
 */
const Parse = (html, options = {}) => {
  return Parser.parse(html, options);
};

/**
 * 解析html片段
 *
 */
const ParseFragment = (html, options = {}) => {
  const parser = Parser.getFragmentParser(null, options);
  parser.tokenizer.write(html, true);
  return parser.getFragment();
};

export {
  Parse,
  ParseFragment,
  Parser,
  Tokenizer,
  TokenizerMode,
  Serialize,
  SerializeOuter,
  TreeAdapter,
  ParserOption,
};
