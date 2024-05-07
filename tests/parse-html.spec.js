const chai = require("chai");
const assert = chai.assert;
const { Parse, ParserOption, Serialize }  = require("../lib/index.umd.js");

describe("解析html", () => {
  it("能正确的解析html", () => {
    let sourceCode = '<!DOCTYPE html><html><head></head><body>Hi there!</body></html>';
    const option = {
      ...ParserOption,
    }
    const ast = Parse(sourceCode, option);
    const code = Serialize(ast, option);
    assert.equal(sourceCode, code);
  })
})
