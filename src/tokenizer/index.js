
import Processor from "./processor.js"
export class Tokenizer {
  preprocessor;
  constructor(options, ctx) {
    this.preprocessor = new Processor(ctx);
  }

  static write(chunk, isLastChunk) {
    this.preprocessor.write(chunk, isLastChunk);
  }
}

