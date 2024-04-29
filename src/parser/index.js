
import DefaultOptions from "../config.js"
import { Tokenizer } from "../tokenizer/index.js"
export class Parser {
  adapter;
  options;
  document;
  tokenizer;

  constructor(options, document){
    this.options = {
      ...DefaultOptions,
      ...options,
    }
    this.adapter = this.options.adapter;
    this.document = document ?? this.adapter.createDocument();
    this.tokenizer = new Tokenizer(this.options, this);
  }

  static parse(html, options = {}) {
    const parser = new this(options);
    parser.tokenizer.write(html, true);
    return parser.document;
  }
}